/**
 * vscode.lm を使った AIProvider の実装。
 *
 * ユーザー自身の Copilot 等の契約を利用し、開発者側の AI 利用料金を抑える（AI/02 #11）。
 * 実機検証の詳細・未確認事項は docs/lm-api.md を参照。
 *
 * CancellationToken によるキャンセルは未対応。AIProvider.ask() はキャンセル手段を
 * 持たない（AIRequest / AIProvider を VS Code 非依存に保つ設計のため、vscode固有の
 * CancellationToken をここに持ち込めない）。UI側でキャンセルが必要になった時点で
 * 別Issueとして対応する。
 */

import * as vscode from "vscode";
import type { AIProvider } from "./provider";
import type { AIError, AIErrorReason, AIRequest, AIResponse } from "../types/ai";
import type { ConceptId } from "../types/profile";
import { CONCEPTS } from "../types/concepts.generated";

/**
 * 既定で使う family。
 *
 * docs/lm-api.md の実機検証で、selectChatModels() の一覧には copilot-utility や
 * copilotcli/auto のようなチャット用途ではないモデルが混ざることが分かっている。
 * 何も指定せず先頭を使うと、そうしたモデルに送って応答が空になることがある。
 */
const DEFAULT_FAMILY = "gpt-4o-mini";

/** 既知の ConceptId 一覧。AIが存在しないIDを捏造した場合に弾くために使う。 */
const KNOWN_CONCEPT_IDS = new Set(CONCEPTS.map((concept) => concept.id));

/**
 * プロンプトに含める過去の会話ターン数の上限。
 *
 * `AIRequest.history` は会話が続く限り増え続けるため、上限を設けないと
 * 毎回のリクエストが際限なく重くなり、いずれモデルのコンテキスト長を
 * 超えてしまう。理解が解消されたかの判断には直近のやり取りで十分なため、
 * 直近 {@link MAX_HISTORY_TURNS} 件だけを残す（古いものは切り捨てる）。
 */
const MAX_HISTORY_TURNS = 10;

/**
 * 応答本文の末尾に付けさせるメタ情報の開始マーカー。
 *
 * ユーザーへ表示する前にここで切り離すため、Markdownとして自然に読める記号は避け、
 * 通常の説明文には出てこない専用の文字列にする。
 */
const META_MARKER = "<<code-companion-meta>>";

/** AIRequest を LanguageModelChatMessage の配列へ変換する。 */
function toMessages(request: AIRequest): vscode.LanguageModelChatMessage[] {
  // 直近 MAX_HISTORY_TURNS 件だけを使う。長い会話をそのまま送り続けると
  // リクエストが際限なく重くなり、モデルのコンテキスト長を超えかねない。
  const history = (request.history ?? []).slice(-MAX_HISTORY_TURNS);
  const hasHistory = history.length > 0;

  const historyMessages = history.map((turn) =>
    turn.role === "user"
      ? vscode.LanguageModelChatMessage.User(turn.text)
      : vscode.LanguageModelChatMessage.Assistant(turn.text),
  );

  const lines: string[] = [
    request.mode === "hint"
      ? "次に試す一手だけを示してください。答えそのものは書かないでください。"
      : "このコードの意味・なぜそう書くのか・どこを見るべきかを解説してください。",
    "",
    "--- コード ---",
    request.context.code,
  ];

  if (request.context.surroundingCode) {
    lines.push("", "--- 前後のコード ---", request.context.surroundingCode);
  }

  if (request.diagnostics && request.diagnostics.length > 0) {
    lines.push("", "--- 関連するエラー ---", ...request.diagnostics);
  }

  if (request.question) {
    lines.push("", "--- 質問 ---", request.question);
  }

  // 本文の下に、ユーザーには見せないメタ情報をJSONで出させる。
  // 学習イベントの記録（MVP/02 #23）が、どのConceptの話か・理解が解消されたかを
  // 判断する材料に使う。会話に表示する内容とは別物なので、通常の説明文の後に
  // マーカー付きで書かせて、受け取り側（parseAnswer）で切り離す。
  lines.push(
    "",
    "--- 出力形式 ---",
    `本文を書き終えたら、必ず最後に ${META_MARKER} という行を書き、続けてJSONを1つだけ書いてください。`,
    '形式: {"conceptIds": ["関係する概念のID。分からなければ空配列"], "resolution": "resolved か unclear"}',
    "conceptIds は今回の話題に一致する既知の概念のIDのみを入れてください。存在しないIDを作らないでください。",
  );

  if (hasHistory) {
    lines.push(
      "resolution には、これまでの会話（履歴）を踏まえて、直前までの説明で扱っていた疑問が" +
        '今回のユーザーの発言で解消されたと判断できるなら "resolved"、まだそう判断できないなら ' +
        '"unclear" を入れてください。',
    );
  } else {
    lines.push("これが最初のやり取りで判断材料が無いため、resolution キーは省略してください。");
  }

  return [...historyMessages, vscode.LanguageModelChatMessage.User(lines.join("\n"))];
}

