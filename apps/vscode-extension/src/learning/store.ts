/**
 * LearnerProfile の globalState への読み書き。
 *
 * globalState に触れるのはこのファイルだけにする。読み込み・保存の失敗や
 * バージョン不一致をここへ閉じ込め、呼び出し側（extension.ts）は常に
 * 使える LearnerProfile を受け取れるようにする。
 */

import * as vscode from "vscode";
import {
  applyEvent,
  createEmptyProfile,
  LEARNER_PROFILE_VERSION,
  type LearnerProfile,
  type LearningEvent,
} from "@gakushu-sochi/domain";

/** globalState 上のキー。docs/concepts.md の「保存」を参照。 */
const PROFILE_KEY = "gakushuSochi.learnerProfile";

/**
 * 旧キー。プロダクト名を変更する前に使っていた。
 *
 * 既に保存されている利用者の学習履歴は再取得できないため、キーを変えただけで
 * 読めなくなる状態にしない。docs/concepts.md の「古いデータを黙って捨てない」に従い、
 * 新しいキーが空のときに限り読み替えて引き継ぐ。
 *
 * 旧キーの値は消さない。移行に失敗した場合の退避先として残す。
 */
const LEGACY_PROFILE_KEY = "codeCompanion.learnerProfile";

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

/**
 * globalState から LearnerProfile を読み込む。無い・壊れている場合は空のプロファイルを返す。
 *
 * 新しいキーに値が無ければ旧キーを見る。読めたものは呼び出し側が保存した時点で
 * 新しいキーへ移る（`recordEvent` は常に新しいキーへ書く）ため、ここでは
 * 書き戻しをしない。読み込みだけで globalState を更新すると、VS Code の起動直後に
 * 副作用が走り、失敗したときに握りつぶすか起動を止めるかの二択になる。
 */
export function loadProfile(context: vscode.ExtensionContext): LearnerProfile {
  const stored = context.globalState.get<unknown>(PROFILE_KEY);
  if (isCurrentVersionProfile(stored)) {
    return stored;
  }

  const legacy = context.globalState.get<unknown>(LEGACY_PROFILE_KEY);
  if (isCurrentVersionProfile(legacy)) {
    return legacy;
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
