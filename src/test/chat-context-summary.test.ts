import { expect, test } from "vitest";
import { describePendingContext } from "../chat/context-summary";

test("Chatリクエストへ添付する選択コードとLSP定義を説明する", () => {
  expect(
    describePendingContext({
      code: "client.fetchUser()",
      source: "editor",
      contextLevel: 3,
      surroundingCode: "const user = client.fetchUser();",
      languageId: "typescript",
      fileName: "app.ts",
      definitions: [
        {
          fileName: "client.ts",
          code: "export function fetchUser() {}",
          startLine: 4,
          symbol: "fetchUser",
        },
      ],
    }),
  ).toBe("選択コード（typescript / app.ts）と、LSP で取得した定義 1 件を添付しました。");
});

test("収集済み文脈なしでChatを開いた場合を説明する", () => {
  expect(describePendingContext(undefined)).toBe("選択コードの文脈は添付されていません。");
});

test("言語情報のない文脈でもundefinedを表示しない", () => {
  expect(
    describePendingContext({
      code: "error output",
      source: "clipboard",
      contextLevel: 1,
      surroundingCode: "",
    }),
  ).toBe("選択コードを添付しました。");
});
