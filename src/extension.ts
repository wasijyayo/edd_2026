import * as vscode from "vscode";
import { MockProvider } from "./ai/mock";
import type { AIProvider } from "./ai/provider";
import { describePendingContext } from "./chat/context-summary";
import { openCodeCompanionChat } from "./chat/open";
import { PendingChatContext } from "./chat/pending-context";
import { createChatAIRequest } from "./chat/request";
import { readClipboard, readTerminalSelection } from "./context/clipboard";
import { collectFromEditor, collectFromText } from "./context/collector";
import { confirmSend } from "./ui/confirm";

/**
 * 開発中の確認用チャンネル。
 *
 * console.log は「デバッグ コンソール」に出るため、拡張機能開発ホスト側からは見えず、
 * 開発中に CodeContext の中身を確認しづらい。出力チャンネルなら
 * 拡張機能開発ホストの「出力」からそのまま読める。
 *
 * 表示/01 (#14) が回答表示UIを実装したら、その責務はそちらへ移る。
 */
let channel: vscode.OutputChannel;

/** CodeContext を出力チャンネルへ書き出す。 */
function logContext(label: string, value: unknown): void {
  channel.appendLine(`--- ${label} ---`);
  channel.appendLine(JSON.stringify(value, null, 2));
  channel.show(true);
}

export function activate(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("Code Companion");
  context.subscriptions.push(channel);
  channel.appendLine("Code Companion がアクティブになりました。");
  const pendingChatContext = new PendingChatContext();
  // 実AI接続 (#11) までは、UIとAI層の接続を確認できる既定実装を使う。
  const provider: AIProvider = new MockProvider();
  const chatParticipant = vscode.chat.createChatParticipant(
    "codeCompanion.chat",
    async (request, _chatContext, response) => {
      const contextMatch = request.prompt.match(/^\[context:([^\]]+)\]\s*/);
      const codeContext = contextMatch ? pendingChatContext.take(contextMatch[1]) : undefined;
      const question = contextMatch ? request.prompt.slice(contextMatch[0].length) : request.prompt;

      if (!codeContext) {
        response.markdown(describePendingContext(codeContext));
        return;
      }

      response.progress("Code Companion が考えています...");
      const aiResponse = await provider.ask(createChatAIRequest(codeContext, question));

      if (!aiResponse.ok) {
        response.markdown(`回答を生成できませんでした（${aiResponse.error.reason}）。`);
        return;
      }

      response.markdown(aiResponse.answer.text);
    },
  );
  context.subscriptions.push(chatParticipant);

  const askSelection = vscode.commands.registerCommand("codeCompanion.askSelection", async () => {
    const editor = vscode.window.activeTextEditor;

    // エディタが開いていない状態でコマンドパレットから実行された場合。
    // 何もせず終了する。エラーにはしない。
    if (!editor) {
      return;
    }

    const selection = editor.selection;

    if (selection.isEmpty) {
      vscode.window.showInformationMessage("コードを選択してください");
      return;
    }

    const codeContext = await collectFromEditor(editor);

    const contextId = pendingChatContext.set(codeContext);
    logContext("editor", codeContext);
    await openCodeCompanionChat(contextId, vscode.commands.executeCommand);
  });

  const askTerminalSelection = vscode.commands.registerCommand(
    "codeCompanion.askTerminalSelection",
    async () => {
      const result = await readTerminalSelection();

      if (!result.ok) {
        vscode.window.showInformationMessage("ターミナルでテキストを選択してください");
        return;
      }

      if (!(await confirmSend(result.text))) {
        return;
      }

      // ターミナル経由は内容しか運ばれてこないため Lv1 になる。
      // source はこのコマンドから呼ばれたという事実で確定させる。推測はしない。
      logContext("terminal", collectFromText(result.text, "terminal"));
    },
  );

  // エディタにもターミナルにも当てはまらない入力元（ブラウザ、他アプリ）向け。
  // キーバインドは割り当てない。他アプリから戻った直後はフォーカス位置が
  // 予測できず、askSelection や askTerminalSelection が誤って動くため。
  const askClipboard = vscode.commands.registerCommand("codeCompanion.askClipboard", async () => {
    const result = await readClipboard();

    if (!result.ok) {
      vscode.window.showInformationMessage(
        "クリップボードが空です。送りたい内容をコピーしてから実行してください。",
      );
      return;
    }

    if (!(await confirmSend(result.text))) {
      return;
    }

    // クリップボードは内容しか運ばず出所の情報を持たない。
    // このコマンドから呼ばれたという事実だけが source の根拠になる。
    logContext("clipboard", collectFromText(result.text, "clipboard"));
  });

  context.subscriptions.push(askSelection, askTerminalSelection, askClipboard);
}

export function deactivate(): void {}
