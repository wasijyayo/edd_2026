import * as vscode from "vscode";
import { readTerminalSelection } from "./context/clipboard";

const PREVIEW_MAX_LENGTH = 500;

export function activate(context: vscode.ExtensionContext): void {
  const askSelection = vscode.commands.registerCommand("codeCompanion.askSelection", () => {
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

    const selectedText = editor.document.getText(selection);

    console.log(selectedText);
  });

  const askTerminalSelection = vscode.commands.registerCommand(
    "codeCompanion.askTerminalSelection",
    async () => {
      const result = await readTerminalSelection();

      if (!result.ok) {
        vscode.window.showInformationMessage("ターミナルでテキストを選択してください");
        return;
      }

      // エラー文にはトークンやパスワードが含まれることが実際にある。
      // 送信前に内容を確認する機会を必ず作る。
      const preview =
        result.text.length > PREVIEW_MAX_LENGTH
          ? `${result.text.slice(0, PREVIEW_MAX_LENGTH)}…`
          : result.text;

      const answer = await vscode.window.showWarningMessage(
        "この内容をAIへ送ります。トークンやパスワードが含まれていないか確認してください。",
        { modal: true, detail: preview },
        "送る",
      );

      if (answer !== "送る") {
        return;
      }

      console.log(result.text);
    },
  );

  context.subscriptions.push(askSelection, askTerminalSelection);
}

export function deactivate(): void {}