/** parseAnswer() の戻り値。 */
interface ParsedAnswer {
  /** ユーザーへ表示する本文。メタ情報は含まない。 */
  text: string;
  conceptIds: ConceptId[];
  resolution?: "resolved" | "unclear";
}

/**
 * モデルの応答から、表示用の本文と末尾のメタ情報(JSON)を分離する。
 *
 * モデルが指示に従わない・JSONが壊れている場合は、本文だけをそのまま使い
 * conceptIds は空配列、resolution は省略にする。出力形式は保証されないため、
 * ここでの失敗が質問フロー自体を止めてはならない。
 */
function parseAnswer(raw: string): ParsedAnswer {
  const markerIndex = raw.indexOf(META_MARKER);

  if (markerIndex === -1) {
    return { text: raw.trim(), conceptIds: [] };
  }

  const text = raw.slice(0, markerIndex).trim();
  const jsonMatch = raw.slice(markerIndex + META_MARKER.length).match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { text, conceptIds: [] };
  }

  try {
    const parsed: unknown = JSON.parse(jsonMatch[0]);

    if (typeof parsed !== "object" || parsed === null) {
      return { text, conceptIds: [] };
    }

    const rawConceptIds = (parsed as { conceptIds?: unknown }).conceptIds;
    const conceptIds = Array.isArray(rawConceptIds)
      ? rawConceptIds.filter(
          (id): id is ConceptId => typeof id === "string" && KNOWN_CONCEPT_IDS.has(id),
        )
      : [];

    const rawResolution = (parsed as { resolution?: unknown }).resolution;
    const resolution =
      rawResolution === "resolved" || rawResolution === "unclear" ? rawResolution : undefined;

    return { text, conceptIds, resolution };
  } catch {
    return { text, conceptIds: [] };
  }
}

/**
 * LanguageModelError を AIErrorReason へ分類する。
 *
 * `code` は静的メソッドの関数名と一致する文字列になる。VS Code公式ドキュメントの例
 * （`error.code === vscode.LanguageModelError.NotFound.name`）に倣い、インスタンスを
 * 作らず関数の `.name` で比較する。
 *
 * context-too-long / cancelled は LanguageModelError に対応する種別が無いため、
 * 現状は判別できず unknown に落ちる。実機で該当ケースを確認できたら分岐を追加する。
 */
function classifyError(error: vscode.LanguageModelError): AIErrorReason {
  if (error.code === vscode.LanguageModelError.NoPermissions.name) {
    return "consent-denied";
  }
  if (error.code === vscode.LanguageModelError.Blocked.name) {
    return "rate-limited";
  }
  if (error.code === vscode.LanguageModelError.NotFound.name) {
    return "model-unavailable";
  }
  return "unknown";
}

function toAIError(error: unknown): AIError {
  if (error instanceof vscode.LanguageModelError) {
    return { reason: classifyError(error), detail: error.message };
  }
  return { reason: "unknown", detail: String(error) };
}

export class VSCodeLMProvider implements AIProvider {
  readonly id = "vscode-lm";

  async ask(request: AIRequest): Promise<AIResponse> {
    const models = await vscode.lm.selectChatModels();

    if (models.length === 0) {
      return {
        ok: false,
        error: {
          reason: "model-unavailable",
          detail:
            "selectChatModels() が空配列を返した。Copilot未契約・未サインインの可能性がある。",
        },
      };
    }

    // 用途外のモデルを避けるため family を指定して選ぶ。無ければ先頭にフォールバックする
    // （フォールバック時も応答が空になりうることは docs/lm-api.md に記録済み）。
    const model = models.find((m) => m.family === DEFAULT_FAMILY) ?? models[0];

    try {
      // sendRequest は初回呼び出し時にユーザーへ同意ダイアログを表示する。
      // ユーザー操作（コマンド実行）への応答として呼ぶ必要があり、ここはその文脈で呼ばれる。
      const response = await model.sendRequest(toMessages(request), {
        justification: "Gakushu Sochi がコードの説明・ヒントを生成するために使用します。",
      });

      let raw = "";
      for await (const chunk of response.text) {
        raw += chunk;
      }

      const parsed = parseAnswer(raw);

      return {
        ok: true,
        answer: {
          text: parsed.text,
          conceptIds: parsed.conceptIds,
          mode: request.mode,
          model: model.id,
          ...(parsed.resolution ? { resolution: parsed.resolution } : {}),
        },
      };
    } catch (error) {
      return { ok: false, error: toAIError(error) };
    }
  }
}
