/** 撤回可能な opaque session を Workers KV に保存する。 */
const SESSION_PREFIX = "session:";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function createSession(sessions: KVNamespace): Promise<string> {
  const token = randomToken();
  await sessions.put(`${SESSION_PREFIX}${token}`, "1", { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

export async function readSession(
  sessions: KVNamespace,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  return (await sessions.get(`${SESSION_PREFIX}${token}`)) !== null;
}

export async function deleteSession(
  sessions: KVNamespace,
  token: string | undefined,
): Promise<void> {
  if (token) await sessions.delete(`${SESSION_PREFIX}${token}`);
}

export const sessionCookie = (token: string) =>
  `session=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;

export const expiredSessionCookie = "session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

export function cookieValue(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
