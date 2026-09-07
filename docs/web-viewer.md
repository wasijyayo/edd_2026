# Web Viewer 設計

Issue #67「閲覧機能」。D1 に蓄積した学習イベントを Web から閲覧する。

## 位置づけと範囲

docs/architecture.md「Phase 1: 最初の学習ループを完成させる」の
**「Web にログインと読み取り専用の Learning Map を置く」** を実装する。
この文がスコープの正典であり、本書はその具体化である。

範囲に**含む**もの。

- ログイン（後述の通り、Identity が無い間はゲートであり本人確認ではない）
- 習熟度の一覧表示（Learning Map）
- 学習の推移（集計済みの時系列）

範囲に**含まない**もの。理由を添えて明示する。

| 除外するもの             | 理由                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 書き込み・編集           | 学習イベントは追記のみで、正本は Extension / Desktop からの同期である（architecture.md「オフラインと競合」） |
| 学習イベントの生ログ表示 | architecture.md「データとプライバシー」が生ログの送出を禁じている。集計済みの読み取りモデルだけを返す        |
| ユーザー設定画面         | apps/web/README.md は設定も担当範囲に挙げるが、設定の書き込み API が無い。閲覧が動いてから別 Issue にする    |
| GraphQL / 汎用 BFF       | apps/web/AGENTS.md「汎用GraphQLや巨大なBFFを先行して導入しない」                                             |

## 前提として認めておく制約: 認証

**この設計で最も強い制約は認証であり、Issue の文面には現れていない。**

現状の `apps/api/src/auth/middleware.ts` の `devAuth` は、単一の共有トークン
`DEV_AUTH_TOKEN` を検証し、通過した全員を `DEV_AUTH_USER_ID`（既定 `dev-user`）
という**一人のユーザー**として扱う。OAuth / OIDC による Identity は
architecture.md「本番化前に明確化する事項」の通り未実装である。

したがって次を設計の明示的な前提とする。

> **Identity が実装されるまで、Web Viewer は単一ユーザー向けである。**
> **ログインは「部外者を入れないゲート」であって、「誰であるかの識別」ではない。**

この前提は画面にも書く。「現在は開発用の単一ユーザーモードです」と表示し、
複数人で使えると誤解させない。

### 検討した3案

| 案                                                | 内容                                                                       | 判断             |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| A. Web を Worker にし、トークンはサーバー側に置く | ブラウザにはセッション Cookie だけを渡し、API 呼び出しは Worker 内から行う | **採用**         |
| B. ブラウザに `DEV_AUTH_TOKEN` を配る             | 実装は最小。ただしシステム全体の資格情報がブラウザに露出する               | 却下             |
| C. 先に Identity（OAuth）を作る                   | 正しい順序だが、本 Issue の範囲を大きく超える                              | 却下（別 Issue） |

**A を採る理由。**

1. 共有トークンはシステム全体の資格情報であり、個人ごとの資格情報ではない。
   ブラウザの JS から読める場所に置くと、XSS 一つで全ユーザーの学習履歴が読める。
   `apps/desktop/src/main/credentials.ts` が OS キーチェーンでトークンを守っているのと
   同じ原則を Web でも保つ。ブラウザに安全な保管場所が無いなら、置かない。
2. Web と API が同一生成元になれば CORS の問題が消える。
   現在 `CORS_ALLOWED_ORIGINS` は `""`（誰も許可しない）で、
   B や C ではここを開ける作業が必ず要る。
3. apps/web/AGENTS.md の「データベースへ直接アクセスしない。認証済みの API 契約だけを使う」を
   そのまま守れる。Worker は D1 バインディングを持たず、`fetch` で API を呼ぶだけにする。

### A の構成

```text
ブラウザ
  │  Cookie: session=<opaque>      （HttpOnly / Secure / SameSite=Lax）
  ▼
apps/web （Cloudflare Worker + static assets）
  │  Authorization: Bearer $API_TOKEN   （Worker の secret。ブラウザへ出さない）
  ▼
apps/api （既存）── D1
```

- `POST /login`: パスフレーズを検証してセッションを発行する。
  検証対象は Worker の secret `WEB_ACCESS_PASSPHRASE`。
  比較は `devAuth` の `timingSafeEqual` と同じく定数時間で行う
  （実装を `packages/domain` へ移すか、`apps/web` に写経するかは実装時に決める。
  ドメインロジックではないので domain へは置かない方が筋がよい）。
