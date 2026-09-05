import assert from "node:assert/strict";
import test from "node:test";
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

  assert.equal(response.ok, true);

  if (!response.ok) {
    assert.fail("MockProvider should return a successful response");
  }

  assert.equal(response.answer.mode, "hint");
  assert.equal(response.answer.model, "mock");
  assert.match(response.answer.text, /答えは書きません/);
});
