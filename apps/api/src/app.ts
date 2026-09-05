import { Hono } from "hono";

/** Cloudflare Worker から提供する HTTP API。 */
export const app = new Hono<{ Bindings: CloudflareBindings }>();

/** Worker とデプロイの稼働確認に使う。認証や永続化はまだ行わない。 */
app.get("/health", (context) => context.json({ status: "ok" }));
