import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const extensionPackageJson = JSON.parse(
  await readFile(new URL("../apps/vscode-extension/package.json", import.meta.url), "utf8"),
);
const apiPackageJson = JSON.parse(
  await readFile(new URL("../apps/api/package.json", import.meta.url), "utf8"),
);
const webPackageJson = JSON.parse(
  await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"),
);
const lefthook = await readFile(new URL("../lefthook.yml", import.meta.url), "utf8");
const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const harvestWorkflow = await readFile(
  new URL("../.github/workflows/harvest-rules.yml", import.meta.url),
  "utf8",
);

test("dev は API・Desktop・Web を失敗時に連携して並列起動する", () => {
  assert.match(packageJson.scripts.dev, /concurrently/);
  assert.match(packageJson.scripts.dev, /--kill-others-on-fail/);
  assert.match(packageJson.scripts.dev, /@gakushu-sochi\/api/);
  assert.match(packageJson.scripts.dev, /@gakushu-sochi\/desktop/);
  assert.match(packageJson.scripts.dev, /@gakushu-sochi\/web/);
});

test("ルートのテストは package scripts の契約も検証する", () => {
  assert.match(packageJson.scripts.test, /test:package-scripts/);
});

test("Web の開発サーバーは API とポートを分け、Worker 経由で配信する", () => {
  assert.match(webPackageJson.scripts.dev, /wrangler dev/);
  assert.match(webPackageJson.scripts.dev, /--port 8788/);
});

test("Web の本番アセットを hook と CI でビルド検証する", () => {
  assert.equal(packageJson.scripts["build:web"], "npm run build --workspace=@gakushu-sochi/web");
  assert.match(lefthook, /web-build:\n\s+run: npm run build:web/);
  assert.match(ci, /name: Build Web assets\n\s+run: npm run build:web/);
});

test("main への push は検証後に API と Web を順にデプロイする", () => {
  assert.equal(
    apiPackageJson.scripts.deploy,
    "npm run compile --workspace=@gakushu-sochi/domain && wrangler deploy",
  );
  assert.equal(webPackageJson.scripts.deploy, "npm run build && wrangler deploy");
  assert.match(ci, /deploy:\n\s+name: Deploy Workers/);
  assert.match(ci, /needs: verify/);
  assert.match(ci, /github\.event_name == 'push'/);
  assert.match(ci, /npm run migrate:remote --workspace=@gakushu-sochi\/api/);
  assert.match(ci, /npm run deploy --workspace=@gakushu-sochi\/api/);
  assert.match(ci, /npm run deploy --workspace=@gakushu-sochi\/web/);
});

test("Web の初回 deploy は required secrets を secrets file で渡す", () => {
  assert.match(ci, /WEB_API_TOKEN: \$\{\{ secrets\.WEB_API_TOKEN \}\}/);
  assert.match(ci, /WEB_ACCESS_PASSPHRASE: \$\{\{ secrets\.WEB_ACCESS_PASSPHRASE \}\}/);
  assert.match(ci, /name: Require Web Worker secrets/);
  assert.match(ci, /--secrets-file "\$secrets_file"/);
});

test("VS Code Extension はコンパイル後に VSIX を生成できる", () => {
  assert.equal(
    extensionPackageJson.scripts.package,
    "npm run compile && npx --no-install @vscode/vsce package --no-dependencies",
  );
  // npx --no-install はローカル依存のみを実行するため、lockfile 固定のバージョンが必須。
  assert.equal(extensionPackageJson.devDependencies["@vscode/vsce"], "3.9.2");
});

test("PR レビュー由来のプロジェクトルールを hook と CI で検証する", () => {
  // ルール検査が npm script / CI / lefthook のどこからも呼ばれなくなると、
  // ファイルは残ったまま何も守らなくなる。配線そのものを検査する。
  assert.equal(
    packageJson.scripts["test:project-rules"],
    "node --test test/project-rules.test.mjs",
  );
  assert.match(packageJson.scripts.test, /test:project-rules/);
  assert.match(ci, /name: Check project rules\n\s+run: npm run test:project-rules/);
  assert.match(lefthook, /project-rules:\n\s+run: npm run test:project-rules/);
});

test("ルール候補の収穫が main への push で自動的に走る", () => {
  // 収穫が誰かの手動実行でしか動かないなら、ルールは増えない。
  // 起動条件・権限・通知先の配線を検査する。
  assert.equal(packageJson.scripts["harvest:rules"], "node scripts/harvest-review-rules.mjs");
  assert.match(harvestWorkflow, /on:\n\s+push:\n\s+branches:\n\s+- main/);
  assert.match(harvestWorkflow, /issues: write/);
  assert.match(harvestWorkflow, /npm run --silent harvest:rules -- --json/);
  assert.match(harvestWorkflow, /scripts\/format-rule-candidates\.mjs/);
  // 新しい候補が無いときは通知しない。鳴り続ける通知は無視されるようになる。
  assert.match(harvestWorkflow, /steps\.harvest\.outputs\.has_new == 'true'/);
});

test("収穫は採用済み・却下済みを差し引くための台帳を持つ", async () => {
  // 台帳が無いと同じ候補が毎回出て、通知はすぐ無視されるようになる。
  const harvester = await readFile(
    new URL("../scripts/harvest-review-rules.mjs", import.meta.url),
    "utf8",
  );
  assert.match(harvester, /\.agents\/rules\/rules\.md/);
  assert.match(harvester, /\.agents\/rules\/declined\.md/);
  const declined = await readFile(new URL("../.agents/rules/declined.md", import.meta.url), "utf8");
  assert.match(declined, /## 一覧/, "却下台帳の書式が壊れている");
});

test("AGENTS.md がルールの正典を読み込ませ、一覧が正典と一致する", async () => {
  // AGENTS.md（= CLAUDE.md）は Claude Code と Codex の両方が自動で読む唯一の入口。
  // ここから正典への導線が切れると、ルールは書いてあるだけで参照されなくなる。
  const agents = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");
  const rules = await readFile(new URL("../.agents/rules/rules.md", import.meta.url), "utf8");

  // Claude Code はこの行を展開して正典の全文をコンテキストへ載せる。
  assert.match(agents, /^@\.agents\/rules\/rules\.md$/m);

  // Codex は @ を展開しない（実測）。一覧表が唯一の手がかりになるので、
  // 正典に載っている ID がすべて表にあることを確認する。
  const canonical = [...rules.matchAll(/^## (RULE-\d+):/gm)].map((match) => match[1]);
  assert.ok(canonical.length > 0, "正典からルール ID を読み取れない");
  for (const id of canonical) {
    assert.match(agents, new RegExp(`\\| ${id}\\s`), `${id} が AGENTS.md の一覧に無い`);
  }
  const listed = [...agents.matchAll(/^\| (RULE-\d+)\s/gm)].map((match) => match[1]);
  for (const id of listed) {
    assert.ok(canonical.includes(id), `${id} は AGENTS.md にあるが正典に無い`);
  }
});
