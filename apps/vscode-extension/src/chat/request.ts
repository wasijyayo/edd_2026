import type { AIRequest, CodeContext, ConversationTurn } from "@gakushu-sochi/domain";

/**
 * VS Code Chat の入力を、AI 層の共通契約へ変換する。
 *
 * VS Code の ChatRequest や LanguageModel 型をここへ持ち込まないため、
 * MockProvider・Workers AI・Local LLM も同じ AIRequest を受け取れる。
 * `history` も同じ理由で `ChatContext.history` ではなく変換済みの配列で受ける
 * （変換は extension.ts が担う）。
 */
export function createChatAIRequest(
  context: CodeContext,
  question: string,
  history: ConversationTurn[] = [],
): AIRequest {
  return {
    mode: "explain",
    question,
    context,
    // 空配列を持たせるとテストの期待値やログが history: [] で埋まり続けるため、
    // 無い場合はキー自体を省略する。
    ...(history.length > 0 ? { history } : {}),
  };
}
