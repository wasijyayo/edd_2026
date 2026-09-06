export interface ClipboardItemLike {
  readonly types: readonly string[];
  getType(type: string): Promise<unknown>;
}

export interface ClipboardSnapshot {
  readonly items: readonly ClipboardItemLike[];
  readonly fingerprint: string;
}

/**
 * Electron の bookmark 形式。getType("electron application/bookmark") だけは
 * Blob ではなくこの形の値を返し、同じ形のまま ClipboardItem へ書き戻せる。
 * Electron の型に依存させないため、必要な形だけをここで定義する。
 */
export interface ClipboardBookmarkLike {
  readonly title: string;
  readonly url: string;
}

/** getType() が Blob ではなく bookmark を返す唯一の MIME type。 */
export const BOOKMARK_TYPE = "electron application/bookmark";

/** クリップボードの 1 項目を、書き戻せる素の値として持つ。 */
export interface ClipboardEntry {
  readonly type: string;
  readonly value: Blob | ClipboardBookmarkLike;
}

export function isBookmark(value: unknown): value is ClipboardBookmarkLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ClipboardBookmarkLike).title === "string" &&
    typeof (value as ClipboardBookmarkLike).url === "string"
  );
}

/**
 * clipboard.read() が返した ClipboardItem は clipboard.write() に渡せない
 * （Chromium が同一オブジェクトの書き戻しを拒否する）。復元に使えるよう、
 * 各 type の中身を読み出して素の値にほどく。
 *
 * 書き戻せるのは Blob と bookmark の 2 形式のみ。それ以外の値は
 * ClipboardItem を組み立て直せないため落とす（この分岐に入ったことは
 * onUnreconstructable で観測できる）。
 */
export async function toClipboardEntries(
  items: readonly ClipboardItemLike[],
  onUnreconstructable?: (type: string, value: unknown) => void,
): Promise<ClipboardEntry[][]> {
  const entries: ClipboardEntry[][] = [];
  for (const item of items) {
    const perItem: ClipboardEntry[] = [];
    for (const type of item.types) {
      const value = await item.getType(type);
      if (value instanceof Blob) perItem.push({ type, value });
      else if (type === BOOKMARK_TYPE && isBookmark(value)) perItem.push({ type, value });
      else onUnreconstructable?.(type, value);
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
