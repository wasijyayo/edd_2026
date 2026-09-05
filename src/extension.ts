import * as vscode from "vscode";
import { readClipboard, readTerminalSelection } from "./context/clipboard";
import { collectFromEditor, collectFromText } from "./context/collector";
import { confirmSend } from "./ui/confirm";
import { VSCodeLMProvider } from "./ai/vscodeLm";
import type { AIRequest } from "./types/ai";

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

    const context = await collectFromEditor(editor);

    logContext("editor", context);
  });

  // AI/02 (#11) の実機確認用。使い捨て。
  // VSCodeLMProvider を経由して実際に応答が返るか、Copilot未契約・同意拒否時に
  // クラッシュしないかを確認する。確認が終わったらこのコマンドごと削除する。
  const debugVscodeLmProvider = vscode.commands.registerCommand(
    "codeCompanion.debugVscodeLmProvider",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage("コードを選択してください");
        return;
      }

      const context = await collectFromEditor(editor);
      const request: AIRequest = { mode: "explain", context };

      channel.appendLine("--- VSCodeLMProvider probe (issue #11, throwaway) ---");

      const provider = new VSCodeLMProvider();
      const response = await provider.ask(request);

      if (response.ok) {
        channel.appendLine(`成功。model=${response.answer.model}`);
        channel.appendLine(response.answer.text);
      } else {
        channel.appendLine(
          `失敗。reason=${response.error.reason} detail=${response.error.detail ?? ""}`,
        );
      }

      channel.show(true);
    },
  );

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

  context.subscriptions.push(
    askSelection,
    askTerminalSelection,
    askClipboard,
    debugVscodeLmProvider,
  );
}

export function deactivate(): void {}
