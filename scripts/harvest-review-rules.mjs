#!/usr/bin/env node
// PR レビューのインラインコメントを収集し、ルールに昇格させる候補を提示する。
//
// 「1 件の指摘 = 1 ルール」にすると、ルール集は誰も読まない長さになる。
// ここでは同じクラスの指摘が複数回出たものだけを候補として出す。
// 採否は人間が決める。このスクリプトは何も書き換えない。
//
// 使い方:
//   npm run harvest:rules                # 全候補を表示
//   npm run harvest:rules -- --new-only  # 未採用・未却下の候補だけ
//   npm run harvest:rules -- --json      # 機械可読（hasNew フラグ付き）
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

const args = process.argv.slice(2);
const minCluster = Number(valueOf("--min") ?? 2);
const asJson = args.includes("--json");
const newOnly = args.includes("--new-only");

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function gh(endpointArgs) {
  const { stdout } = await run("gh", endpointArgs, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** CodeRabbit のメタ行 `_🔒 Security & Privacy_ | _🟠 Major_ | ...` を分解する。 */
function parseMeta(body) {
  const category = body.match(/^_([^_\n]+)_/)?.[1]?.trim();
  const severity = body.match(/_((?:🔴|🟠|🟡|🔵)[^_\n]*)_/)?.[1]?.trim();
  return { category: category ?? "(未分類)", severity: severity ?? "-" };
}

/** 指摘の要点。CodeRabbit は太字の一行で結論を書く。 */
function headline(body) {
  const bold = body.match(/\*\*(.+?)\*\*/s)?.[1];
  return (bold ?? body).replace(/\s+/g, " ").trim().slice(0, 120);
}

// 正典と台帳の場所。ここがずれると差し引きが効かず、
// 採用済みの候補まで「新規」として通知されてしまう。
const RULES_PATH = "../.agents/rules/rules.md";
const DECLINED_PATH = "../.agents/rules/declined.md";

/**
 * 正典を読む。**無ければ失敗させる。**
 * 見つからないまま空文字で続けると、採用済みの判定材料が消えて
 * 全候補が「新規」に戻り、誤った通知が飛ぶ。しかもテストは緑のままになる。
 */
async function readCanon(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

/** 却下台帳を読む。まだ 1 件も却下していなければ存在しなくてよい。 */
async function readDeclined(relativePath) {
  try {
    return await readFile(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

// PR ごとの作成者を引く。`gh api user` は「実行者」であって PR 作成者ではないうえ、
// GitHub Actions の GITHUB_TOKEN では 403 になる。
// 上限を切ると、超えた分は黙って落ちる。件数が増えても取りこぼさないよう
// 十分に大きな値を渡し、実際に上限へ達したら失敗させる。
const PR_LIMIT = 5000;
const listed = JSON.parse(
  await gh([
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    String(PR_LIMIT),
    "--json",
    "number,author",
  ]),
);
if (listed.length >= PR_LIMIT) {
  throw new Error(
    `PR が取得上限 ${PR_LIMIT} 件に達した。取りこぼしたまま集計すると候補の判定を誤る。`,
  );
}
const pullRequests = listed.map((pr) => ({ number: pr.number, author: pr.author?.login }));

const comments = [];
const failedPullRequests = [];
for (const pr of pullRequests) {
  let raw;
  try {
    raw = await gh([
      "api",
      `repos/:owner/:repo/pulls/${pr.number}/comments?per_page=100`,
      "--paginate",
      "--jq",
      ".[] | {id, in_reply_to: .in_reply_to_id, user: .user.login, path, body}",
    ]);
  } catch (error) {
    // 読めなかった PR は記録しておき、最後に失敗させる。
    // ここで握りつぶすと、不完全な履歴から hasNew を計算することになり、
    // 出すべき通知が出ない／既存 Issue が欠けた候補で上書きされる。
    console.error(`error: PR#${pr.number} のコメントを取得できなかった: ${error.message}`);
    failedPullRequests.push(pr.number);
    continue;
  }
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    comments.push({ pr: pr.number, author: pr.author, ...JSON.parse(line) });
  }
}

// PR 作成者の返信、または「確認しました」と述べる bot の追随がある指摘は、
// 修正が実際に入ったと見なせる強いシグナル。
//
// 既知の限界: 返信せず直接修正した指摘は「未対応」に見えるため、件数は下振れする。
const addressedRoots = new Set();
for (const comment of comments) {
  if (!comment.in_reply_to) continue;
  const isAuthorReply = comment.user === comment.author;
  // 「確認しました」はレビュー bot が修正の着地を確認したときのシグナル。
  // 人間のレビュアーの同じ言葉まで拾うと、修正が入っていない指摘まで
  // 候補へ昇格してしまう。
  const isBotConfirmation =
    comment.user.endsWith("[bot]") && /確認しました|Thanks for confirming/.test(comment.body);
  if (isAuthorReply || isBotConfirmation) {
    addressedRoots.add(comment.in_reply_to);
  }
}

if (failedPullRequests.length > 0) {
  throw new Error(
    `${failedPullRequests.length} 件の PR のレビューを取得できなかった` +
      `（#${failedPullRequests.join(", #")}）。不完全な履歴で候補を判定しない。`,
  );
}

const roots = comments.filter((comment) => !comment.in_reply_to && comment.user !== comment.author);

// クラスタはレビュー当時のパスで束ねる。大きなディレクトリ移動があると、
// 同じ問題が移動の前後で別クラスタに割れる（例: PR#48 のモノレポ移行）。
const clusters = new Map();
for (const comment of roots) {
  const { category, severity } = parseMeta(comment.body);
  // 設計文書へのレビューはコード規約とは別問題なので、コードのみを対象にする。
  const isDoc = comment.path.endsWith(".md");
  const area = comment.path.split("/").slice(0, 2).join("/");
  const key = `${category} | ${area}`;
  const cluster = clusters.get(key) ?? { key, isDoc, category, area, items: [] };
  cluster.items.push({
    pr: comment.pr,
    path: comment.path,
    severity,
    addressed: addressedRoots.has(comment.id),
    headline: headline(comment.body),
  });
  clusters.set(key, cluster);
}

const candidates = [...clusters.values()]
  .filter((cluster) => !cluster.isDoc)
  .filter((cluster) => cluster.items.length >= minCluster)
  .filter((cluster) => cluster.items.some((item) => item.addressed))
  .sort((a, b) => b.items.length - a.items.length);

// 採用済み・却下済みを差し引く。この差し引きが無いと、実行するたびに
// 同じ候補が出続けて、通知は数週間で無視されるようになる。
const rules = await readCanon(RULES_PATH);
const declined = await readDeclined(DECLINED_PATH);
// 出典は「PR 番号 + そのとき指摘されたパス」の組で引く。
// 番号だけで照合すると、同じ PR の別カテゴリの指摘まで採用済みになり、
// **本当は新しい候補が黙って消える**（PR#98 のレビューで実際に見つかった）。
const citations = [];
for (const [, block] of rules.matchAll(/\*\*出典\*\*:([\s\S]*?)(?=\n\n)/g)) {
  // 出典は複数行にまたがり、1 行に複数の PR が並ぶこともある。
  // 「PR#N から次の PR# まで」を 1 件として、その範囲のパスに結び付ける。
  const segments = block.split(/(?=PR#\d+)/);
  for (const segment of segments) {
    const pr = segment.match(/PR#(\d+)/)?.[1];
    if (!pr) continue;
    for (const [, cited] of segment.matchAll(/`([^`]+)`/g)) {
      citations.push({ pr, path: cited });
    }
  }
}
if (citations.length === 0) {
  throw new Error("正典から出典を 1 件も読み取れなかった。書式が変わっていないか確認すること。");
}
const declinedKeys = new Set(
  [...declined.matchAll(/^-\s*`([^`]+)`/gm)].map((match) => match[1].trim()),
);

function statusOf(cluster) {
  if (declinedKeys.has(cluster.key)) return "declined";
  // 修正実績のある指摘（＝ルールの根拠になりうるもの）が、すべて既に
  // 出典として引かれていれば採用済みと見なす。
  //
  // 「構成 PR がすべて引かれているか」で見ると、未対応の指摘が 1 件混ざるだけで
  // クラスタ全体が新規に戻り、採用済みのルールが毎回再提示されてしまう。
  const evidence = cluster.items.filter((item) => item.addressed);
  const isCited = (item) =>
    citations.some(
      (citation) =>
        citation.pr === String(item.pr) &&
        // 正典は `sync.ts` のように末尾だけを書くこともあるので、
        // フルパスとの後方一致で照合する。
        (item.path === citation.path || item.path.endsWith(`/${citation.path}`)),
    );
  if (evidence.length > 0 && evidence.every(isCited)) return "adopted";
  return "new";
}

const classified = candidates.map((cluster) => ({ ...cluster, status: statusOf(cluster) }));
const fresh = classified.filter((cluster) => cluster.status === "new");
const shown = newOnly ? fresh : classified;

if (asJson) {
  console.log(
    JSON.stringify({ total: roots.length, hasNew: fresh.length > 0, candidates: shown }, null, 2),
  );
} else if (newOnly && fresh.length === 0) {
  console.log("新しいルール候補はない。");
} else {
  console.log(
    `レビュー指摘 ${roots.length} 件 / 候補 ${shown.length} クラスタ（新規 ${fresh.length}）`,
  );
  console.log(`(${minCluster} 件以上 かつ 1 件以上が修正済みのクラスタのみ)\n`);
  const label = { new: "🆕 未検討", adopted: "✅ 採用済み", declined: "🚫 却下済み" };
  for (const cluster of shown) {
    console.log(
      `■ ${cluster.category} — ${cluster.area}  [${cluster.items.length} 件] ${label[cluster.status]}`,
    );
    for (const item of cluster.items) {
      console.log(`   ${item.addressed ? "✓" : " "} PR#${item.pr} ${item.severity} ${item.path}`);
      console.log(`     ${item.headline}`);
    }
    console.log();
  }
  if (fresh.length > 0) {
    console.log("採用する候補は .agents/rules/rules.md に出典 PR 付きで追記し、");
    console.log("機械的に検査できるものは test/project-rules.test.mjs にテストを足すこと。");
    console.log("採らない候補は .agents/rules/declined.md に理由付きで記録すること");
    console.log("（記録しないと、この候補は毎回また出てくる）。");
  }
}
