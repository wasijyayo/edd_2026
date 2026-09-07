import type { LearningEventType } from "@gakushu-sochi/domain";

/** 読み取りモデルのスキーマバージョン。破壊的変更のときに上げる。 */
export const LEARNING_ACTIVITY_RESPONSE_VERSION = 1;

export interface DailyActivity {
  /** UTC の YYYY-MM-DD。 */
  date: string;
  /** 0 件のイベント種別は含めない。 */
  counts: Partial<Record<LearningEventType, number>>;
}

/** Web Viewer の推移画面専用の、日次に集計済みの読み取りモデル。 */
export interface LearningActivityResponse {
  version: number;
  derivedAt: string;
  /** 集計対象の開始日（両端を含む）。 */
  from: string;
  /** 集計対象の終了日（両端を含む）。 */
  to: string;
  /** 観測があった日だけを日付昇順で並べる。 */
  days: DailyActivity[];
}
