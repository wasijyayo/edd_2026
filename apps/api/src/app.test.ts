import { describe, expect, test } from "vitest";

describe("API Worker", () => {
  test("GET /health はサービス状態を返す", async () => {
    const module = await import("./app").catch(() => undefined);

    if (!module) {
      throw new Error("Hono application is not implemented");
    }

    const response = await module.app.request("https://api.example.test/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
