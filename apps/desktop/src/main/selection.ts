export interface ClipboardItemLike {
  readonly types: readonly string[];
  getType(type: string): Promise<unknown>;
}

export interface ClipboardSnapshot {
  readonly items: readonly ClipboardItemLike[];
  readonly fingerprint: string;
}

/** クリップボードの 1 項目を、書き戻せる素の値として持つ。 */
export interface ClipboardEntry {
  readonly type: string;
  readonly value: Blob;
}

/**
 * clipboard.read() が返した ClipboardItem は clipboard.write() に渡せない
 * （Chromium が同一オブジェクトの書き戻しを拒否する）。復元に使えるよう、
 * 各 type の中身を読み出して素の値にほどく。
 * Blob 以外（bookmark など）は再構築できないため落とす。
 */
export async function toClipboardEntries(
  items: readonly ClipboardItemLike[],
): Promise<ClipboardEntry[][]> {
  const entries: ClipboardEntry[][] = [];
  for (const item of items) {
    const perItem: ClipboardEntry[] = [];
    for (const type of item.types) {
      const value = await item.getType(type);
      if (value instanceof Blob) perItem.push({ type, value });
    }
    if (perItem.length > 0) entries.push(perItem);
  }
  return entries;
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
