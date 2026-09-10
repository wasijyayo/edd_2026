// PR レビューで 2 回以上指摘されたパターンを機械的に検査する。
// ルールの根拠と背景は .agents/rules/rules.md を参照。
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "out", "dist", ".wrangler", "build", ".git"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);

/** プロダクションのソースファイルを列挙する。生成物とテストは対象外。 */
async function collectSourceFiles() {
  const files = [];
  async function walk(dir) {
    const entries = await readdir(path.join(repoRoot, dir), { withFileTypes: true });
    for (const entry of entries) {
      const relative = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(relative);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (/\.test\.[^.]+$/.test(entry.name) || relative.includes(`${path.sep}test${path.sep}`))
        continue;
      files.push(relative);
    }
  }
  for (const root of SOURCE_ROOTS) await walk(root);
  return files.sort();
}

const sourceFiles = await collectSourceFiles();
const sources = new Map(
  await Promise.all(
    sourceFiles.map(async (file) => [file, await readFile(path.join(repoRoot, file), "utf8")]),
  ),
);

/**
 * `fetch(` の呼び出しごとに、引数リストの範囲を切り出す。
 *
 * 受信側（`globalThis.` など）では除外しない。`globalThis.fetch("...", { headers })`
 * のような実際の呼び出しまで隠れ、ルールが素通りするため。
 * 中継かどうかは呼び名ではなく引数の形で判定する（isRelayCall）。
 */
function findFetchCalls(text) {
  const calls = [];
  // 受信側は多階層を許す（`c.env.ASSETS.fetch` など）。1 階層しか拾わないと、
  // 中継の判定材料が落ちて実際の呼び出しと区別できなくなる。
  const pattern = /(^|[^\w.$])((?:[A-Za-z_$][\w$]*\.)*)fetch\s*\(/g;
  for (let match; (match = pattern.exec(text));) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < text.length; i += 1) {
      const char = text[i];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;
    const line = text.slice(0, match.index).split("\n").length;
    // 応答を束縛する変数名。ストリーム判定を「この呼び出しの応答」に限定するために使う。
    const callStart = match.index + match[1].length;
    const binding = text
      .slice(Math.max(0, callStart - 120), callStart)
      .match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?$/)?.[1];
    const receiver = match[2].replace(/\.$/, "");
    calls.push({ line, args: text.slice(open, end + 1), end, binding, receiver });
  }
  return calls;
}

/**
 * 受け取った値をそのまま渡すだけの中継か。上流の中断が伝播するので対象外にする。
 *
 * 判定は引数の形だけで行う。**すべての引数が識別子（またはプロパティ参照）**なら中継。
 * 文字列やオブジェクトのリテラルが 1 つでもあれば、その場で組み立てた要求なので中継ではない。
 *
 *   globalThis.fetch(input, init)      → 中継（DI のラッパ）
 *   c.env.ASSETS.fetch(c.req.raw)      → 中継
 *   deps.fetch(target, { method })     → 中継ではない
 *   fetch("https://...")               → 中継ではない
 *
 * 引数の個数では判定しない。1 個なら中継と見なすと、ごく普通の `fetch(url)` が
 * すり抜ける（PR#98 のレビューで実際に見つかった見逃し）。
 */
function isRelayCall(call) {
  const inner = call.args.slice(1, -1).trim();
  if (inner === "") return false;
  const allIdentifiers = inner
    .split(",")
    .every((argument) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(argument.trim()));
  if (!allIdentifiers) return false;
  // 裸の `fetch(url)` は中継ではなく、その場で投げる単発の要求である。
  // 中継は受け皿（`globalThis.` `c.env.ASSETS.` など）を通して呼ぶ形に限る。
  // 迷ったら違反側に倒す。見逃しは緑になって気付けない。
  return Boolean(call.receiver);
}

/**
 * 応答をストリームとして扱う呼び出しか。
 * SSE の要求か、応答の `body` を逐次読む書き方を手がかりにする。
 * ストリーミングに壁時計タイムアウトを付けると、長い生成が途中で打ち切られる。
 */
function isStreamingCall(text, call) {
  if (/alt=sse|text\/event-stream|stream(?:Generate|ing)/i.test(call.args)) return true;
  // 「この呼び出しの応答」を逐次読む／そのまま下流へ流す場合だけ対象外にする。
  // 変数名で束縛しないと document.body のような無関係な .body で
  // ルールが黙って適用されなくなる。判定は必ず厳しい側（違反とみなす側）へ倒す。
  if (!call.binding) return false;
  const scope = text.slice(call.end + 1, call.end + 2000);
  const body = String.raw`\b${call.binding}\.body\b`;
  // 逐次読み出し: response.body.getReader() など
  if (new RegExp(`${body}[\\s\\S]{0,40}?\\.(?:getReader|pipeTo|pipeThrough)\\(`).test(scope))
    return true;
  // 中継: new Response(upstream.body, ...) のように body をそのまま渡す
  return new RegExp(`new Response\\(\\s*${body}`).test(scope);
}

