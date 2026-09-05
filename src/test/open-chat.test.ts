import { expect, test } from "vitest";
import { openCodeCompanionChat } from "../chat/open";

test("opens Chat with @codecompanion inserted without sending it", async () => {
  const calls: unknown[][] = [];

  await openCodeCompanionChat("context-1", async (...args: unknown[]) => {
    calls.push(args);
  });

  expect(calls).toEqual([
    [
      "workbench.action.chat.open",
      {
        query: "@codecompanion [context:context-1] ",
        isPartialQuery: true,
      },
    ],
  ]);
});

test("does not hide an error when opening Chat fails", async () => {
  const failure = new Error("Chat を開けませんでした");

  await expect(
    openCodeCompanionChat("context-1", async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
});
