import { expect, test, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { createEmptyProfile, type LearnerProfile } from "@gakushu-sochi/domain";
import { loadProfile } from "../learning/store";
import type * as vscode from "vscode";

const CURRENT_KEY = "gakushuSochi.learnerProfile";
const LEGACY_KEY = "codeCompanion.learnerProfile";

/** globalState だけを持つ最小の ExtensionContext を組む。 */
function contextWith(values: Record<string, unknown>): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => values[key],
    },
  } as unknown as vscode.ExtensionContext;
}

function profileWith(conceptId: string): LearnerProfile {
  const profile = createEmptyProfile("2026-09-05T00:00:00.000Z");
  profile.mastery[conceptId] = {
    conceptId,
    status: "learning",
    score: 0.25,
    evidence: {
      questionCount: 0,
      hintCount: 0,
      answerViewCount: 0,
      solvedIndependentlyCount: 1,
      errorRecurrenceCount: 0,
      checkPassedCount: 0,
      checkFailedCount: 0,
      recentTypes: ["solved_independently"],
    },
  };
  return profile;
}

test("新しいキーの値を読む", () => {
  const stored = profileWith("go.defer");

  const loaded = loadProfile(contextWith({ [CURRENT_KEY]: stored }));

  expect(loaded.mastery["go.defer"]?.score).toBe(0.25);
});

test("新しいキーが空なら旧キーの学習履歴を引き継ぐ", () => {
  // 学習履歴は再取得できない。キーを変えただけで読めなくなる状態にしない
  // （docs/concepts.md「古いデータを黙って捨てない」）。
  const stored = profileWith("go.slice");

  const loaded = loadProfile(contextWith({ [LEGACY_KEY]: stored }));

  expect(loaded.mastery["go.slice"]?.score).toBe(0.25);
});

test("両方にあれば新しいキーを優先する", () => {
  const loaded = loadProfile(
    contextWith({
      [CURRENT_KEY]: profileWith("go.new"),
      [LEGACY_KEY]: profileWith("go.old"),
    }),
  );

  expect(loaded.mastery["go.new"]).toBeDefined();
  expect(loaded.mastery["go.old"]).toBeUndefined();
});

test("どちらも無ければ空のプロファイルを返す", () => {
  const loaded = loadProfile(contextWith({}));

  expect(loaded.mastery).toEqual({});
  expect(loaded.events).toEqual([]);
});

test("新しいキーが壊れていても旧キーから復帰する", () => {
  const loaded = loadProfile(
    contextWith({
      [CURRENT_KEY]: { version: 999 },
      [LEGACY_KEY]: profileWith("go.defer"),
    }),
  );

  expect(loaded.mastery["go.defer"]).toBeDefined();
});

test("旧キーも壊れていれば空のプロファイルを返す", () => {
  const loaded = loadProfile(contextWith({ [LEGACY_KEY]: { version: 999 } }));

  expect(loaded.mastery).toEqual({});
});

test("読み込みでは globalState を書き換えない", () => {
  // 起動直後に副作用を走らせると、失敗したときに握りつぶすか起動を止めるかの
  // 二択になる。移行は次の保存で自然に完了する。
  const update = vi.fn();
  const context = {
    globalState: {
      get: (key: string) => (key === LEGACY_KEY ? profileWith("go.defer") : undefined),
      update,
    },
  } as unknown as vscode.ExtensionContext;

  loadProfile(context);

  expect(update).not.toHaveBeenCalled();
});
