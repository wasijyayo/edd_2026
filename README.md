# Code Companion

選択したコードやDiagnosticsをもとに、VS Code内で学習向けのヒントを返す拡張機能です。Hackathonでは、AIがコードを完成させるのではなく、理解度に合わせて「次に試す一手」を返す体験を検証します。

## Hackathon MVP

```text
コードを選択
  → Hint / Explain を選ぶ
  → 選択範囲・周辺コード・DiagnosticsをAIへ渡す
  → 次の一手とヒントを表示する
  → 理解度と解決結果をローカルに記録する
```

対象外: WebviewによるリッチUI、サーバー・同期、完全なPersonal Learning Map、ターミナル／外部クリップボード入力。

## ファイル構成

2日間のHackathonではモノレポや別バックエンドを作らず、単一のVS Code Extensionにまとめる。

```text
.
├─ src/
│  ├─ extension.ts              # コマンド登録と処理フローの入口
│  ├─ types/
│  │  ├─ profile.ts             # Learner Profile / Concept / 学習イベントの型
│  │  ├─ context.ts             # CodeContext（AIへ渡すコード文脈）の型
│  │  ├─ ai.ts                  # AIRequest / AIResponse などAI層のデータ契約
│  │  ├─ concepts.md            # Concept一覧の正典（人が編集する表）
│  │  └─ concepts.generated.ts  # concepts.mdから自動生成（編集しない）
│  ├─ context/
│  │  ├─ collector.ts           # 選択範囲・周辺コード・言語情報をCodeContextにする
│  │  └─ diagnostics.ts         # カーソル位置のLSP Diagnosticsを取得する
│  ├─ ai/
│  │  ├─ provider.ts            # AIProvider interface
│  │  ├─ mock.ts                # 実AIが使えない場合の固定応答
│  │  ├─ vscodeLm.ts            # VS Code Language Model APIとの接続
│  │  └─ prompt.ts              # Hint / Explain用のプロンプト組み立て
│  ├─ learning/
│  │  └─ events.ts              # 理解度・解決結果をglobalStateへ保存する
│  └─ ui/
│     ├─ input.ts               # Hint / Explain、理解度の選択
│     └─ output.ts              # 回答・エラー・ローディングの表示
├─ scripts/
│  └─ gen-concepts.mjs          # concepts.mdの表からConcept一覧を生成する
├─ docs/
│  ├─ idea.md                   # プロダクトの長期構想
│  ├─ concepts.md               # Concept一覧・習熟度ルール・マイグレーション方針
│  └─ testing.md                # デモケースと手動テスト手順
├─ package.json
└─ README.md
```

### 責務の境界

- `types/` は他モジュールに依存しないデータ契約だけを置く。VS Code APIをimportしない。
- `context/` はVS Code / LSPの生データを、AIが扱える構造に変換する。
- `ai/` はVS CodeのUIを直接扱わず、`AIRequest`を受けて`AIResponse`を返す。
- `learning/` は回答の前後に生じる学習イベントだけをローカル保存する。
- `ui/` は入力と表示を担当し、AIの判断ロジックを持たない。
- `extension.ts` は各モジュールを接続するだけにする。

`AIProvider` interfaceは `src/ai/provider.ts` に置き、`AIRequest` / `AIResponse` は `src/types/ai.ts` に集約して、AI担当とVS Code担当の共有契約とする。`ai/` から `types/` への依存は許すが、逆向きの依存は作らない。

`AIProvider.ask` は失敗しても例外を投げず、`AIResponse` の値として理由を返す。呼び出し側が `AIErrorReason` で案内を出し分けられるようにするため。ストリーミングは `askStream` を任意メソッドとして空けてあり、実装するかどうかは 調査/01 (#4) の結果で決める。

Learner Profile / Concept / 学習イベントの型は `src/types/profile.ts` に集約する。命名規則・Concept追加手順・習熟度の更新ルール・スキーマのマイグレーション方針は `docs/concepts.md` が正典とする。

Concept一覧そのものは `src/types/concepts.md` を正典とし、生成物 `src/types/concepts.generated.ts` の隣に置く。表を編集したら `npm run gen:concepts` を実行する。

## 開発

```bash
npm install
npm run compile
npm run check:concepts   # Concept一覧と生成物が一致しているか検査する
```

VS Codeでこのフォルダを開き、`F5` でExtension Development Hostを起動します。
