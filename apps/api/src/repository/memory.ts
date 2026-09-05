/**
 * `LearningEventRepository` のインメモリ実装。テスト用。
 *
 * `test:unit` は素の vitest で Worker ランタイムを持たないため、
 * ハンドラのテストはこの実装を挿して動かす。D1 実装との差異が出ないよう、
 * 冪等性の単位（ユーザーごと）と並び順（発生時刻の昇順、同時刻は ID 昇順）を
 * SQL 側と一致させてある。
 */

import type { LearningEvent } from "@gakushu-sochi/domain";
import type {
  AppendResult,
  IdentityRepository,
  LearningEventRepository,
  StoredEventInput,
} from "./types.js";

export class InMemoryLearningEventRepository implements LearningEventRepository {
  /** userId -> (eventId -> event)。ユーザー単位で冪等にするための入れ子。 */
  private readonly byUser = new Map<string, Map<string, LearningEvent>>();

  append(userId: string, inputs: readonly StoredEventInput[]): Promise<AppendResult[]> {
    let events = this.byUser.get(userId);
    if (events === undefined) {
      events = new Map();
      this.byUser.set(userId, events);
    }

    const results = inputs.map(({ event }) => {
      if (events.has(event.id)) {
        // 既存を上書きしない。イベントは追記のみで、あとから書き換えない。
        return { id: event.id, duplicate: true };
      }
      events.set(event.id, event);
      return { id: event.id, duplicate: false };
    });

    return Promise.resolve(results);
  }

  listByUser(userId: string): Promise<LearningEvent[]> {
    const events = [...(this.byUser.get(userId)?.values() ?? [])];
    events.sort((a, b) => {
      const timeDiff = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return Promise.resolve(events);
  }

  countByUser(userId: string): Promise<number> {
    return Promise.resolve(this.byUser.get(userId)?.size ?? 0);
  }
}

/**
 * `IdentityRepository` のインメモリ実装。テスト用。
 *
 * D1 実装と違い外部キーは無いが、ハンドラが登録を呼び忘れていないかを
 * テストで確かめられるよう、登録済みの組を記録しておく。
 */
export class InMemoryIdentityRepository implements IdentityRepository {
  readonly users = new Map<string, { createdAtMs: number }>();
  readonly devices = new Map<string, { userId: string; clientId: string; lastSeenAtMs: number }>();

  ensureUserAndDevice(params: { userId: string; clientId: string; nowMs: number }): Promise<void> {
    const { userId, clientId, nowMs } = params;

    if (!this.users.has(userId)) {
      this.users.set(userId, { createdAtMs: nowMs });
    }

    const deviceKey = `${userId}:${clientId}`;
    const existing = this.devices.get(deviceKey);
    if (existing === undefined) {
      this.devices.set(deviceKey, { userId, clientId, lastSeenAtMs: nowMs });
    } else {
      existing.lastSeenAtMs = nowMs;
    }

    return Promise.resolve();
  }
}
