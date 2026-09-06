import { expect, test } from "vitest";
import { Hono } from "hono";
import { devAuth, type AuthVariables } from "./middleware.js";

/** テスト用に、認証を通したら userId をそのまま返すだけのアプリを組む。 */
function buildApp(env: { DEV_AUTH_TOKEN?: string; DEV_AUTH_USER_ID?: string }) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>();
  app.use("/protected", devAuth);
  app.get("/protected", (c) => c.json({ userId: c.get("user").userId }));
  return (headers: Record<string, string> = {}) =>
    app.request("/protected", { headers }, env as unknown as CloudflareBindings);
}

test("正しいトークンなら認証を通し、userIdを渡す", async () => {
  const request = buildApp({ DEV_AUTH_TOKEN: "secret", DEV_AUTH_USER_ID: "user-a" });

  const res = await request({ Authorization: "Bearer secret" });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ userId: "user-a" });
});

test("DEV_AUTH_USER_IDが無ければ既定のユーザーになる", async () => {
  const request = buildApp({ DEV_AUTH_TOKEN: "secret" });

  const res = await request({ Authorization: "Bearer secret" });

  expect(await res.json()).toEqual({ userId: "dev-user" });
});

test("Authorizationヘッダが無ければ401にする", async () => {
  const request = buildApp({ DEV_AUTH_TOKEN: "secret" });

  expect((await request()).status).toBe(401);
});

test("トークンが違えば401にする", async () => {
  const request = buildApp({ DEV_AUTH_TOKEN: "secret" });

  expect((await request({ Authorization: "Bearer wrong" })).status).toBe(401);
});

test("Bearerを省いた生のトークンは受け付けない", async () => {
  // 形式を緩めると、認証方式を差し替えるときに古い形式が残っているか判定できない。
  const request = buildApp({ DEV_AUTH_TOKEN: "secret" });

  expect((await request({ Authorization: "secret" })).status).toBe(401);
});

test("トークンが未設定なら素通りさせず500にする", async () => {
  // 「設定が無いから全員通す」にすると、秘密の設定漏れがそのまま認証の無効化になる。
  // 設定漏れは機能の停止として現れるべきである。
  const request = buildApp({});

  const res = await request({ Authorization: "Bearer anything" });

  expect(res.status).toBe(500);
});

test("空文字のトークン設定でも素通りさせない", async () => {
  const request = buildApp({ DEV_AUTH_TOKEN: "" });

  expect((await request({ Authorization: "Bearer " })).status).toBe(500);
});

test("トークンの前方一致では通さない", async () => {
  const request = buildApp({ DEV_AUTH_TOKEN: "secret-long-token" });

  expect((await request({ Authorization: "Bearer secret" })).status).toBe(401);
});
