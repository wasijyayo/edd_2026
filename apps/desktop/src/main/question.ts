export const DEFAULT_EXPLANATION_QUESTION =
  "この選択テキストを初心者にも分かるように解説してください。";

export function normalizeQuestion(question: string): string {
  const normalized = question.trim();
  return normalized || DEFAULT_EXPLANATION_QUESTION;
}
