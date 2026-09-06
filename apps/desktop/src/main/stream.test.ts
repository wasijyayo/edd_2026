import { describe, expect, it } from "vitest";

import { parseOpenAIStream } from "./stream.js";

describe("parseOpenAIStream", () => {
  it("emits text deltas from a Server-Sent Events response", () => {
    const chunks: string[] = [];

    parseOpenAIStream(
      [
        'data: {"choices":[{"delta":{"content":"こんにちは"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":"！"}}]}',
        "",
        "data: [DONE]",
      ].join("\n"),
      (chunk) => chunks.push(chunk),
    );

    expect(chunks).toEqual(["こんにちは", "！"]);
  });

  it("fails with a useful message for invalid provider data", () => {
    expect(() => parseOpenAIStream("data: not-json", () => undefined)).toThrow(
      "AI サービスから不正な応答を受信しました",
    );
  });
});
