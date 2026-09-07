import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  cookieValue,
  createSession,
  deleteSession,
  expiredSessionCookie,
  readSession,
  sessionCookie,
} from "./session.js";

type WebBindings = CloudflareBindings;
type Fetch = typeof globalThis.fetch;

export interface WebAppDeps {
  fetch: Fetch;
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let index = 0; index < length; index += 1)
    diff |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  return diff === 0;
}

function configured(value: string | undefined, name: string): string {
  if (!value) throw new HTTPException(500, { message: `${name} is not configured` });
  return value;
}

async function loginRateLimit(c: {
  env: WebBindings;
  req: { header(name: string): string | undefined };
}) {
  const limiter = c.env.LOGIN_RATE_LIMITER;
  if (!limiter) throw new HTTPException(500, { message: "LOGIN_RATE_LIMITER is not configured" });
  const key = c.req.header("CF-Connecting-IP") ?? "unknown";
  if (!(await limiter.limit({ key })).success)
    throw new HTTPException(429, { message: "too many login attempts" });
}

export function createWebApp(deps: WebAppDeps = { fetch: globalThis.fetch }) {
  const app = new Hono<{ Bindings: WebBindings }>();

  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error("unhandled web worker error", {
      message: error.message,
      stack: error.stack,
      path: c.req.path,
    });
    return c.json({ error: "internal server error" }, 500);
  });

  app.post("/login", async (c) => {
    await loginRateLimit(c);
    const expected = configured(c.env.WEB_ACCESS_PASSPHRASE, "WEB_ACCESS_PASSPHRASE");
    let payload: { passphrase?: unknown };
    try {
      payload = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: "invalid login request" });
    }
    const passphrase = typeof payload.passphrase === "string" ? payload.passphrase : "";
    const accepted = timingSafeEqual(passphrase, expected);
    console.log("web login attempt", {
      ip: c.req.header("CF-Connecting-IP") ?? "unknown",
      accepted,
    });
    if (!accepted) throw new HTTPException(401, { message: "invalid passphrase" });

    const token = await createSession(c.env.SESSIONS);
    return new Response(null, {
      status: 204,
      headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" },
    });
  });

  app.post("/logout", async (c) => {
    await deleteSession(c.env.SESSIONS, cookieValue(c.req.header("cookie"), "session"));
    return new Response(null, {
      status: 204,
      headers: { "set-cookie": expiredSessionCookie, "cache-control": "no-store" },
    });
  });

  app.all("/api/*", async (c) => {
    if (!(await readSession(c.env.SESSIONS, cookieValue(c.req.header("cookie"), "session")))) {
      return c.json({ error: "session_expired" }, 401, { "cache-control": "no-store" });
    }
    const origin = configured(c.env.API_ORIGIN, "API_ORIGIN");
    const token = configured(c.env.API_TOKEN, "API_TOKEN");
    const requestUrl = new URL(c.req.url);
    const target = new URL(requestUrl.pathname.replace(/^\/api/, "") + requestUrl.search, origin);
    const headers = new Headers(c.req.raw.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.delete("cookie");
    const upstream = await deps.fetch(target, {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("cache-control", "no-store");
    if (upstream.status === 401) {
      return c.json({ error: "api_token_invalid" }, 401, Object.fromEntries(responseHeaders));
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  });

  app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
  return app;
}

const app = createWebApp();
export default { fetch: app.fetch } satisfies ExportedHandler<WebBindings>;
