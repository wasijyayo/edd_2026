import { expect, test } from "vitest";
import { PendingChatContext } from "../chat/pending-context";

test("Chatを開く前に収集した文脈をParticipantのリクエストまで保持する", () => {
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

test("文脈を消費して後続の無関係なChatリクエストへ再利用しない", () => {
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

test("Chatを2回開いた場合も文脈を別々に保持する", () => {
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
