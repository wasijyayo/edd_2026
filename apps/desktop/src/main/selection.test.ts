import { describe, expect, it, vi } from "vitest";

import { captureSelection } from "./selection.js";

describe("captureSelection", () => {
  it("returns the copied selection and restores the prior clipboard", async () => {
    let clipboard = "prior clipboard";
    const copy = vi.fn(async () => {
      clipboard = "  selected source  ";
    });

    await expect(
      captureSelection({
        readText: () => clipboard,
        writeText: (text) => {
          clipboard = text;
        },
        copy,
        wait: async () => undefined,
      }),
    ).resolves.toBe("selected source");

    expect(copy).toHaveBeenCalledOnce();
    expect(clipboard).toBe("prior clipboard");
  });

  it("reports an empty selection while still restoring the clipboard", async () => {
    let clipboard = "prior clipboard";

    await expect(
      captureSelection({
        readText: () => clipboard,
        writeText: (text) => {
          clipboard = text;
        },
        copy: async () => undefined,
        wait: async () => undefined,
      }),
    ).rejects.toThrow("選択されたテキストを取得できませんでした");

    expect(clipboard).toBe("prior clipboard");
  });

  it("can leave the copied text in the clipboard when restoration is disabled", async () => {
    let clipboard = "prior clipboard";
    await captureSelection({
      readText: () => clipboard,
      writeText: (text) => {
        clipboard = text;
      },
      copy: async () => {
        clipboard = "selected source";
      },
      wait: async () => undefined,
      restoreClipboard: false,
    });
    expect(clipboard).toBe("selected source");
  });

  it("waits for asynchronous clipboard writes before copying", async () => {
    let clipboard = "prior clipboard";
    const selection = await captureSelection({
      readText: () => clipboard,
      writeText: async (text) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        clipboard = text;
      },
      copy: async () => {
        if (clipboard === "") clipboard = "selected source";
      },
      wait: async () => undefined,
    });
    expect(selection).toBe("selected source");
    expect(clipboard).toBe("prior clipboard");
  });
});
