# ルール一覧

`enforcement` が `test` / `lint` のものは機械的に検査される。`doc` のものは人と AI が守る。

---

## RULE-001: 単発の外向き fetch にはタイムアウトを設定する

- **enforcement**: `test` — `test/project-rules.test.mjs`
- **対象**: 応答を一括で受け取る（ストリーミングでない）外向き `fetch`
- **出典**: PR#63 `apps/vscode-extension/src/learning/sync.ts`「同期リクエストにタイムアウトを設定してください」(Major)

応答が返らないまま無限に待つと、UI が固まり、Worker では課金時間を食い潰す。
単発リクエストには `signal: AbortSignal.timeout(TIMEOUT_MS)` を渡すこと。

参照実装は `apps/vscode-extension/src/learning/sync.ts`（`TIMEOUT_MS = 10_000`）。

### 対象外（重要）

以下に**壁時計タイムアウトを付けてはいけない**。応答が正常な途中で切れるバグになる。

1. **ストリーミング応答**（SSE、`response.body` を逐次読むもの）。
   長い生成が締め切りで打ち切られる。中断が必要なら RULE-005 に従い、
   時間ではなくライフサイクル（利用者のキャンセル、ウィンドウの破棄、クライアント切断）に
   紐づけた `AbortController` を使う。
2. **受け取った `Request` をそのまま中継するだけの経路**
   （`c.env.ASSETS.fetch(c.req.raw)`、`/api/*` の逆プロキシなど）。
   呼び出し元が切断すれば上流の中断が伝播する。

---

## RULE-005: 再実行されうる読み込みは古い応答で新しい表示を上書きしない

- **enforcement**: `doc`
- **出典**: PR#70 `apps/web/src/client/main.tsx`「古い期間のレスポンスで最新表示を上書きしないでください」(Major)

利用者が条件をすばやく切り替えると、先に投げた要求が後から完了しうる。
その場合、選択状態と表示内容が食い違う。

要求ごとに世代番号を持つか `AbortController` を保持し、
**最新の要求だけが state を更新できる**ようにすること。
参照実装は `apps/web/src/client` の `createRequestTracker`。

---

## RULE-002: 資格情報を載せた fetch はリダイレクトを追跡しない

- **enforcement**: `test` — `test/project-rules.test.mjs`（**インラインのヘッダ記述のみ検出**）
- **出典**: PR#63 `apps/vscode-extension/src/learning/sync.ts` Sensitive Data Exposure (CWE-319) (Major) /
  PR#70 `apps/web/src/worker/index.ts` Security & Privacy (Major)

リダイレクトが自動追跡されると、転送先へ `Authorization` ヘッダごと送られ、
トークンが意図しない相手に渡る。資格情報を送る `fetch` には `redirect: "error"` を指定すること。

**検出の限界**: テストは AST で `fetch(...)` の第 2 引数に直接書かれたヘッダを見る。
`Headers` オブジェクトを別の場所で組み立ててから渡す書き方（`apps/web/src/worker/index.ts` の
プロキシがこれ）は、型情報まで辿らないと判定できないため検出できない。
テストが緑でも安全の証明にはならないので、
資格情報を送る箇所はレビューで必ず目視すること。

---

## RULE-003: 設定から来た送信先 origin は HTTPS かループバックに限定する

- **enforcement**: `test` — `apps/web/src/worker/index.test.ts`（`apiOrigin` の単体テスト）
- **出典**: PR#70 `apps/web/src/worker/index.ts` Security & Privacy (Major) /
  PR#60 `apps/desktop/src/main/settings.ts` Sensitive Data Exposure (CWE-319)

設定値や環境変数から来た URL をそのまま信用しない。
平文 HTTP の外部宛てにトークンを送る前に拒否すること。
ローカル開発のための loopback HTTP（`localhost` / `127.0.0.1` / `[::1]`）のみ許容する。

参照実装は `apps/web/src/worker/index.ts` の `apiOrigin`。

---

## RULE-004: エラーを握りつぶすな

- **enforcement**: `lint`（空 catch は eslint の `no-empty` が既定で検出）+ `doc`（変換の妥当性）
- **出典**: PR#63 `vscodeLm.ts`「デバッグコールバックの例外を隔離してください」(Minor) /
  PR#63 `extension.ts`「`persistEvent` でクラウド同期の例外を処理してください」(Minor) /
  PR#63 `sync.ts`「2xx 応答の解析失敗を `SyncOutcome` に変換してください」(Major)

もともと `AGENTS.md` にあった一行ルール。レビュー実績で裏付けられたので、具体化する。

1. **空の `catch` を書かない。** eslint の `no-empty` が既に検出する
   （全ワークスペースが `js.configs.recommended` を読み込んでいる）。
2. **握りつぶしと隔離は違う。** 副次的な処理（デバッグコールバック、テレメトリ）の例外が
   主処理を巻き込まないよう隔離するのは正しい。その場合も飲み込まず、記録して先へ進む。
3. **失敗を成功として扱わない。** HTTP 2xx でも本文の解析に失敗したなら、それは失敗である。
   型付きの結果（`SyncOutcome` のような）へ変換し、呼び出し側が失敗を判別できるようにする。
4. **フォールバックで失敗を隠さない。** 既定値へ黙って落とすと、壊れていることが誰にも見えなくなる。