- セッションは Workers KV に置く。値は乱数の opaque token、TTL は 7 日。
  JWT にしない。失効させたいときに撤回できないものを、認証の代わりに使わない。
- `GET /api/*`: セッションを検証し、`apps/api` へ中継する。
  中継先の URL は var `API_ORIGIN`、トークンは secret `API_TOKEN`。
- 静的アセットは同じ Worker から配信する（`assets` バインディング）。

**ゲートが守る範囲を正確に書いておく。** 後述の `run_worker_first` の通り、
`/` や `/activity` の HTML・JS は Worker を経由せず静的配信される。つまり
**アプリシェルは未認証でも取得できる。ログインが守るのは `/api/*` のデータ経路だけである。**
未認証のブラウザが `/` を開くと、画面の枠だけが出てデータ取得が 401 になり `/login` へ誘導される。
学習データが漏れることはないが、「ログインしないと何も見えない」ではない。
アプリシェル自体を隠したくなったら `run_worker_first` に `"/"` を足して
Worker 側でリダイレクトするが、秘匿すべき情報がシェルに無い以上、現状は不要とする。

`WEB_ACCESS_PASSPHRASE` / `API_TOKEN` が未設定のときは、
`devAuth` と同じく **500 で落とす**。「設定が無いから素通しする」は、
設定漏れがそのまま認証の無効化になる。設定漏れは機能停止として現れるべきである。

## API に追加する読み取りエンドポイント

apps/web/AGENTS.md の
「表示に必要な読み取りAPIが不足した場合は、画面固有の用途を明示して API に追加する」に従い、
画面ごとに用途とフィールドを固定する。

### 既存: `GET /v1/learning-profile`

Learning Map 画面はこれで足りる。追加不要。
返るのは `version` / `derivedAt` / `concepts[]`（`ConceptMasteryView`）/ `eventCount`。

**画面での注意。** `concepts[]` に現れない Concept は「未観測」であり、
「習熟度 0%」ではない（contract/learning-profile.ts のコメント、docs/concepts.md）。
未観測を 0% のバーとして描いてはならない。「まだ観測がありません」と文言で出す。

### 追加: `GET /v1/learning-activity`

**用途。** Web Viewer の「推移」画面。いつ・どの種別の学習が起きたかを日次で見る。

生ログを返さない制約があるため、サーバー側で集計した読み取りモデルにする。
イベント1件を復元できる粒度にはしない。

```ts
// apps/api/src/contract/learning-activity.ts
export const LEARNING_ACTIVITY_RESPONSE_VERSION = 1;

export interface DailyActivity {
  /** ローカル日付ではなく UTC の YYYY-MM-DD。集計の境界を一意にするため。 */
  date: string;
  /** イベント種別ごとの件数。0 件の種別はキーごと省く。 */
  counts: Partial<Record<LearningEventType, number>>;
}

export interface LearningActivityResponse {
  version: number;
  derivedAt: string;
  /** 集計対象の期間（両端を含む）。クエリの解釈結果をそのまま返す。 */
  from: string;
  to: string;
  /** 観測のある日だけを日付の昇順で並べる。空白日は行ごと省く。 */
  days: DailyActivity[];
}
```

- クエリ: `?days=30`（既定 30、上限 365）。上限を超えたら 400 で拒否する。
  黙って丸めない。要求と結果が食い違ったまま画面が「全期間」と表示するのを防ぐ。
- 日付境界を UTC 固定にするのは、`learning_events.occurred_at_ms` が epoch ミリ秒で、
  タイムゾーンを持たないため。表示側で必要になった時点で
  `?tz=` を足す（そのときは version を上げる必要はない。フィールド追加ではないため）。
- 実装は `LearningEventRepository` に集計メソッドを足すのではなく、
  当面は `listByUser` の結果を畳み込んで作る。件数が問題になるまで SQL の
  `GROUP BY` へ降ろさない。降ろすときは D1 側で
  `strftime('%Y-%m-%d', occurred_at_ms / 1000, 'unixepoch')` を使う。

### 追加しないもの

`GET /v1/dashboard` のような合成エンドポイントは作らない。
画面が2つで、それぞれ1エンドポイントに対応している段階で BFF を挟む理由がない
（architecture.md「BFF は禁止しない。……特定の画面が安定し……た時点で」）。

