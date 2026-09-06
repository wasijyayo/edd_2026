export interface SelectionDependencies {
  readText: () => string | Promise<string>;
  writeText: (text: string) => void | Promise<void>;
  copy: () => Promise<void>;
  wait: () => Promise<void>;
  restoreClipboard?: boolean;
}

export async function captureSelection(dependencies: SelectionDependencies): Promise<string> {
  const previousClipboard = await dependencies.readText();
  try {
    // コピー対象がない場合に、以前のクリップボードを選択結果と誤認しないため空にする。
    await dependencies.writeText("");
    await dependencies.copy();
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
      await dependencies.writeText(previousClipboard);
    }
  }
}
