/**
 * 学習イベントを LearnerProfile へ適用する純粋関数。
 *
 * profile.ts と同じく VS Code API に依存しない。ルールは docs/concepts.md の
 * 「習熟度の更新ルール」が正典であり、ここはその実装。globalState の読み書き
 * （src/learning/store.ts）とはあえて分け、係数や判定条件だけを vitest で
 * 直接検証できるようにする。
 */

import {
  MASTERY_SCORE_RANGE,
  type ConceptId,
  type ConceptMastery,
  type LearnerProfile,
  type LearningEvent,
  type LearningEventType,
  type MasteryEvidence,
  type MasteryStatus,
} from "@gakushu-sochi/domain";

/**
 * イベント種別ごとの score 加減。docs/concepts.md の表と一致させること。
 *
 * Record<LearningEventType, number> にしているのは、LearningEventType へ
 * 種別が追加されたときにこの定義がコンパイルエラーになり、係数を決め忘れたまま
 * 新種別を素通りさせないため。
 */
const SCORE_DELTA: Record<LearningEventType, number> = {
  question_asked: 0,
  hint_used: 0.05,
  answer_viewed: 0,
  solved_independently: 0.25,
  error_recurred: -0.2,
  check_passed: 0.2,
  check_failed: -0.15,
};

/** recentTypes に保持する直近イベントの上限件数。docs/concepts.md 参照。 */
const RECENT_TYPES_LIMIT = 5;

/** events 配列の保存上限。超えた分は古いものから捨てる。docs/concepts.md 参照。 */
const EVENT_HISTORY_LIMIT = 1000;

const EMPTY_EVIDENCE: MasteryEvidence = {
  questionCount: 0,
  hintCount: 0,
  answerViewCount: 0,
  solvedIndependentlyCount: 0,
  errorRecurrenceCount: 0,
  checkPassedCount: 0,
  checkFailedCount: 0,
  recentTypes: [],
};

function clampScore(score: number, status: MasteryStatus): number {
  const range = MASTERY_SCORE_RANGE[status];
  return Math.min(range.max, Math.max(range.min, score));
}

/**
 * evidence から status を導出する。
 *
 * `unobserved` はここでは返らない。この関数は「その Concept に対する
 * イベントが少なくとも1件ある」ことが前提の経路（後述の applyEventToMastery）
 * からしか呼ばれず、`unobserved` は `LearnerProfile.mastery` にエントリ自体が
 * 無いことで表現するため。
 */
function deriveStatus(evidence: MasteryEvidence): MasteryStatus {
  const hasRecentFailure = evidence.recentTypes.some(
    (type) => type === "error_recurred" || type === "check_failed",
  );
  const confirmed =
    evidence.solvedIndependentlyCount + evidence.checkPassedCount >= 2 && !hasRecentFailure;

  return confirmed ? "confirmed" : "learning";
}

function incrementEvidenceCount(
  evidence: MasteryEvidence,
  type: LearningEventType,
): MasteryEvidence {
  switch (type) {
    case "question_asked":
      return { ...evidence, questionCount: evidence.questionCount + 1 };
    case "hint_used":
      return { ...evidence, hintCount: evidence.hintCount + 1 };
    case "answer_viewed":
      return { ...evidence, answerViewCount: evidence.answerViewCount + 1 };
    case "solved_independently":
      return { ...evidence, solvedIndependentlyCount: evidence.solvedIndependentlyCount + 1 };
    case "error_recurred":
      return { ...evidence, errorRecurrenceCount: evidence.errorRecurrenceCount + 1 };
    case "check_passed":
      return { ...evidence, checkPassedCount: evidence.checkPassedCount + 1 };
    case "check_failed":
      return { ...evidence, checkFailedCount: evidence.checkFailedCount + 1 };
  }
}

function applyEventToMastery(
  conceptId: ConceptId,
  mastery: ConceptMastery | undefined,
  event: LearningEvent,
): ConceptMastery {
  const previousEvidence = mastery?.evidence ?? EMPTY_EVIDENCE;
  const evidence: MasteryEvidence = {
    ...incrementEvidenceCount(previousEvidence, event.type),
    recentTypes: [...previousEvidence.recentTypes, event.type].slice(-RECENT_TYPES_LIMIT),
    lastObservedAt: event.occurredAt,
  };

  const status = deriveStatus(evidence);
  const score = clampScore((mastery?.score ?? 0) + SCORE_DELTA[event.type], status);

  return { conceptId, status, score, evidence };
}

/**
 * 1件の学習イベントを LearnerProfile へ追記し、関係する Concept の習熟度を
 * 更新した新しい LearnerProfile を返す（引数は書き換えない）。
 *
 * `event.conceptIds` が空の場合は events への追記のみ行い、mastery は変えない
 * （AIがConceptを特定できなかった質問も、記録自体は残す）。
 */
export function applyEvent(profile: LearnerProfile, event: LearningEvent): LearnerProfile {
  const events = [...profile.events, event].slice(-EVENT_HISTORY_LIMIT);

  const mastery = { ...profile.mastery };
  for (const conceptId of event.conceptIds) {
    mastery[conceptId] = applyEventToMastery(conceptId, mastery[conceptId], event);
  }

  return { ...profile, updatedAt: event.occurredAt, mastery, events };
}
