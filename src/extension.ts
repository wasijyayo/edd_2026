import * as vscode from "vscode";
import type { AIProvider } from "./ai/provider";
import { VSCodeLMProvider } from "./ai/vscodeLm";
import { CONSUMED_CONTEXT_MESSAGE, describePendingContext } from "./chat/context-summary";
import { openCodeCompanionChat } from "./chat/open";
import { PendingChatContext } from "./chat/pending-context";
import { createChatAIRequest } from "./chat/request";
import { readClipboard, readTerminalSelection } from "./context/clipboard";
import { collectFromEditor, collectFromText } from "./context/collector";
import type { CodeContext } from "./types/context";
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
  // ユーザー自身の Copilot 契約を使って回答を生成する。
  const provider: AIProvider = new VSCodeLMProvider();

  /** 文脈を保持して、最初の質問を入力済みの Code Companion Chat を開く。 */
  async function openChatForContext(codeContext: CodeContext): Promise<void> {
    const contextId = pendingChatContext.set(codeContext);
    logContext(codeContext.source, codeContext);

    try {
      await openCodeCompanionChat(contextId, vscode.commands.executeCommand);
    } catch (error) {
      // Chat が開かなければ Participant は呼ばれず、保持した文脈は永久に取り出されない。
      // 捨てるのは確実だが、黙って捨てるとユーザーは押した操作が無反応にしか見えない。
      // 破棄・ログ・通知の3つを揃える。
      pendingChatContext.discard(contextId);
      channel.appendLine(`Chat を開けませんでした: ${String(error)}`);
      vscode.window.showErrorMessage(
        "Code Companion Chat を開けませんでした。GitHub Copilot Chat が有効か確認してください。",
      );
    }
  }

  const chatParticipant = vscode.chat.createChatParticipant(
    "codeCompanion.chat",
    async (request, _chatContext, response) => {
      const contextMatch = request.prompt.match(/^\[context:([^\]]+)\]\s*/);
      const question = contextMatch ? request.prompt.slice(contextMatch[0].length) : request.prompt;

      // マーカーが無い場合と、マーカーはあるが消費済みの場合を混ぜない。
      // 後者はユーザーの質問が捨てられる状況であり、復帰手段まで伝える必要がある。
      if (!contextMatch) {
        response.markdown(describePendingContext(undefined));
        return;
      }

      const codeContext = pendingChatContext.take(contextMatch[1]);

      if (!codeContext) {
        response.markdown(CONSUMED_CONTEXT_MESSAGE);
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

    await openChatForContext(codeContext);
  });

  const askTerminalSelection = vscode.commands.registerCommand(
    "codeCompanion.askTerminalSelection",
    async () => {
      const result = await readTerminalSelection();

      if (!result.ok) {
        // reason ごとに案内を変える。ClipboardSelection が理由を区別して返すのは
        // 呼び出し側で出し分けるためであり、まとめると次の操作が分からなくなる。
        vscode.window.showInformationMessage(
          result.reason === "no-selection"
            ? "ターミナルでテキストを選択してください"
            : "選択されたテキストが空です。内容のある範囲を選択してください。",
        );
        return;
      }

      if (!(await confirmSend(result.text))) {
        return;
      }

      // ターミナル経由は内容しか運ばれてこないため Lv1 になる。
      // source はこのコマンドから呼ばれたという事実で確定させる。推測はしない。
      await openChatForContext(collectFromText(result.text, "terminal"));
    },
  );

  // エディタにもターミナルにも当てはまらない入力元（ブラウザ、他アプリ）向け。
  // キーバインドは割り当てない。他アプリから戻った直後はフォーカス位置が
  // 予測できず、askSelection や askTerminalSelection が誤って動くため。
  const askClipboard = vscode.commands.registerCommand("codeCompanion.askClipboard", async () => {
    const result = await readClipboard();

    if (!result.ok) {
      // readClipboard は現状 "empty" しか返さないが、それに寄りかからない。
      // 種別が増えたときに「クリップボードが空です」と誤った案内を出し続けるより、
      // ここで分岐しておいて理由をそのまま伝えるほうが崩れ方が小さい。
      vscode.window.showInformationMessage(
        result.reason === "empty"
          ? "クリップボードが空です。送りたい内容をコピーしてから実行してください。"
          : `クリップボードから取得できませんでした（${result.reason}）。`,
      );
      return;
    }

    if (!(await confirmSend(result.text))) {
      return;
    }

    // クリップボードは内容しか運ばず出所の情報を持たない。
    // このコマンドから呼ばれたという事実だけが source の根拠になる。
    await openChatForContext(collectFromText(result.text, "clipboard"));
  });

  context.subscriptions.push(askSelection, askTerminalSelection, askClipboard);
}

export function deactivate(): void {}
