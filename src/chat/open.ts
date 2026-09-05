/** VS Code コマンドを実行する最小の契約。ユニットテストで VS Code 本体を必要としない。 */
export type ExecuteCommand = (command: string, ...args: unknown[]) => PromiseLike<unknown>;

const CHAT_OPEN_COMMAND = "workbench.action.chat.open";
const CODE_COMPANION_PARTICIPANT = "@codecompanion ";

/**
 * Copilot Chat を開き、Code Companion 宛ての質問を未送信で入力する。
 *
 * 実際の選択コード・LSP 情報は Chat 入力の文字列に埋め込めない。
 * コマンド実行前に拡張側で収集して保持し、後続の Chat Participant が
 * リクエストを処理するときに参照する。
 */
export async function openCodeCompanionChat(
  contextId: string,
  executeCommand: ExecuteCommand,
): Promise<void> {
  await executeCommand(CHAT_OPEN_COMMAND, {
    query: `${CODE_COMPANION_PARTICIPANT}[context:${contextId}] `,
    isPartialQuery: true,
  });
}
