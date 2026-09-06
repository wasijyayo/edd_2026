import { describe, expect, it, vi } from "vitest";
import { app } from "../app.js";

const PROFILE_RATE_LIMITER = {
  limit: () => Promise.resolve({ success: true }),
} as unknown as RateLimit;

describe("POST /v1/ai/responses", () => {
  it("認証済みの質問を Gemini のストリームとして返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    const response = await app.request(
      "https://api.example.test/v1/ai/responses",
      {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({
          selection: "const answer = 42",
          question: "これは何ですか？",
          model: "gemini-3.6-flash",
          temperature: 0.3,
          maxTokens: 1024,
        }),
      },
      {
        DEV_AUTH_TOKEN: "secret",
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "gemini-3.6-flash",
        PROFILE_RATE_LIMITER,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("[DONE]");
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"temperature":0.3'),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("API キー未設定をエラーとして返す", async () => {
    const response = await app.request(
      "https://api.example.test/v1/ai/responses",
      {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ selection: "code", question: "explain" }),
      },
      { DEV_AUTH_TOKEN: "secret", PROFILE_RATE_LIMITER },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "AI service is not configured" });
  });

  it("選択文が空なら拒否する", async () => {
    const response = await app.request(
      "https://api.example.test/v1/ai/responses",
      {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ selection: "", question: "質問" }),
      },
      { DEV_AUTH_TOKEN: "secret", GEMINI_API_KEY: "test-key", PROFILE_RATE_LIMITER },
    );

    expect(response.status).toBe(400);
  });

  it("質問が空なら解説依頼として Gemini に送る", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    const response = await app.request(
      "https://api.example.test/v1/ai/responses",
      {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ selection: "const answer = 42", question: "   " }),
      },
      { DEV_AUTH_TOKEN: "secret", GEMINI_API_KEY: "test-key", PROFILE_RATE_LIMITER },
    );

    expect(response.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(init?.body).toContain("この選択テキストを初心者にも分かるように解説してください。");
    vi.unstubAllGlobals();
  });
});
