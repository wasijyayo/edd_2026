import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const extensionPackageJson = JSON.parse(
  await readFile(new URL("../apps/vscode-extension/package.json", import.meta.url), "utf8"),
);

test("dev は API と Desktop を失敗時に連携して並列起動する", () => {
  assert.match(packageJson.scripts.dev, /concurrently/);
  assert.match(packageJson.scripts.dev, /--kill-others-on-fail/);
  assert.match(packageJson.scripts.dev, /@gakushu-sochi\/api/);
  assert.match(packageJson.scripts.dev, /@gakushu-sochi\/desktop/);
});

test("ルートのテストは package scripts の契約も検証する", () => {
  assert.match(packageJson.scripts.test, /test:package-scripts/);
});

test("VS Code Extension はコンパイル後に VSIX を生成できる", () => {
  assert.equal(
    extensionPackageJson.scripts.package,
    "npm run compile && npx --no-install @vscode/vsce package --no-dependencies",
  );
  // npx --no-install はローカル依存のみを実行するため、lockfile 固定のバージョンが必須。
  assert.equal(extensionPackageJson.devDependencies["@vscode/vsce"], "3.9.2");
});
