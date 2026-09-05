import * as vscode from "vscode";

/** ダイアログに表示する本文の上限。長すぎるとダイアログが画面に収まらない。 */
const PREVIEW_MAX_LENGTH = 500;

/**
 * 送信前にユーザーへ内容を確認する。
 *
 * エディタの外から取り込んだテキストには、トークンやパスワードが含まれることが実際にある。
 * 特にクリップボード経由の場合、何時間も前にコピーした無関係な内容が残っている可能性があり、
 * 拡張側からは判別できない。このダイアログが唯一の防御になるため、省略しないこと。
 *
 * @returns ユーザーが送信を承諾したか
 */
export async function confirmSend(text: string): Promise<boolean> {
  const preview = text.length > PREVIEW_MAX_LENGTH ? `${text.slice(0, PREVIEW_MAX_LENGTH)}…` : text;

  const answer = await vscode.window.showWarningMessage(
    "この内容をAIへ送ります。トークンやパスワードが含まれていないか確認してください。",
    { modal: true, detail: preview },
    "送る",
  );

  return answer === "送る";
}
