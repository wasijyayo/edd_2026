import { describe, expect, test } from "vitest";
import { app } from "./app";

describe("API Worker", () => {
  test("GET /health はサービス状態を返す", async () => {
    const response = await app.request("https://api.example.test/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
