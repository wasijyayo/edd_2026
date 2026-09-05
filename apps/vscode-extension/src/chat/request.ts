import type { AIRequest } from "../ai/types";
import type { CodeContext } from "@gakushu-sochi/domain";

/**
 * VS Code Chat の入力を、AI 層の共通契約へ変換する。
 *
 * VS Code の ChatRequest や LanguageModel 型をここへ持ち込まないため、
 * MockProvider・Workers AI・Local LLM も同じ AIRequest を受け取れる。
 */
export function createChatAIRequest(context: CodeContext, question: string): AIRequest {
  return {
    mode: "explain",
    question,
    context,
  };
}