## レート制限との整合

`deriveMasteryFromEvents` はリクエストごとにそのユーザーの全イベントを読み直す。
`PROFILE_RATE_LIMITER` は 30 回 / 60 秒である。

したがって次を守る。

- **1画面につきフェッチは1回。** パネルごとに `/v1/learning-profile` を叩かない。
  1回取得した `LearningProfileResponse` を、クライアント側で
  「状態別の集計」「上位 Concept」「根拠の内訳」へ分解して描く。
- 自動ポーリングを入れない。更新は明示的な再読み込みボタンに限る。
- `/v1/learning-activity` にも `PROFILE_RATE_LIMITER` を適用する
  （同じくログ全走査であるため）。

**共有であることの帰結を明記しておく。** `PROFILE_RATE_LIMITER` は
`namespace_id: 1002` の一つの枠であり、これを流用すると
**Learning Map 画面と推移画面の合計で 30 回 / 60 秒**になる。
画面を往復すると1回の遷移で2枠を消費する。それぞれ独立に 30 回ではない。
バインディングを増やさない側に倒した判断だが、実運用で足りなくなったら
`wrangler.jsonc` の `ratelimits` へ `ACTIVITY_RATE_LIMITER`（`namespace_id: 1003`）を
足して分離する。そのときは `apps/api/src/app.ts` の `app.use` も1行増える。

## 画面

### 1. ログイン `/login`

パスフレーズ1つ。「開発用の単一ユーザーモード」である旨を明記する。

### 2. Learning Map `/`

`GET /v1/learning-profile` の1回のフェッチから描く。

- 確認済み / 学習中 の件数サマリ
- Concept の一覧。`compareConceptView` の順序（サーバーが決めた順）を保つ。
  クライアントで並べ替え直さない。順序の正典はサーバーにある。
- 各行: `label`（無ければ `conceptId`）、`status`、`score`、`evidence` の要約
  （「Hintで2回解決」など）。docs/concepts.md の意図通り、
  score 単独ではなく status と evidence を必ず併記する。
- `eventCount` と `derivedAt` をフッタに出す。いつ時点の導出かを隠さない。

### 3. 推移 `/activity`

`GET /v1/learning-activity` の1回のフェッチから描く。
日次の積み上げ棒グラフ（種別で色分け）と、期間の選択（7 / 30 / 90 日）。

**欠測日はクライアントで 0 埋めしてから描く。** `days[]` は観測のある日しか
含まないため、そのままグラフへ渡すと3日空いた2本が連日として隣り合って描かれ、
学習が途切れていないように見える。応答の `from`〜`to` から全日付を生成し、
`days[]` に無い日を件数 0 の行として補ってから描画する。
`from` / `to` を応答に含めているのはこのためである。

## エラー表示

CLAUDE.md「エラーを握りつぶすな」。
`apps/vscode-extension` の `AIErrorReason` と同じく、**理由を区別して名前を付けて出す**。
「読み込みに失敗しました」の一種類にまとめない。

| 状況                      | 画面の表示                                                         | 追加の挙動                       |
| ------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| セッション無効 / 期限切れ | 「ログインの有効期限が切れました」                                 | `/login` へ誘導                  |
| API が 401                | 「サーバー側の API トークンが無効です」                            | 再ログインでは直らないと明記する |
| API が 429                | 「短時間に要求が多すぎます。しばらく待って再読み込みしてください」 | 自動リトライしない               |
| API が 5xx / 到達不能     | 「学習データの取得に失敗しました」                                 | 再試行ボタンを出す               |
| データが 0 件             | 「まだ学習イベントがありません」                                   | エラーとして扱わない             |

Worker 側は `apps/api/src/app.ts` の `onError` と同じ原則を採る。
例外の内容を本文へ載せない。ただし握りつぶさず、`console.error` で必ず残す。

## 技術選定

| 項目                   | 選定               | 理由                                                                              |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------- |
| ランタイム             | Cloudflare Workers | `apps/api` と同じ。デプロイ経路を増やさない                                       |
| サーバーフレームワーク | Hono               | `apps/api` と同じ。middleware の書き方を共有できる                                |
| UI                     | React + Vite       | 画面が2つでも状態遷移（読込 / エラー / 空 / 表示）があり、素の DOM 操作より読める |
| グラフ                 | 自前の SVG         | 積み上げ棒1種類のためにライブラリを入れない                                       |
| テスト                 | Vitest             | 他ワークスペースと揃える                                                          |
| セッション保管         | Workers KV         | 撤回可能で TTL を持つ。KV namespace を1つ作る                                     |

