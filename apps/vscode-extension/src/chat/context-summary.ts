import type { CodeContext } from "@gakushu-sochi/domain";

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

/**
 * 消費済みの文脈IDを指すリクエストに返す案内。
 *
 * 文脈は最初の1回で取り出され消える（PendingChatContext.take）。同じプリフィル文を
 * 2回送る・リロード後に送るなどで、マーカーはあるが中身が無い状態は普通に起こる。
 * これを「文脈なし」と同じ扱いにすると、ユーザーの質問が理由の説明もなく捨てられる。
 * 復帰手段まで含めて必ず伝えること。
 *
 * 文言は入力経路に依存させない。この定数は editor / terminal / clipboard の
 * どの経路から来たリクエストにも返るため、「コードを選択して」のように
 * editor だけを指す表現にすると、他の経路では実行できない案内になる。
 */
export const CONSUMED_CONTEXT_MESSAGE =
  "この文脈は既に使われています。もう一度同じ操作をやり直してください。";
