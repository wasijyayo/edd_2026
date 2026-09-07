/** `GET /v1/learning-activity`。イベント生ログを日次へ集計して返す。 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { LearningEventType } from "@gakushu-sochi/domain";
import { type AuthVariables } from "../auth/middleware.js";
import {
  LEARNING_ACTIVITY_RESPONSE_VERSION,
  type DailyActivity,
  type LearningActivityResponse,
} from "../contract/learning-activity.js";
import type { LearningEventRepository } from "../repository/types.js";

export interface ActivityDeps {
  events: LearningEventRepository;
  /** テストで UTC 境界を固定できるように注入する。 */
  now: () => Date;
}

export type ActivityDepsResolver = (env: CloudflareBindings) => ActivityDeps;

function parseDays(searchParams: URLSearchParams): number {
  const values = searchParams.getAll("days");
  if (values.length === 0) return 30;
  if (values.length !== 1 || !/^[1-9][0-9]*$/.test(values[0] ?? "")) {
    throw new HTTPException(400, { message: "days must be an integer between 1 and 365" });
  }

  const days = Number(values[0]);
  if (days > 365) {
    throw new HTTPException(400, { message: "days must be an integer between 1 and 365" });
  }
  return days;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeFor(now: Date, days: number): { from: string; to: string } {
  const to = utcDate(now);
  const fromDate = new Date(`${to}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  return { from: utcDate(fromDate), to };
}

export function createLearningActivityRoute(resolve: ActivityDepsResolver) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>();

  app.get("/learning-activity", async (c) => {
    const days = parseDays(new URL(c.req.url).searchParams);
    const deps = resolve(c.env);
    const now = deps.now();
    const range = rangeFor(now, days);
    const events = await deps.events.listByUser(c.get("user").userId);

    if (events.length >= 5_000) {
      console.log("learning activity event scan", {
        eventCount: events.length,
        warning: events.length >= 10_000,
      });
    }

    const byDate = new Map<string, Partial<Record<LearningEventType, number>>>();
    for (const event of events) {
      const date = event.occurredAt.slice(0, 10);
      if (date < range.from || date > range.to) continue;
      const counts = byDate.get(date) ?? {};
      counts[event.type] = (counts[event.type] ?? 0) + 1;
      byDate.set(date, counts);
    }

    const activityDays: DailyActivity[] = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, counts }));
    const body: LearningActivityResponse = {
      version: LEARNING_ACTIVITY_RESPONSE_VERSION,
      derivedAt: now.toISOString(),
      ...range,
      days: activityDays,
    };
    return c.json(body);
  });

  return app;
}
