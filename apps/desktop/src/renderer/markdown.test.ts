import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./markdown.js";

describe("renderMarkdown", () => {
  it("renders common Markdown as readable HTML without allowing raw HTML", () => {
    const rendered = renderMarkdown(
      "## 要点\n\n- 1つ目\n- 2つ目\n\n`value` を確認します。\n\n[公式サイト](https://example.com)\n\n<script>alert('unsafe')</script>",
    );

    expect(rendered).toContain("<h2>要点</h2>");
    expect(rendered).toContain("<li>1つ目</li>");
    expect(rendered).toContain("<code>value</code>");
    expect(rendered).toContain('<a href="https://example.com">公式サイト</a>');
    expect(rendered).toContain("&lt;script&gt;");
    expect(rendered).not.toContain("<script>");
    expect(renderMarkdown("[unsafe](javascript:alert(1))")).not.toContain("<a");
    expect(renderMarkdown("[unsafe](data:text/html,unsafe)")).not.toContain("<a");
  });
});
