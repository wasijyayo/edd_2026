import { expect, test } from "vitest";
import { describePendingContext } from "../chat/context-summary";

test("describes the selected code and LSP definitions attached to a Chat request", () => {
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
  ).toBe("選択コード（TypeScript / app.ts）と、LSP で取得した定義 1 件を添付しました。");
});

test("explains when Chat was opened without a collected context", () => {
  expect(describePendingContext(undefined)).toBe("選択コードの文脈は添付されていません。");
});

test("does not show undefined when the collected context has no language", () => {
  expect(
    describePendingContext({
      code: "error output",
      source: "clipboard",
      contextLevel: 1,
      surroundingCode: "",
    }),
  ).toBe("選択コードを添付しました。");
});
