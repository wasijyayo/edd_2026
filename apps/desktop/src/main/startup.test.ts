import { describe, expect, it } from "vitest";
import { shouldShowStartupWindow } from "./startup.js";

describe("shouldShowStartupWindow", () => {
  it("開発起動では操作画面を表示する", () => {
    expect(shouldShowStartupWindow(false)).toBe(true);
  });

  it("パッケージ版では常駐起動する", () => {
    expect(shouldShowStartupWindow(true)).toBe(false);
  });
});
