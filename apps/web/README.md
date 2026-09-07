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

セッション用 KV namespace は `wrangler.jsonc` に登録済みである。GitHub Actions による
初回を含む本番 CD には、次の GitHub `production` environment secrets を設定する。

- `CLOUDFLARE_API_TOKEN`: 対象 Cloudflare アカウントへ必要最小限にスコープした API token
- `WEB_API_TOKEN`: API 側の `DEV_AUTH_TOKEN` と同じ値
- `WEB_ACCESS_PASSPHRASE`: Web へのアクセスに使用するパスフレーズ

CD は後ろ 2 つを一時的な secrets file として `wrangler deploy` に渡し、完了時に削除する。
Worker 作成後に手動で `wrangler secret put` する必要はない。
