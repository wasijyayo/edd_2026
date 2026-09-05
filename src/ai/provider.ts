/**
 * AI Provider の共有契約。
 *
 * プロダクト価値を特定モデルに依存させないための境界。
 * ここに VS Code API を import しない。VSCodeLMProvider (#11) も
 * MockProvider も、この interface の実装として等価に差し替えられること。
 *
 * データ契約は src/types/ai.ts が持つ。このファイルは interface だけを置く。
 */

import type { AIRequest, AIResponse } from "../types/ai";

/**
 * 回答を生成する主体。
 *
 * `ask` は失敗しても reject しない。失敗は AIResponse の値として返す。
 * 例外で返すと、呼び出し側が理由を型で区別できず catch 内で文字列を見る羽目になる。
 * ネットワーク断のような想定外の例外まで握り潰す意図ではないが、
 * 既知の失敗（未契約・同意拒否・レート制限）は必ず値で返すこと。
 */
export interface AIProvider {
  /** 実装の識別子。ログと切り替えの確認に使う。例: `mock` / `vscode-lm` */
  readonly id: string;

  /** 1回の質問に対する回答を返す。 */
  ask(request: AIRequest): Promise<AIResponse>;

  /**
   * 回答を逐次返す。実装は任意。
   *
   * 調査/01 (#4) が未完了のため MVP では実装しないが、後から必須メソッドを
   * 足すのは既存実装を壊す変更になる。optional として最初から場所を空けておき、
   * #4 の結果を受けて実装するかどうかを決める。
   *
   * 呼び出し側は `provider.askStream` の有無で分岐し、無ければ `ask` を使う。
   * 最後に yield される値が完了した応答であり、途中の値は表示更新のためだけに使う。
   */
  askStream?(request: AIRequest): AsyncIterable<AIResponse>;
}
