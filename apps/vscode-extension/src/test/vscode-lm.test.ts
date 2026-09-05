import { expect, test, vi } from "vitest";

const { LanguageModelError, selectChatModels } = vi.hoisted(() => {
  class MockLanguageModelError extends Error {
    static NoPermissions = () => undefined;
    static Blocked = () => undefined;
    static NotFound = () => undefined;
  }

  return {
    LanguageModelError: MockLanguageModelError,
    selectChatModels: vi.fn(),
  };
});

vi.mock("vscode", () => ({
  LanguageModelChatMessage: {
    User: vi.fn(),
  },
  LanguageModelError,
  lm: {
    selectChatModels,
  },
}));

import { VSCodeLMProvider } from "../ai/vscodeLm";

test("モデル選択に失敗したときは例外ではなく失敗応答を返す", async () => {
  selectChatModels.mockRejectedValueOnce(new Error("model selection failed"));

  const response = await new VSCodeLMProvider().ask({
    mode: "hint",
    context: {
      code: "const answer = 42;",
      source: "editor",
      contextLevel: 2,
      surroundingCode: "const answer = 42;",
    },
  });

  expect(response).toEqual({
    ok: false,
    error: {
      reason: "unknown",
      detail: "Error: model selection failed",
    },
  });
});
