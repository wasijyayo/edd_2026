# Web App

Learning Map を表示する Cloudflare Worker + React UI。学習イベントの正本は保持せず、
認証済みの API Server から集計済みの読み取りモデルだけを取得する。

```bash
npm run dev --workspace=@gakushu-sochi/web
npm run test:unit --workspace=@gakushu-sochi/web
npm run build --workspace=@gakushu-sochi/web
```

ローカル開発では `.dev.vars.example` を `.dev.vars` にコピーし、`API_TOKEN` と
`WEB_ACCESS_PASSPHRASE` を設定する。`API_TOKEN` は API 側の `DEV_AUTH_TOKEN` と**同じ値**にする。
これらの値は Worker の secret であり、ブラウザへ送ってはならない。

セッション用 KV namespace は `wrangler.jsonc` に登録済みである。本番では `API_TOKEN` と
`WEB_ACCESS_PASSPHRASE` を `wrangler secret put` で設定する。GitHub Actions による CD には、
対象 Cloudflare アカウントへ必要最小限にスコープした `CLOUDFLARE_API_TOKEN` を GitHub の
`production` environment secret として設定する。
