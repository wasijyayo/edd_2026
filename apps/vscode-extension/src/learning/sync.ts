/**
 * LearningEvent をAPIサーバーへ同期する。
 *
 * globalStateへのローカル保存（store.ts）とは別に、サーバー側の正本（D1）へも
 * 送る。docs/architecture.md の通りサーバー側が習熟度導出の正本であり、
 * ローカル保存だけでは他端末やWebから見えない。
 *
 * apps/api の外部契約（apps/api/src/contract/learning-event.ts）をそのまま
 * importしない。apps/api/README.md が「このアプリ固有の型を他パッケージから
 * 参照させない」と定めているため、送受信に必要な最小限の形をここで独自に持つ。
 *
 * 同期に失敗しても例外を投げない。store.ts の recordEvent と同じ方針で、
 * 同期の失敗が質問フローを止めてはならない。呼び出し側はログに残すためだけに
 * 戻り値を使う。
 */

import type { LearningEvent } from "@gakushu-sochi/domain";

/** 同期に使う設定。VS Codeの設定（package.jsonのcontributes.configuration）から読む値をここへ集約する。 */
export interface SyncConfig {
  /** 例: https://gakushu-sochi-api.meganekaitai.workers.dev */
  apiBaseUrl: string;
  /** `Authorization: Bearer <token>` に使う。開発用トークンで暫定運用中（docs/architecture.md）。 */
  apiToken: string;
  /** この端末のID。store.ts の getOrCreateClientId で取得する。 */
  clientId: string;
}

/** サーバーがイベント1件ごとに返す結果種別。apps/api/src/contract/learning-event.ts の SyncResultStatus と対応する。 */
export type SyncEventStatus = "accepted" | "duplicate" | "rejected";

/** サーバー応答の最小限の形。呼び出し側が使わない項目は持たない。 */
interface SyncResponseBody {
  results: { status: SyncEventStatus; reason?: string }[];
}

export type SyncOutcome =
  { ok: true; status: SyncEventStatus; reason?: string } | { ok: false; reason: string };

/**
 * 1件の学習イベントをAPIサーバーへ送る。
 *
 * `POST /v1/learning-events:sync` は複数件をまとめて送れるバッチAPIだが、
 * persistEvent がイベントを1件ずつ確定させるのに合わせて、ここでも1件ずつ送る。
 * まとめ送りは、送信頻度が実際に問題になってから最適化する。
 */
export async function syncEvent(event: LearningEvent, config: SyncConfig): Promise<SyncOutcome> {
  if (!config.apiToken) {
    // 設定漏れを「同期しない」で黙って済ませない。devAuth（apps/api）は
    // トークン無しのリクエストを401で拒否するだけなので、ここで理由を残さないと
    // 「同期されていない」原因を利用者が追えなくなる。
    return { ok: false, reason: "APIトークンが未設定です（gakushuSochi.api.token）" };
  }

  const url = `${config.apiBaseUrl.replace(/\/+$/, "")}/v1/learning-events:sync`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify({ clientId: config.clientId, events: [event] }),
    });
  } catch (error) {
    return { ok: false, reason: `ネットワークエラー: ${String(error)}` };
  }

  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status}` };
  }

  const body = (await response.json()) as SyncResponseBody;
  const result = body.results[0];
  if (!result) {
    // 件数が合わない応答はサーバー側のバグである。黙って「成功」扱いにしない。
    return { ok: false, reason: "サーバー応答にこのイベントの結果が含まれていません" };
  }

  return { ok: true, status: result.status, reason: result.reason };
}
