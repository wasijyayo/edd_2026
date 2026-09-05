/** VS Code コマンドを実行する最小の契約。ユニットテストで VS Code 本体を必要としない。 */
export type ExecuteCommand = (command: string, ...args: unknown[]) => PromiseLike<unknown>;

const CHAT_OPEN_COMMAND = "workbench.action.chat.open";
const GAKUSHU_SOCHI_PARTICIPANT = "@gakushu-sochi ";

/**
 * Copilot Chat を開き、Gakushu Sochi 宛ての質問を未送信で入力する。
 *
 * 実際の選択コード・LSP 情報は Chat 入力の文字列に埋め込めない。
 * コマンド実行前に拡張側で収集して保持し、後続の Chat Participant が
 * リクエストを処理するときに参照する。
 */
export async function openGakushuSochiChat(
  contextId: string,
  executeCommand: ExecuteCommand,
): Promise<void> {
  await executeCommand(CHAT_OPEN_COMMAND, {
    query: `${GAKUSHU_SOCHI_PARTICIPANT}[context:${contextId}] `,
    isPartialQuery: true,
  });
}
