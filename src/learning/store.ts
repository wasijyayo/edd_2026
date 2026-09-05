/**
 * LearnerProfile の globalState への読み書き。
 *
 * globalState に触れるのはこのファイルだけにする。読み込み・保存の失敗や
 * バージョン不一致をここへ閉じ込め、呼び出し側（extension.ts）は常に
 * 使える LearnerProfile を受け取れるようにする。
 */

import * as vscode from "vscode";
import { applyEvent } from "./mastery";
import {
  createEmptyProfile,
  LEARNER_PROFILE_VERSION,
  type LearnerProfile,
  type LearningEvent,
} from "../types/profile";

/** globalState 上のキー。docs/concepts.md の「保存」を参照。 */
const PROFILE_KEY = "codeCompanion.learnerProfile";

/**
 * 保存値が現在の LEARNER_PROFILE_VERSION と一致する LearnerProfile かを検査する。
 *
 * docs/concepts.md の「読み込み時の処理」は version の大小で分岐（マイグレーション /
 * 読み取り専用）することを理想としているが、version 2 以降がまだ存在しないため
 * `src/learning/migrate.ts` は作っていない。ここでは一致しない・壊れている場合を
 * まとめて「使えない」として扱い、新規プロファイルを作り直す簡略実装にとどめる。
 * version 2 が生まれたら、この関数をマイグレーション適用の入口に置き換える。
 */
function isCurrentVersionProfile(value: unknown): value is LearnerProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === LEARNER_PROFILE_VERSION
  );
}

/** globalState から LearnerProfile を読み込む。無い・壊れている場合は空のプロファイルを返す。 */
export function loadProfile(context: vscode.ExtensionContext): LearnerProfile {
  const stored = context.globalState.get<unknown>(PROFILE_KEY);

  if (isCurrentVersionProfile(stored)) {
    return stored;
  }

  return createEmptyProfile(new Date().toISOString());
}

/**
 * LearnerProfile を globalState へ保存する。
 *
 * 失敗しても例外を投げない。保存失敗が質問フローを止めてはならない
 * （MVP/02 #23 の完了条件）ため、成否は `onError` への通知だけに留める。
 */
async function saveProfile(
  context: vscode.ExtensionContext,
  profile: LearnerProfile,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    await context.globalState.update(PROFILE_KEY, profile);
  } catch (error) {
    onError?.(error);
  }
}

/**
 * 1件の学習イベントを反映し、globalState へ保存する。
 *
 * 保存に失敗しても、更新後の LearnerProfile はそのまま返す。今回のセッション中は
 * 記録が反映された状態で動作を続けられるようにするためで、次回起動時に
 * 保存前の状態へ戻りうることは docs/concepts.md の保存契約通りである。
 */
export async function recordEvent(
  context: vscode.ExtensionContext,
  profile: LearnerProfile,
  event: LearningEvent,
  onError?: (error: unknown) => void,
): Promise<LearnerProfile> {
  const updated = applyEvent(profile, event);
  await saveProfile(context, updated, onError);
  return updated;
}
