import { expect, test } from "vitest";
import { MockProvider } from "../ai/mock";

test("MockProvider returns a hint response for hint requests", async () => {
  const provider = new MockProvider();

  const response = await provider.ask({
    mode: "hint",
    context: {
      code: "const answer = 42;",
      source: "editor",
      contextLevel: 2,
      surroundingCode: "const answer = 42;",
    },
  });

  expect(response.ok).toBe(true);

  if (!response.ok) {
    throw new Error("MockProvider should return a successful response");
  }

  expect(response.answer.mode).toBe("hint");
  expect(response.answer.model).toBe("mock");
  expect(response.answer.text).toMatch(/答えは書きません/);
});
