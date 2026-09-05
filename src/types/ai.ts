/**
 * AI 層のデータ契約。
 *
 * profile.ts / context.ts と同じく VS Code API に依存しない。
 * ここに vscode を import すると MockProvider をエディタ外で動かせなくなり、
 * UI ラインが実 AI 接続を待たずに進められるという AI/01 の目的そのものが崩れる。
 */

import type { ConceptId, ConceptMastery } from "./profile";
import type { CodeContext } from "./context";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * 回答モード。
 *
 * docs/idea.md の「すぐ答えを出すだけでなく、Hint → 自力解決 → Answer と
 * 段階的に進む Hint Mode も用意する」に対応する。
 * 同じ CodeContext でも返すべき回答が変わるため、プロンプト側の分岐ではなく
 * リクエストの必須項目として持たせる。
 */
export type AskMode =
  /** 答えを出さず、次に試す一手だけを返す。 */
  | "hint"
  /** コードやエラーの意味を解説する。 */
  | "explain";

/**
 * リクエストに載せる学習者プロファイルの要約。
 *
 * LearnerProfile をそのまま渡さない。あれは events 配列を丸ごと抱えており、
 * プロンプトへ載せる必要がないうえに、質問1回ごとに履歴全体が AI へ渡ることになる。
 * 回答の調整に必要なのは「この Concept をどこまで理解しているか」だけである。
 */
export interface ProfileSummary {
  /**
   * 今回の質問に関係する Concept の習熟度。
   *
   * 関係する Concept を特定できない場合は空配列になる。プロファイルが空でも
   * 回答は成立しなければならないため、AI 層はこれを空として扱えること。
   */
  masteries: ConceptMastery[];
  /**
   * 直近で再発しているエラーに紐づく Concept。
   * 「同じところで繰り返し詰まっている」ことを回答へ反映するために使う。
   */
  recurringConceptIds?: ConceptId[];
}

/**
 * 会話の1ターン。
 *
 * VS Code の `ChatRequestTurn`/`ChatResponseTurn` を AI 層へ持ち込まないための
 * 最小の写し。呼び出し側（extension.ts）が変換してから AIRequest に載せる。
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

/** AI への1回のリクエスト。 */
export interface AIRequest {
  mode: AskMode;
  /** 質問対象のコード文脈。 */
  context: CodeContext;
  /**
   * ユーザーが入力した質問文。
   *
   * 任意項目とする。「コードを選択してショートカット」だけで質問できることが
   * docs/idea.md の中心的な体験であり、毎回文章を書かせる設計にはしない。
   */
  question?: string;
  /**
   * 関連する Diagnostics のメッセージ。
   * 診断/01 (#15) が構造化するまでは文字列で受ける。
   */
  diagnostics?: string[];
  /** 学習者の習熟度要約。未取得・未観測の場合は省略される。 */
  profile?: ProfileSummary;
  /**
   * 同じ Chat セッション内の過去のやり取り。古い順。
   *
   * 初回の質問では省略される。MVP/02 (#23) が、直前までのやり取りに対して
   * 理解が解消されたかを AI に判断させるために使う。
   *
   * 件数の上限はここでは決めない。会話が続く限り増え続けるため、そのまま
   * 送るとモデルのコンテキスト長を超えうる（{@link AIErrorReason}の
   * `context-too-long`）。何件を実際に使うかは Provider 実装側の判断とする
   * （vscodeLm.ts 参照）。モデルによって適切な件数が変わりうるため。
   */
  history?: ConversationTurn[];
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/**
 * 失敗の理由。
 *
 * 単一のエラーにまとめない。UI 側の案内が理由ごとに全く異なり
 * （契約の案内 / 再試行 / 時間を置く）、文字列メッセージから分岐させると
 * 文言を変えるたびに UI が壊れる。
 *
 * 実際にどれが起きるかは 調査/01 (#4) の検証結果で確定する。
 * 未知の失敗を `unknown` に落とせるようにしてあるので、
 * #4 の結果で種別が増えてもここへ追加するだけで済む。
 */
export type AIErrorReason =
  /** 利用可能なモデルが無い。ユーザー側の契約が必要な場合を含む。 */
  | "model-unavailable"
  /** ユーザーが利用同意を拒否した。 */
  | "consent-denied"
  /** レート制限や利用上限に達した。 */
  | "rate-limited"
  /** リクエストがモデルのコンテキスト長を超えた。 */
  | "context-too-long"
  /** ユーザーまたは拡張側の都合で中断された。 */
  | "cancelled"
  /** 上記のいずれにも当てはまらない失敗。 */
  | "unknown";

export interface AIError {
  reason: AIErrorReason;
  /** ログ用の詳細。UI へそのまま表示することを想定しない。 */
  detail?: string;
}

/** 成功した回答の中身。 */
export interface AIAnswer {
  /** 表示する本文。Markdown を含みうる。 */
  text: string;
  /**
   * 回答が扱った Concept。
   *
   * 学習イベントの記録（MVP/02 #23）はこれを根拠に習熟度を更新する。
   * AI が Concept を特定できないことは普通に起きるため空配列を許す。
   */
  conceptIds: ConceptId[];
  /** 回答が実際にどのモードで組み立てられたか。要求と一致するとは限らない。 */
  mode: AskMode;
  /** 応答したモデルの識別子。ログと検証に使う。 */
  model?: string;
  /**
   * 過去の会話（{@link AIRequest.history}）を踏まえた、直前までのやり取りに
   * 対する理解の見立て。
   *
   * `history` が空（初回の質問）の場合は判断材料が無いため省略される。
   * AIの見立てであり断定ではない点に注意。学習イベントの記録（MVP/02 #23）は
   * `"resolved"` の場合のみ `solved_independently` を追記する根拠に使う。
   */
  resolution?: "resolved" | "unclear";
}

/**
 * AI からの応答。
 *
 * 失敗を例外ではなく値で返す。context/clipboard.ts の ClipboardSelection と
 * 同じ形にそろえてあり、呼び出し側は try/catch ではなく `ok` の分岐で
 * 理由ごとの案内を出し分けられる。
 */
export type AIResponse = { ok: true; answer: AIAnswer } | { ok: false; error: AIError };
