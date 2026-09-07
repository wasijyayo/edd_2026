import { expect, test } from "vitest";
import { createSession, deleteSession, readSession } from "./session.js";

class MemoryKv {
  readonly values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

test("opaque なセッションを KV に保存し、Cookie 値から検証できる", async () => {
  const kv = new MemoryKv();

  const token = await createSession(kv as unknown as KVNamespace);

  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(readSession(kv as unknown as KVNamespace, token)).resolves.toBe(true);
  expect([...kv.values.keys()]).toEqual([`session:${token}`]);
});

test("失効したセッションは検証できない", async () => {
  const kv = new MemoryKv();
  const token = await createSession(kv as unknown as KVNamespace);

  await deleteSession(kv as unknown as KVNamespace, token);

  await expect(readSession(kv as unknown as KVNamespace, token)).resolves.toBe(false);
});
