import { expect, test } from "vitest";
import { createChatAIRequest } from "../chat/request";

test("Chatの質問とLSP文脈をVS Code非依存のAIRequestへ変換する", () => {
  const context = {
    code: "database.Migrate(ctx, cfg.DB)",
    source: "editor" as const,
    contextLevel: 3 as const,
    surroundingCode: "func run() int {\n  database.Migrate(ctx, cfg.DB)\n}",
    languageId: "go",
    definitions: [
      {
        fileName: "internal/database/database.go",
        code: "func Migrate(ctx context.Context, cfg config.DBConfig) error { return nil }",
        startLine: 10,
        symbol: "Migrate",
      },
    ],
  };

  expect(createChatAIRequest(context, "この関数は何をしていますか？")).toEqual({
    mode: "explain",
    question: "この関数は何をしていますか？",
    context,
  });
});

test("会話履歴を渡すとAIRequestのhistoryへそのまま載る", () => {
  const context = {
    code: "value",
    source: "editor" as const,
    contextLevel: 2 as const,
    surroundingCode: "",
  };
  const history = [
    { role: "user" as const, text: "これは何ですか？" },
    { role: "assistant" as const, text: "ポインタレシーバです。" },
  ];

  expect(createChatAIRequest(context, "分かりました", history)).toEqual({
    mode: "explain",
    question: "分かりました",
    context,
    history,
  });
});
