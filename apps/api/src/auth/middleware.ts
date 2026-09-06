/**
 * 認証の継ぎ目。
 *
 * docs/architecture.md は VS Code の端末認可に OAuth Device Authorization Flow を
 * 使うと定めているが、それは Identity の責務として独立して実装する。ここでは
 * 「リクエストから認証済みの userId を決める」という一点だけを引き受け、
 * 学習ドメインのハンドラ（sync / profile）がトークンの形式に依存しないようにする。
 *
 * 現時点の検証方式は開発用の共有トークンである。本番の方式へ差し替えるとき、
 * 変更はこのファイルに閉じる。
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

/** 認証済みの主体。ハンドラはこれ以外から userId を得てはならない。 */
export interface AuthenticatedUser {
  userId: string;
}

export interface AuthVariables {
  user: AuthenticatedUser;
}

/**
 * `Authorization: Bearer <token>` からトークンを取り出す。
 *
 * 形式が違うものは受け付けない。`Bearer` を省いた生のトークンを許すと、
 * 認証方式を差し替えるときに古い形式が残っているかどうかを判定できなくなる。
 */
function extractBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1];
}

/**
 * 開発用トークンを検証するミドルウェア。
 *
 * `DEV_AUTH_TOKEN` が未設定なら、認証を素通りさせず 500 で落とす。
 * 「設定が無いから全員通す」は、本番で秘密の設定漏れがそのまま
 * 認証の無効化になる。設定漏れは機能の停止として現れるべきである。
 *
 * userId はトークンから決める。リクエストボディの `clientId` は
 * クライアントの自己申告であり、認可の入力にしてはならない。
 */
export const devAuth = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  const expected = c.env.DEV_AUTH_TOKEN;
  if (!expected) {
    throw new HTTPException(500, { message: "DEV_AUTH_TOKEN is not configured" });
  }

  const token = extractBearerToken(c.req.header("Authorization"));
  if (token === undefined) {
    throw new HTTPException(401, { message: "Authorization: Bearer <token> is required" });
  }

  if (!timingSafeEqual(token, expected)) {
    throw new HTTPException(401, { message: "invalid token" });
  }

  // 開発用トークンは単一ユーザーを表す。実際の認証方式ではトークンから
  // ユーザーを解決する。
  c.set("user", { userId: c.env.DEV_AUTH_USER_ID || "dev-user" });

  await next();
});

/**
 * 文字列を定数時間で比較する。
 *
 * 通常の `===` は先頭から違う位置で打ち切るため、比較にかかる時間から
 * トークンを1文字ずつ推測できる。認証に使う比較では長さの違いも含めて
 * 早期に返さない。
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // 長さが違えば不一致だが、その事実だけで早期に返すと長さが漏れる。
  // 同じ長さのバッファ同士を必ず最後まで比較する。
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}
