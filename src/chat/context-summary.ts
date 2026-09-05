import type { CodeContext } from "../types/context";

/** Chat Participant が、今回どの文脈を受け取ったかを明示する文言を作る。 */
export function describePendingContext(context: CodeContext | undefined): string {
  if (!context) {
    return "選択コードの文脈は添付されていません。";
  }

  const language = context.languageId; // TODO: マッピングをするならここでやる
  const file = context.fileName ? ` / ${context.fileName}` : "";
  const definitionCount = context.definitions?.length ?? 0;
  const definitions = definitionCount > 0 ? `と、LSP で取得した定義 ${definitionCount} 件` : "";

  const details = language ? `（${language}${file}）` : "";

  return `選択コード${details}${definitions}を添付しました。`;
}
