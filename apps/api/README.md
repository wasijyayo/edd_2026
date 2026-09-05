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
