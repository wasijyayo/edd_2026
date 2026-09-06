import { describe, expect, it, vi } from "vitest";
import { app } from "../app.js";

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
        body: JSON.stringify({ selection: "const answer = 42", question: "これは何ですか？" }),
      },
      {
        DEV_AUTH_TOKEN: "secret",
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "gemini-2.0-flash",
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("[DONE]");
    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse",
      expect.objectContaining({ method: "POST" }),
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
      { DEV_AUTH_TOKEN: "secret" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "AI service is not configured" });
  });

  it("選択文または質問が空なら拒否する", async () => {
    const response = await app.request(
      "https://api.example.test/v1/ai/responses",
      {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ selection: "", question: "" }),
      },
      { DEV_AUTH_TOKEN: "secret", GEMINI_API_KEY: "test-key" },
    );

    expect(response.status).toBe(400);
  });
});
