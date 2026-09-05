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

/**
 * 既定で使う family。
 *
 * docs/lm-api.md の実機検証で、selectChatModels() の一覧には copilot-utility や
 * copilotcli/auto のようなチャット用途ではないモデルが混ざることが分かっている。
 * 何も指定せず先頭を使うと、そうしたモデルに送って応答が空になることがある。
 */
const DEFAULT_FAMILY = "gpt-4o-mini";

/** AIRequest を LanguageModelChatMessage の配列へ変換する。 */
function toMessages(request: AIRequest): vscode.LanguageModelChatMessage[] {
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

  return [vscode.LanguageModelChatMessage.User(lines.join("\n"))];
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

      let text = "";
      for await (const chunk of response.text) {
        text += chunk;
      }

      return {
        ok: true,
        answer: {
          text,
          // Concept の抽出はプロンプト側（AI/03 #12）の仕事。ここでは行わない。
          conceptIds: [],
          mode: request.mode,
          model: model.id,
        },
      };
    } catch (error) {
      return { ok: false, error: toAIError(error) };
    }
  }
}
