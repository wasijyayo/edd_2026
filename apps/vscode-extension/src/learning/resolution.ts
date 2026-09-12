import type { AIAnswer, ConversationTurn } from "@gakushu-sochi/domain";

/**
 * AIの解消判定を、自力解決イベントとして記録してよいか判断する。
 *
 * 初回応答には解消の根拠となる対話がない。モデルが出力形式に従わず
 * `resolved` を返しても、履歴がなければ習熟度へ反映しない。
 */
export function shouldRecordSolvedIndependently(
  history: readonly ConversationTurn[],
  answer: Pick<AIAnswer, "resolution" | "conceptIds">,
): boolean {
  return history.length > 0 && answer.resolution === "resolved" && answer.conceptIds.length > 0;
}
