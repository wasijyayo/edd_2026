export interface ClipboardItemLike {
  readonly types: readonly string[];
  getType(type: string): Promise<unknown>;
}

export interface ClipboardSnapshot {
  readonly items: readonly ClipboardItemLike[];
  readonly fingerprint: string;
}

export interface SelectionDependencies {
  readText: () => string | Promise<string>;
  copy: () => Promise<void>;
  wait: () => Promise<void>;
  readClipboard?: () => Promise<ClipboardSnapshot>;
  writeClipboard?: (items: readonly ClipboardItemLike[]) => Promise<void>;
  writeText?: (text: string) => void | Promise<void>;
  restoreClipboard?: boolean;
}

export async function captureSelection(dependencies: SelectionDependencies): Promise<string> {
  const previousClipboard = dependencies.readClipboard
    ? await dependencies.readClipboard()
    : undefined;
  const previousText = previousClipboard === undefined ? await dependencies.readText() : undefined;
  let capturedClipboard: ClipboardSnapshot | undefined;
  try {
    // コピー対象がない場合に、以前のクリップボードを選択結果と誤認しないため空にする。
    if (dependencies.writeClipboard) await dependencies.writeClipboard([]);
    else if (dependencies.writeText) await dependencies.writeText("");
    await dependencies.copy();
    if (dependencies.readClipboard) capturedClipboard = await dependencies.readClipboard();
    await dependencies.wait();
    const selection = (await dependencies.readText()).trim();
    if (!selection) {
      throw new Error(
        "選択されたテキストを取得できませんでした。テキストを選択してから再試行してください。",
      );
    }
    return selection;
  } finally {
    if (dependencies.restoreClipboard !== false) {
      if (dependencies.readClipboard && dependencies.writeClipboard) {
        const currentClipboard = await dependencies.readClipboard();
        if (
          capturedClipboard !== undefined &&
          previousClipboard !== undefined &&
          currentClipboard.fingerprint === capturedClipboard.fingerprint
        ) {
          await dependencies.writeClipboard(previousClipboard.items);
        }
      } else if (dependencies.writeText && previousText !== undefined) {
        await dependencies.writeText(previousText);
      }
    }
  }
}
