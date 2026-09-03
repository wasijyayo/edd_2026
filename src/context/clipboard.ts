import * as vscode from "vscode";

/**
 * ターミナルの選択範囲を取得した結果。
 *
 * 取得できなかった場合、理由を区別して返す。呼び出し側で案内を出し分けるため。
 */
export type ClipboardSelection = { ok: true; text: string } | { ok: false; reason: "no-selection" };

/**
 * クリップボード経由でターミナルの選択範囲を取得する。
 *
 * クリップボードはユーザーの持ち物なので、実行前の内容を必ず復元する。
 *
 * 何も選択されていない場合、`copySelection` はクリップボードを書き換えない。
 * その状態で読むと「以前ユーザーがコピーした無関係な内容」を取得してしまい、
 * トークンやパスワードをAIへ送信する事故になり得る。
 * そこで一度こちらで目印を書き込み、読み出した値が目印のままなら
 * 「選択されていなかった」と確実に判定する。
 */
export async function readTerminalSelection(): Promise<ClipboardSelection> {
  const original = await vscode.env.clipboard.readText();
  const sentinel = `__code-companion-sentinel-${Date.now()}__`;

  try {
    await vscode.env.clipboard.writeText(sentinel);
    await vscode.commands.executeCommand("workbench.action.terminal.copySelection");
    const copied = await vscode.env.clipboard.readText();

    if (copied === sentinel || copied.trim() === "") {
      return { ok: false, reason: "no-selection" };
    }

    return { ok: true, text: copied };
  } finally {
    // 途中で例外が起きてもユーザーのクリップボードは必ず戻す。
    await vscode.env.clipboard.writeText(original);
  }
}
