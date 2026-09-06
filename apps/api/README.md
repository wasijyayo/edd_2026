# API Server

Cloudflare Workers 上で動く Hono API。認証、`learning-events:sync`、`learning-profile`、
Managed AI の実装を置く。API契約を先に置かず、このアプリ固有の型を他パッケージから
参照してはならない。

```bash
npm run dev --workspace=@gakushu-sochi/api
npm run test:unit --workspace=@gakushu-sochi/api
npm run deploy --workspace=@gakushu-sochi/api
```

Bindings を変更したら、`npm run gen:worker-types --workspace=@gakushu-sochi/api` を実行する。
秘密情報は `wrangler secret put` で設定し、`wrangler.jsonc` やリポジトリに書かない。

必要な秘密情報の**名前**は `wrangler.jsonc` の `secrets.required` に宣言する。
`wrangler types` はこの宣言から型を作るため、`.dev.vars` を持たない CI でも
`check:worker-types` が通る。デプロイ時には設定済みかどうかも検証される。

## ローカル開発の準備

```bash
cp .dev.vars.example .dev.vars      # 開発用の秘密情報。gitignore 済み
npm run --workspace=@gakushu-sochi/api dev
```

D1 のスキーマを適用する。

```bash
npx wrangler d1 migrations apply gakushu-sochi --local
```

リモートへ適用するには `--local` を外す。`wrangler.jsonc` の `database_id` は
`wrangler d1 create gakushu-sochi` の出力で埋める。
