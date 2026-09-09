import { describe, expect, it } from "vitest";

import { isSafeExternalUrl } from "./external-link.js";

describe("isSafeExternalUrl", () => {
  it("allows only http, https, and mailto URLs", () => {
    expect(isSafeExternalUrl("https://example.com/docs")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:8787")).toBe(true);
    expect(isSafeExternalUrl("mailto:support@example.com")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,unsafe")).toBe(false);
    expect(isSafeExternalUrl("file:///private/data")).toBe(false);
  });
});
