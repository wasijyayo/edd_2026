import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const extensionPackageJson = JSON.parse(
  await readFile(new URL("../apps/vscode-extension/package.json", import.meta.url), "utf8"),
);
const webPackageJson = JSON.parse(
  await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"),
);
const lefthook = await readFile(new URL("../lefthook.yml", import.meta.url), "utf8");
const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

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
  assert.equal(webPackageJson.scripts.deploy, "npm run build && wrangler deploy");
  assert.match(ci, /deploy:\n\s+name: Deploy Workers/);
  assert.match(ci, /needs: verify/);
  assert.match(ci, /github\.event_name == 'push'/);
  assert.match(ci, /npm run migrate:remote --workspace=@gakushu-sochi\/api/);
  assert.match(ci, /npm run deploy --workspace=@gakushu-sochi\/api/);
  assert.match(ci, /npm run deploy --workspace=@gakushu-sochi\/web/);
});

test("VS Code Extension はコンパイル後に VSIX を生成できる", () => {
  assert.equal(
    extensionPackageJson.scripts.package,
    "npm run compile && npx --no-install @vscode/vsce package --no-dependencies",
  );
  // npx --no-install はローカル依存のみを実行するため、lockfile 固定のバージョンが必須。
  assert.equal(extensionPackageJson.devDependencies["@vscode/vsce"], "3.9.2");
});
