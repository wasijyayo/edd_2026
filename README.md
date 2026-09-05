# Gakushu Sochi

選択したコードやDiagnosticsをもとに、VS Code内で学習向けのヒントを返す拡張機能です。Hackathonでは、AIがコードを完成させるのではなく、理解度に合わせて「次に試す一手」を返す体験を検証します。

## 識別子

| 項目              | 値                                             |
| ----------------- | ---------------------------------------------- |
| package name      | `gakushu-sochi`                                |
| Extension ID      | `<publisher>.gakushu-sochi`（publisher未決定） |
| Command ID prefix | `gakushuSochi.`                                |
| Chat Participant  | `@gakushu-sochi`                               |
| publisher         | 未決定                                         |

## Hackathon MVP

```text
コードを選択
  → Hint / Explain を選ぶ
  → 選択範囲・周辺コード・DiagnosticsをAIへ渡す
  → 次の一手とヒントを表示する
  → 理解度と解決結果を端末に記録し、APIへ同期する
```

対象外: WebviewによるリッチUI、完全なPersonal Learning Map。

## ファイル構成

複数クライアントで同じ Personal Learning Map を扱うため、モノレポで管理する。

```text
.
├─ apps/
│  ├─ vscode-extension/         # VS Code固有のUI・コンテキスト収集・ローカルキュー
│  ├─ api/                      # 認証、同期、Managed AIを担うAPI Server
│  └─ web/                      # Learning Mapと設定のWeb App
├─ packages/
│  ├─ domain/                   # Concept、LearningEvent、Masteryの共有ドメイン
├─ docs/
│  ├─ idea.md                   # プロダクトの長期構想
│  ├─ concepts.md               # Concept一覧・習熟度ルール・マイグレーション方針
│  └─ testing.md                # デモケースと手動テスト手順
├─ package.json                  # npm workspacesの入口
└─ README.md
```

### 責務の境界

- `packages/domain` は他モジュールに依存しないドメイン契約と習熟度規則を置く。VS Code APIをimportしない。
- `apps/vscode-extension` はVS Code / LSPの生データを構造化し、表示と入力を担当する。
- `apps/api` は学習イベントの正本、習熟度導出、認証、同期を担当する。

`AIProvider` interface と `AIRequest` / `AIResponse` は `apps/vscode-extension/src/ai/` に置く。Managed AI はAPIのHTTP境界として追加し、同一の内部interfaceを無理に共有しない。

`AIProvider.ask` は失敗しても例外を投げず、`AIResponse` の値として理由を返す。呼び出し側が `AIErrorReason` で案内を出し分けられるようにするため。ストリーミングは `askStream` を任意メソッドとして空けてあり、実装するかどうかは 調査/01 (#4) の結果で決める。

Learner Profile / Concept / 学習イベントの型は `packages/domain/src/profile.ts` に集約する。命名規則・Concept追加手順・習熟度の更新ルール・スキーマのマイグレーション方針は `docs/concepts.md` が正典とする。

Concept一覧そのものは `packages/domain/concepts.md` を正典とし、生成物 `packages/domain/src/concepts.generated.ts` の隣に置く。表を編集したら `npm run gen:concepts` を実行する。

## 開発

```bash
npm install
npm run compile
npm run check:concepts   # Concept一覧と生成物が一致しているか検査する
```

VS Codeでリポジトリルートを開き、`F5` でExtension Development Hostを起動します。
全体方針は [`docs/architecture.md`](docs/architecture.md) を参照する。
