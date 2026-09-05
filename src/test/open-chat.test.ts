import { expect, test } from "vitest";
import { openCodeCompanionChat } from "../chat/open";

test("@codecompanionを入力済みかつ未送信でChatを開く", async () => {
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

test("Chatを開けないエラーを握り潰さない", async () => {
  const failure = new Error("Chat を開けませんでした");

  await expect(
    openCodeCompanionChat("context-1", async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
});
