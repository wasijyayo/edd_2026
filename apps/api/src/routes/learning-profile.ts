/**
 * `GET /v1/learning-profile`。
 *
 * イベントの生ログではなく、導出済みの読み取りモデルを返す（docs/architecture.md）。
 */

import { Hono } from "hono";
import { CONCEPT_BY_ID, deriveMasteryFromEvents } from "@gakushu-sochi/domain";
import {
  compareConceptView,
  LEARNING_PROFILE_RESPONSE_VERSION,
  type ConceptMasteryView,
  type LearningProfileResponse,
} from "../contract/learning-profile.js";
import type { AuthVariables } from "../auth/middleware.js";
import type { LearningEventRepository } from "../repository/types.js";

export interface ProfileDeps {
  events: LearningEventRepository;
  /** 現在時刻を ISO 8601 で返す。テストで固定できるよう注入する。 */
  nowIso: () => string;
}

/** {@link SyncDepsResolver} と同じ理由で、依存はリクエスト時に解決する。 */
export type ProfileDepsResolver = (env: CloudflareBindings) => ProfileDeps;

export function createLearningProfileRoute(resolve: ProfileDepsResolver) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>();

  app.get("/learning-profile", async (c) => {
    const userId = c.get("user").userId;
    const deps = resolve(c.env);
    const events = await deps.events.listByUser(userId);

    // 習熟度は保存値ではなくログから導出する。docs/concepts.md「サーバー側の導出」。
    const mastery = deriveMasteryFromEvents(events);

    const concepts: ConceptMasteryView[] = Object.values(mastery)
      // 観測のある Concept だけが値を持つ。既知の Concept 全件を 0 で埋めない。
      // 埋めると「判断材料がない」と「習熟度が低い」をクライアントが区別できない。
      .filter((item) => item !== undefined)
      .map((item) => {
        const label = CONCEPT_BY_ID.get(item.conceptId)?.label;
        return label === undefined ? item : { ...item, label };
      })
      .sort(compareConceptView);

    const body: LearningProfileResponse = {
      version: LEARNING_PROFILE_RESPONSE_VERSION,
      derivedAt: deps.nowIso(),
      concepts,
      eventCount: events.length,
    };
    return c.json(body);
  });

  return app;
}