React を入れる判断は `apps/desktop` の素の `renderer.js` と揃わないが、
Desktop は単一画面のオーバーレイであり、こちらは一覧とグラフを持つ。
揃えるべきは「フレームワークの名前」ではなく「状態を明示的に扱うこと」である。

## ファイル構成

```text
apps/web/
├─ package.json              # scripts / deps を追加（現在は description のみ）
├─ tsconfig.json
├─ eslint.config.mjs         # apps/api の flat config に合わせる
├─ vite.config.ts
├─ wrangler.jsonc
├─ .dev.vars.example
├─ src/
│  ├─ worker/
│  │  ├─ index.ts            # Hono。セッション検証 → apps/api へ中継
│  │  ├─ session.ts          # KV へのセッション発行・検証・失効
│  │  ├─ session.test.ts
│  │  └─ worker-configuration.d.ts   # wrangler types の生成物
│  └─ client/
│     ├─ main.tsx
│     ├─ api.ts              # fetch ラッパ。上表のエラー種別へ写像する
│     ├─ api.test.ts
│     ├─ pages/{Login,LearningMap,Activity}.tsx
│     └─ components/
└─ index.html
```

`apps/api` 側の追加。

```text
apps/api/src/
├─ contract/learning-activity.ts       （+ .test.ts）
└─ routes/learning-activity.ts         （+ .test.ts）
```

### wrangler.jsonc

静的アセットと Worker を同一 Worker から出す。SPA なのでルーティングの取りこぼしを
`not_found_handling` で index.html へ寄せる。

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "gakushu-sochi-web",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-09-05",
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    // /login と /api/* は Worker が先に受ける。
    // それ以外は Asset Worker が静的ファイルを返す。
    "run_worker_first": ["/api/*", "/login", "/logout"],
  },
  "vars": {
    "API_ORIGIN": "https://gakushu-sochi-api.<account>.workers.dev",
  },
  "secrets": { "required": ["API_TOKEN", "WEB_ACCESS_PASSPHRASE"] },
  "kv_namespaces": [{ "binding": "SESSIONS", "id": "<作成後に埋める>" }],
}
```

`apps/api` 側は CORS を開けない。同一生成元で完結するため
`CORS_ALLOWED_ORIGINS` は `""` のままにする。開ける必要が出たら、
それは案 A から外れたということなので設計を見直す合図とする。

### ルートの package.json

`compile` / `test` / `test:unit` / `lint` の4つがワークスペースを名指しで列挙しているため、
すべてに `@gakushu-sochi/web` を追加する。
`check:worker-types` も現在は api だけを名指ししている。`apps/web` も Worker であり
`worker-configuration.d.ts` を持つので、ここにも追加する。
CI で型のずれが出るとしたらこの経路である。`test/package-scripts.test.mjs` が
`dev` と `test` の形を検証しているので、変更後にこのテストが通ることを確認する。

`dev` スクリプトへ web を足すかは実装時に判断する。足すなら
`--names api,desktop,web` と対応する順序を保つこと（既存テストが名前を見ている）。

## 実装の順序

1. `apps/api` に `learning-activity` の契約とルートを追加（テスト付き）。
   Web が無くても単体で意味を持ち、単体でレビューできる。
2. `apps/web` の土台。package.json / tsconfig / eslint / vite / wrangler と、
   Worker のセッションと中継。ここまでで「ログインして profile の JSON が見える」。
3. Learning Map 画面。
4. 推移画面。
5. ルートの package.json へワークスペースを配線し、デプロイ。

各段階を別 PR にする。1 は API の変更、2 は基盤、3〜4 は UI で、
レビューの観点がそれぞれ違う。

## 積み残し（本 Issue の範囲外）

- Identity（OAuth / OIDC）。これが入るまで単一ユーザーであることは上述の通り。
  入った時点で `apps/web` の `/login` と KV セッションは、
  OIDC のコールバックとトークン保管へ置き換わる。中継の形は変わらない。
- ユーザー設定の編集。
- データのエクスポート / 削除（architecture.md「本番化前に明確化する事項」）。
