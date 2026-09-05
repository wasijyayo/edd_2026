# VS Code Language Model API の検証（調査/01, #4）

AIコスト戦略は「ユーザー自身のCopilot契約を使う `vscode.lm` API」を第一優先とする前提で組まれている。ここが成立しない場合はProvider優先順位と収益構造ごと見直しになるため、実装（#11 VSCodeLMProvider）に入る前にこの前提を検証した記録。

実装の詳細ではなく、**何を確かめて何が確かめられなかったか**を残すための文書。

---

## 検証環境

- `@types/vscode`: 1.136.0（`package.json` の `engines.vscode` は `^1.90.0`）
- 検証コード: `experiment/issue-4-lm-api` ブランチの使い捨てコマンド `gakushuSochi.debugLmProbe`（mainにはマージしない）

---

## 検証結果

| #   | 項目                                 | 結果                                                                                                                                    |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 応答が実際に返るか                   | **確認できた。** `vscode.lm.selectChatModels()` で取得したモデルに `sendRequest` で送信し、応答テキストを取得できた                     |
| 2   | Copilot契約が必要か                  | **未確認。** 未契約環境を用意できていない                                                                                               |
| 3   | 同意フロー・拒否時の挙動             | **同意時のみ確認、拒否時は未確認。** 一度同意すると、拡張機能ホストをリロードしても同意状態が保持され、同意ダイアログを再現できなかった |
| 4   | レート制限到達時のエラー             | **未確認。** 3と同じ理由で、意図的にエラーを起こす状態を再現できていない                                                                |
| 5   | 利用可能なモデルファミリーの取得方法 | **確認できた。** `vscode.lm.selectChatModels()` で取得する（詳細は下記）                                                                |
| 6   | 利用規約上この用途が許容されるか     | 未確認                                                                                                                                  |
| 7   | Copilot未契約ユーザーの見積もり      | 未確認。チームでの判断材料が必要                                                                                                        |

### 5. `selectChatModels()` の実機結果

検証環境（Copilot契約あり）で `vscode.lm.selectChatModels()` を引数なしで呼ぶと、6件返った。

| vendor     | family                         | id                             | maxInputTokens |
| ---------- | ------------------------------ | ------------------------------ | -------------- |
| copilotcli | （空）                         | auto                           | 0              |
| copilot    | gpt-4o-mini                    | gpt-4o-mini                    | 12078          |
| copilot    | claude-fable-5.1               | auto                           | 935793         |
| copilot    | copilot-utility-small          | copilot-utility-small          | 12078          |
| copilot    | copilot-utility                | copilot-utility                | 271790         |
| copilot    | copilot-dictation-cleanup-luna | copilot-dictation-cleanup-luna | 921793         |

**学び**: 一覧にはチャット用途ではないモデル（`copilotcli/auto`、`copilot-utility*`、`copilot-dictation-cleanup-luna` など）が混ざる。先頭（`models[0]`）を無条件に使うと、`maxInputTokens=0` の `copilotcli/auto` に送ってしまい応答が空になった（実際に発生した）。`family` を指定する、または `maxInputTokens > 0` 等でフィルタする必要がある。

---

## Fallbackが必要になる条件

型定義（`vscode.LanguageModelError` のJSDoc）から言語化できる範囲。3・4が実機で再現できなかったため、**この節は仕様書からの推測を含む。実機での裏付けが取れ次第更新する。**

| 状況                      | 判定方法                                                                                     | `AIErrorReason`（`src/types/ai.ts`）               |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| モデルが1件も取得できない | `selectChatModels()` が空配列                                                                | `model-unavailable`                                |
| 同意が得られない          | `sendRequest` が `LanguageModelError`、`code === LanguageModelError.NoPermissions(...).code` | `consent-denied`                                   |
| レート制限・利用上限      | `sendRequest` が `LanguageModelError`、`code === LanguageModelError.Blocked(...).code`       | `rate-limited`                                     |
| モデルが消失した          | `sendRequest` が `LanguageModelError`、`code === LanguageModelError.NotFound(...).code`      | `unknown`（現行の `AIErrorReason` に該当項目なし） |
| その他                    | `LanguageModelError` 以外、または `code` が上記以外                                          | `unknown`                                          |

`AIRequest` / `AIResponse` の型自体（#10で確定済み）は、この検証結果と矛盾しない。`AIErrorReason` に `NotFound` 相当の項目を足すかは #11 実装時に判断する。

---

## 未確認のまま残った項目

- **②Copilot契約なし**: 未契約アカウントでの動作は未検証。#11実装時点でも確証がないまま `model-unavailable` の案内文言を用意することになる
- **③同意拒否・④レート制限**: 同意状態が拡張機能ホストのリロードをまたいで保持され、この環境では再現できなかった。別マシン／別アカウント、または同意状態をリセットする方法が分かれば再検証する
- **⑥利用規約・⑦未契約ユーザーの割合**: 未着手。チームでの判断が必要

---

## 判断の記録

| 日付       | 判断                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-05 | ①応答取得・⑤モデル一覧取得は実機で確認できたため、AI/01のinterface設計（#10、マージ済み）は踏襲してよいと判断                                      |
| 2026-09-05 | ②③④⑥⑦は未確認のまま#11（VSCodeLMProvider実装）に進む。同意拒否・レート制限のハンドリングは型定義上の仕様に基づいて実装し、実機での裏付けは別途行う |
