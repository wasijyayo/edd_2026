import { expect, test } from "vitest";
import { PendingChatContext } from "../chat/pending-context";

test("keeps the context collected before Chat opens for the participant request", () => {
  const pending = new PendingChatContext();
  const context = {
    code: "client.fetchUser()",
    source: "editor" as const,
    contextLevel: 3 as const,
    surroundingCode: "const user = client.fetchUser();",
    languageId: "typescript",
    definitions: [
      {
        fileName: "client.ts",
        code: "export function fetchUser() {}",
        startLine: 4,
        symbol: "fetchUser",
      },
    ],
  };

  const id = pending.set(context);

  expect(pending.take(id)).toBe(context);
});

test("consumes context so a later unrelated Chat request cannot reuse it", () => {
  const pending = new PendingChatContext();
  const context = {
    code: "value",
    source: "editor" as const,
    contextLevel: 2 as const,
    surroundingCode: "const value = 1;",
  };
  const id = pending.set(context);

  expect(pending.take(id)).toBe(context);
  expect(pending.take(id)).toBeUndefined();
});

test("keeps contexts separate when Chat is opened twice", () => {
  const pending = new PendingChatContext();
  const first = {
    code: "first",
    source: "editor" as const,
    contextLevel: 2 as const,
    surroundingCode: "",
  };
  const second = {
    code: "second",
    source: "editor" as const,
    contextLevel: 2 as const,
    surroundingCode: "",
  };
  const firstId = pending.set(first);
  const secondId = pending.set(second);

  expect(pending.take(firstId)).toBe(first);
  expect(pending.take(secondId)).toBe(second);
});
