import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "./question.js";

describe("normalizeQuestion", () => {
  it("uses an explanation prompt when the question is empty", () => {
    expect(normalizeQuestion("   ")).toBe(
      "この選択テキストを初心者にも分かるように解説してください。",
    );
  });

  it("keeps a non-empty question", () => {
    expect(normalizeQuestion("なぜ動きますか？")).toBe("なぜ動きますか？");
  });
});
