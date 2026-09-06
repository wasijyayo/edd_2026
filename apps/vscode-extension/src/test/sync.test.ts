import { afterEach, expect, test, vi } from "vitest";
import type { LearningEvent } from "@gakushu-sochi/domain";
import { syncEvent } from "../learning/sync";

const EVENT: LearningEvent = {
  id: "event-1",
  occurredAt: "2026-09-06T00:00:00.000Z",
  type: "hint_used",
  origin: "vscode",
  conceptIds: ["go.defer"],
};

const CONFIG = {
  apiBaseUrl: "https://api.example.com",
  apiToken: "test-token",
  clientId: "client-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("トークン未設定なら送らずに理由を返す", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const outcome = await syncEvent(EVENT, { ...CONFIG, apiToken: "" });

  expect(outcome).toEqual({ ok: false, reason: expect.stringContaining("api.token") });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("受理されたら status: accepted を返す", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ status: "accepted" }] }), {
        status: 200,
      }),
    ),
  );

  const outcome = await syncEvent(EVENT, CONFIG);

  expect(outcome).toEqual({ ok: true, status: "accepted", reason: undefined });
});

test("正しいURL・ヘッダー・ボディでPOSTする", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ results: [{ status: "accepted" }] })));
  vi.stubGlobal("fetch", fetchMock);

  await syncEvent(EVENT, CONFIG);

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.com/v1/learning-events:sync",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/json",
        authorization: "Bearer test-token",
      }),
    }),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  expect(body).toEqual({ clientId: "client-1", events: [EVENT] });
});

test("末尾のスラッシュがあっても二重にならない", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ results: [{ status: "accepted" }] })));
  vi.stubGlobal("fetch", fetchMock);

  await syncEvent(EVENT, { ...CONFIG, apiBaseUrl: "https://api.example.com/" });

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.com/v1/learning-events:sync",
    expect.anything(),
  );
});

test("HTTPエラーなら理由付きで失敗を返す", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));

  const outcome = await syncEvent(EVENT, CONFIG);

  expect(outcome).toEqual({ ok: false, reason: "HTTP 401" });
});

test("ネットワークエラーなら例外を投げず失敗を返す", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  const outcome = await syncEvent(EVENT, CONFIG);

  expect(outcome.ok).toBe(false);
  expect((outcome as { reason: string }).reason).toContain("fetch failed");
});

test("重複ならstatus: duplicateと理由を返す", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [{ status: "duplicate", reason: undefined }] })),
      ),
  );

  const outcome = await syncEvent(EVENT, CONFIG);

  expect(outcome).toEqual({ ok: true, status: "duplicate", reason: undefined });
});

test("resultsが空ならサーバー不整合として失敗を返す", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }))));

  const outcome = await syncEvent(EVENT, CONFIG);

  expect(outcome.ok).toBe(false);
});
