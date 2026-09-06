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
  assert.match(extensionPackageJson.scripts.package, /^npm run compile && /);
  assert.match(extensionPackageJson.scripts.package, /@vscode\/vsce package/);
  assert.match(extensionPackageJson.scripts.package, /--no-dependencies/);
});
