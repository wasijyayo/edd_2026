#!/usr/bin/env node
// harvest-review-rules.mjs --json の出力を、GitHub Issue の本文へ整形する。
//
// 出すのは「候補」と「貼り付け用の下書き」までで、採否は書かない。
// 判断を奪わずに、書き写す手間だけを省くのが狙い。
import { readFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("usage: format-rule-candidates.mjs <candidates.json>");
  process.exit(1);
}

const { total, candidates } = JSON.parse(readFileSync(source, "utf8"));
const fresh = candidates.filter((cluster) => cluster.status === "new");

// GitHub の Issue 本文は 65536 文字まで。超えると API 全体が失敗するので、
// 落とすなら黙って切るのではなく、切ったことを本文に書く。
const LIMIT = 60000;

const lines = [];
lines.push("`npm run harvest:rules` が、まだ検討していないルール候補を見つけた。");
lines.push("");
lines.push(
  `レビュー指摘 ${total} 件のうち、**同じクラスの指摘が 2 件以上あり、かつ実際に修正されたもの**が ${fresh.length} クラスタ。`,
);
lines.push("");
lines.push("## やること");
lines.push("");
lines.push("各候補について、次のどちらかを選ぶ。**放置すると次の push でまた出てくる。**");
lines.push("");
lines.push("- **採用する** → `.agents/rules/rules.md` に出典 PR 付きで追記する。");
lines.push(
  "  機械的に検査できるなら `test/project-rules.test.mjs` にテストを足す（markdown は助言、CI は強制）。",
);
lines.push("- **採用しない** → `.agents/rules/declined.md` に理由付きで記録する。");
lines.push("");
// Issue 本文からはリポジトリ相対リンクが解決されないため、絶対 URL を組み立てる。
const repo = process.env.GITHUB_REPOSITORY;
const docUrl = (file) => (repo ? `https://github.com/${repo}/blob/main/${file}` : file);
lines.push(`判断の基準は [docs/guardrails.md](${docUrl("docs/guardrails.md")}) を参照。`);
lines.push("");

for (const cluster of fresh) {
  lines.push("---");
  lines.push("");
  lines.push(`## ${cluster.category} — \`${cluster.area}\`（${cluster.items.length} 件）`);
  lines.push("");
  for (const item of cluster.items) {
    const mark = item.addressed ? "✓ 修正済み" : "  未対応";
    lines.push(`- ${mark} PR#${item.pr} ${item.severity} \`${item.path}\``);
    lines.push(`  ${item.headline}`);
  }
  lines.push("");
  lines.push("<details><summary>採用する場合の下書き（rules.md に貼る）</summary>");
  lines.push("");
  lines.push("```markdown");
  lines.push(`## RULE-XXX: （ここに要旨を書く）`);
  lines.push("");
  lines.push("- **enforcement**: `test` / `lint` / `doc` のいずれか");
  lines.push(`- **対象**: \`${cluster.area}\``);
  const sources = cluster.items
    .filter((item) => item.addressed)
    .map((item) => `PR#${item.pr} \`${item.path}\``)
    .join(" / ");
  lines.push(`- **出典**: ${sources || "（修正実績のある指摘を書く）"}`);
  lines.push("");
  lines.push("（なぜそれが問題になるのか、どう書くのが正しいのかを書く）");
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");
  lines.push("<details><summary>採用しない場合の下書き（declined.md に貼る）</summary>");
  lines.push("");
  lines.push("```markdown");
  lines.push(`- \`${cluster.key}\` — （却下理由）（${new Date().toISOString().slice(0, 10)}）`);
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("<sub>この Issue は `.github/workflows/harvest-rules.yml` が更新する。");
lines.push("候補がなくなれば通知は止まる。</sub>");

let body = lines.join("\n");
if (body.length > LIMIT) {
  body = `${body.slice(0, LIMIT)}\n\n---\n\n**（候補が多いため本文を省略した。全量は \`npm run harvest:rules\` で確認すること。）**`;
}
console.log(body);
