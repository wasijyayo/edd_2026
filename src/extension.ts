import * as vscode from "vscode";
import { readClipboard, readTerminalSelection } from "./context/clipboard";
import { confirmSend } from "./ui/confirm";

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

      if (!(await confirmSend(result.text))) {
        return;
      }

      console.log(result.text);
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

    console.log(result.text);
  });

  context.subscriptions.push(askSelection, askTerminalSelection, askClipboard);
}

export function deactivate(): void {}
