import type { CodeContext } from "../types/context";

/**
 * Chat を開く操作時に収集した文脈。
 *
 * Chat Participant のリクエストには、元のエディタ選択や LSP の結果が自動では
 * 含まれない。そのため送信直前ではなく、ショートカットを押した時点の結果を
 * 保持する。Participant 実装時は `take()` の値を AIRequest に載せる。
 */
export class PendingChatContext {
  private readonly values = new Map<string, CodeContext>();
  private nextId = 1;

  set(context: CodeContext): string {
    const id = `context-${this.nextId}`;
    this.nextId += 1;
    this.values.set(id, context);
    return id;
  }

  /** 最初の質問にだけ文脈を渡し、別の会話への混入を防ぐ。 */
  take(id: string): CodeContext | undefined {
    const context = this.values.get(id);
    this.values.delete(id);
    return context;
  }
}
