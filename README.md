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
│  ├─ context/
│  │  ├─ collector.ts           # 選択範囲・周辺コード・言語情報をCodeContextにする
│  │  └─ diagnostics.ts         # カーソル位置のLSP Diagnosticsを取得する
│  ├─ ai/
│  │  ├─ provider.ts            # AIProvider interfaceとTutorRequest / TutorResponse
│  │  ├─ mock.ts                # 実AIが使えない場合の固定応答
│  │  ├─ vscodeLm.ts            # VS Code Language Model APIとの接続
│  │  └─ prompt.ts              # Hint / Explain用のプロンプト組み立て
│  ├─ learning/
│  │  └─ events.ts              # 理解度・解決結果をglobalStateへ保存する
│  └─ ui/
│     ├─ input.ts               # Hint / Explain、理解度の選択
│     └─ output.ts              # 回答・エラー・ローディングの表示
├─ docs/
│  ├─ idea.md                   # プロダクトの長期構想
│  └─ testing.md                # デモケースと手動テスト手順
├─ package.json
└─ README.md
```

### 責務の境界

- `context/` はVS Code / LSPの生データを、AIが扱える構造に変換する。
- `ai/` はVS CodeのUIを直接扱わず、`TutorRequest`を受けて`TutorResponse`を返す。
- `learning/` は回答の前後に生じる学習イベントだけをローカル保存する。
- `ui/` は入力と表示を担当し、AIの判断ロジックを持たない。
- `extension.ts` は各モジュールを接続するだけにする。

`TutorRequest` / `TutorResponse` は `src/ai/provider.ts` に集約し、AI担当とVS Code担当の共有契約とする。

## 開発

```bash
npm install
npm run compile
```

VS Codeでこのフォルダを開き、`F5` でExtension Development Hostを起動します。
