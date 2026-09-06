import { describe, expect, it, vi } from "vitest";
import { activatePopup } from "./activation.js";

describe("activatePopup", () => {
  it("アプリを前面化してからポップアップを表示する", () => {
    const app = { focus: vi.fn() };
    const popup = { show: vi.fn(), focus: vi.fn() };

    activatePopup(app, popup);

    expect(app.focus).toHaveBeenCalledWith({ steal: true });
    expect(popup.show).toHaveBeenCalledOnce();
    expect(popup.focus).toHaveBeenCalledOnce();
  });
});