// RULE-001: 単発の外向き fetch にはタイムアウトを設定する。
// 応答が返らないまま無限に待つと、UI が固まり Worker は課金時間を食い潰す。
//
// ストリーミングと中継は対象外。壁時計タイムアウトを付けると、正常な応答が
// 途中で切れるバグになる。判定の根拠は .agents/rules/rules.md RULE-001 を参照。
test("RULE-001: 単発の外向き fetch には signal を渡す", () => {
  const violations = [];
  for (const [file, text] of sources) {
    for (const call of findFetchCalls(text)) {
      if (/\bsignal\s*:/.test(call.args)) continue;
      if (isRelayCall(call)) continue;
      if (isStreamingCall(text, call)) continue;
      violations.push(`${file}:${call.line}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `signal 未指定の単発 fetch がある。AbortSignal.timeout を渡すこと` +
      `（.agents/rules/rules.md RULE-001）:\n${violations.join("\n")}`,
  );
});

// RULE-002: 資格情報を載せた fetch はリダイレクトを追跡しない。
// 転送先へ Authorization ヘッダごと送られると、トークンが意図しない相手に渡る。
test('RULE-002: 資格情報を送る fetch は redirect: "error" を指定する', () => {
  const violations = [];
  for (const [file, text] of sources) {
    for (const call of findFetchCalls(text)) {
      const carriesCredential = /authorization|x-goog-api-key|api[-_]?key/i.test(call.args);
      if (!carriesCredential) continue;
      if (/redirect\s*:\s*"error"/.test(call.args)) continue;
      violations.push(`${file}:${call.line}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `資格情報を送る fetch がリダイレクトを自動追跡する` +
      `（.agents/rules/rules.md RULE-002）:\n${violations.join("\n")}`,
  );
});

// RULE-003: 設定から来た送信先 origin は HTTPS かループバックに限定する。
// 検査の本体は apps/web の単体テスト（apiOrigin の実挙動）。
// ここでは、その検査が消えていないことだけを確かめる。
test("RULE-003: origin 検証の単体テストが存在する", async () => {
  const workerTest = await readFile(
    path.join(repoRoot, "apps/web/src/worker/index.test.ts"),
    "utf8",
  );
  assert.match(
    workerTest,
    /loopback 以外の HTTP API_ORIGIN へ API トークンを送らない/,
    "loopback 以外の平文 HTTP を拒否するテストが消えている（.agents/rules/rules.md RULE-003）",
  );
});

// RULE-004: エラーを握りつぶすな。空の catch は eslint でも落ちるが、
// 生成物を含めた全域をここでも押さえる。
test("RULE-004: 空の catch を書かない", () => {
  const violations = [];
  for (const [file, text] of sources) {
    const pattern = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
    for (let match; (match = pattern.exec(text));) {
      violations.push(`${file}:${text.slice(0, match.index).split("\n").length}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `空の catch がある。記録するか型付きの結果へ変換すること` +
      `（.agents/rules/rules.md RULE-004）:\n${violations.join("\n")}`,
  );
});

// 検出器そのものの回帰テスト。
// 「本物の違反を見逃さない」ことは、緑のテストからは分からない。
// 実際にすり抜けた書き方（PR#98 のレビュー指摘）を固定しておく。
test("検出器: 中継と実際の呼び出しを取り違えない", () => {
  const cases = [
    // [コード, 中継とみなすか]
    ["const r = await globalThis.fetch(input, init);", true],
    ["app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));", true],
    // 裸の fetch(url) は中継ではない。単発の要求として検査対象にする。
    ["const r = await fetch(url);", false],
    ['const r = await fetch("https://example.test/a");', false],
    ['const r = await globalThis.fetch("https://x.test", { headers });', false],
    ["const r = await deps.fetch(target, { method: 'POST' });", false],
  ];
  for (const [code, expected] of cases) {
    const [call] = findFetchCalls(code);
    assert.ok(call, `fetch 呼び出しを検出できない: ${code}`);
    assert.equal(isRelayCall(call), expected, `中継判定が誤り: ${code}`);
  }
});

test("検出器: signal 無しの単発 fetch を見逃さない", () => {
  const violating = [
    'const r = await fetch("https://example.test/a");',
    'const r = await globalThis.fetch("https://x.test", { headers: { Authorization: t } });',
  ];
  for (const code of violating) {
    const [call] = findFetchCalls(code);
    assert.ok(!/\bsignal\s*:/.test(call.args), code);
    assert.ok(!isRelayCall(call), `中継として誤って除外される: ${code}`);
    assert.ok(!isStreamingCall(code, call), `ストリームとして誤って除外される: ${code}`);
  }
});

// ルール文書とテストが乖離しないよう、正典の存在自体も検査する。
test("ルールの正典が存在し、各ルールに出典 PR が記録されている", async () => {
  const rules = await readFile(path.join(repoRoot, ".agents/rules/rules.md"), "utf8");
  for (const id of ["RULE-001", "RULE-002", "RULE-003", "RULE-004", "RULE-005"]) {
    assert.match(rules, new RegExp(`## ${id}:`), `${id} の記載がない`);
  }
  const sections = rules.split(/^## /m).slice(1);
  for (const section of sections) {
    const id = section.slice(0, 8);
    assert.match(section, /\*\*出典\*\*:[\s\S]*?PR#\d+/, `${id} に出典の PR 番号がない`);
  }
});
