import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { CodeContext, ConversationTurn, LearningEvent } from "@gakushu-sochi/domain";
import type { AIProvider } from "./ai/provider";
import { VSCodeLMProvider } from "./ai/vscodeLm";
import { CONSUMED_CONTEXT_MESSAGE, describePendingContext } from "./chat/context-summary";
import { openGakushuSochiChat } from "./chat/open";
import { PendingChatContext } from "./chat/pending-context";
import { createChatAIRequest } from "./chat/request";
import { readClipboard, readTerminalSelection } from "./context/clipboard";
import { collectFromEditor, collectFromText } from "./context/collector";
import { getOrCreateClientId, loadProfile, recordEvent } from "./learning/store";
import { syncEvent } from "./learning/sync";
import { confirmSend } from "./ui/confirm";

/**
 * 開発中の確認用チャンネル。
 *
 * console.log は「デバッグ コンソール」に出るため、拡張機能開発ホスト側からは見えず、
 * 開発中に CodeContext の中身を確認しづらい。出力チャンネルなら
 * 拡張機能開発ホストの「出力」からそのまま読める。
 *
 * 表示/01 (#14) が回答表示UIを実装したら、その責務はそちらへ移る。
 */
let channel: vscode.OutputChannel;

/** CodeContext を出力チャンネルへ書き出す。 */
function logContext(label: string, value: unknown): void {
  channel.appendLine(`--- ${label} ---`);
  channel.appendLine(JSON.stringify(value, null, 2));
  channel.show(true);
}

/**
 * Chat の履歴を、AI 層の共通契約（VS Code非依存）である ConversationTurn[] へ変換する。
 *
 * `ChatResponseTurn.response` にはボタン等も混在しうるが、現状このParticipantが
 * 積むのは markdown のみなので Markdown 以外の部分は無視する。
 */
function toConversationTurns(
  history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[],
): ConversationTurn[] {
  return history.map((turn) => {
    if (turn instanceof vscode.ChatRequestTurn) {
      const contextMatch = turn.prompt.match(/^\[context:([^\]]+)\]\s*/);
      const text = contextMatch ? turn.prompt.slice(contextMatch[0].length) : turn.prompt;
      return { role: "user", text };
    }

    const text = turn.response
      .filter(
        (part): part is vscode.ChatResponseMarkdownPart =>
          part instanceof vscode.ChatResponseMarkdownPart,
      )
      .map((part) => part.value.value)
      .join("");
    return { role: "assistant", text };
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

export function activate(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("Gakushu Sochi");
  context.subscriptions.push(channel);
  channel.appendLine("Gakushu Sochi がアクティブになりました。");
  const pendingChatContext = new PendingChatContext();
  // ユーザー自身の Copilot 契約を使って回答を生成する。
  // onDebug: Concept抽出（AI/03 #12）の切り分け用。モデルの生の応答を出力チャンネルへ流す。
  const provider: AIProvider = new VSCodeLMProvider((message) => channel.appendLine(message));

  // MVP/02 (#23): 学習フィードバックをローカル保存する。
  // メモリ上に持ち、イベントのたびに globalState へ反映する
  // （globalState自体をキャッシュとして毎回読み直さない）。
  let profile = loadProfile(context);

  /** 学習イベントを1件記録する。保存に失敗しても質問フローは止めない。 */
  async function persistEvent(event: LearningEvent): Promise<void> {
    profile = await recordEvent(context, profile, event, (error) => {
      channel.appendLine(`LearnerProfile の保存に失敗しました: ${String(error)}`);
    });
    channel.appendLine(`--- LearningEvent ---\n${JSON.stringify(event, null, 2)}`);

    // Issue #56: ローカル保存（globalState）に加えて、サーバー側の正本（D1）へも
    // 送る。同期の失敗は、ローカル保存の失敗と同じくログに残すだけで質問フローは
    // 止めない。
    const config = vscode.workspace.getConfiguration("gakushuSochi");
    const apiBaseUrl = config.get<string>("api.baseUrl", "");
    if (!apiBaseUrl) {
      return;
    }

    const clientId = await getOrCreateClientId(context);
    const outcome = await syncEvent(event, {
      apiBaseUrl,
      apiToken: config.get<string>("api.token", ""),
      clientId,
    });

    if (!outcome.ok) {
      channel.appendLine(`クラウド同期に失敗しました: ${outcome.reason}`);
      return;
    }
    channel.appendLine(
      `クラウド同期: ${outcome.status}${outcome.reason ? `（${outcome.reason}）` : ""}`,
    );
  }

  /** 文脈を保持して、最初の質問を入力済みの Gakushu Sochi Chat を開く。 */

  async function openChatForContext(codeContext: CodeContext): Promise<void> {
    const contextId = pendingChatContext.set(codeContext);
    logContext(codeContext.source, codeContext);

    try {
      await openGakushuSochiChat(contextId, vscode.commands.executeCommand);
    } catch (error) {
      // Chat が開かなければ Participant は呼ばれず、保持した文脈は永久に取り出されない。
      // 捨てるのは確実だが、黙って捨てるとユーザーは押した操作が無反応にしか見えない。
      // 破棄・ログ・通知の3つを揃える。
      pendingChatContext.discard(contextId);
      channel.appendLine(`Chat を開けませんでした: ${String(error)}`);
      vscode.window.showErrorMessage(
        "Gakushu Sochi Chat を開けませんでした。GitHub Copilot Chat が有効か確認してください。",
      );
    }
  }

  const chatParticipant = vscode.chat.createChatParticipant(
    "gakushuSochi.chat",
    async (request, _chatContext, response) => {
      const contextMatch = request.prompt.match(/^\[context:([^\]]+)\]\s*/);
      const question = contextMatch ? request.prompt.slice(contextMatch[0].length) : request.prompt;

      // マーカーが無い場合と、マーカーはあるが消費済みの場合を混ぜない。
      // 後者はユーザーの質問が捨てられる状況であり、復帰手段まで伝える必要がある。
      if (!contextMatch) {
        response.markdown(describePendingContext(undefined));
        return;
      }

      const codeContext = pendingChatContext.take(contextMatch[1]);

      if (!codeContext) {
        response.markdown(CONSUMED_CONTEXT_MESSAGE);
        return;
      }

      response.progress("Gakushu Sochi が考えています...");
      const history = toConversationTurns(_chatContext.history);
      const aiResponse = await provider.ask(createChatAIRequest(codeContext, question, history));

      if (!aiResponse.ok) {
        response.markdown(`回答を生成できませんでした（${aiResponse.error.reason}）。`);
        return;
      }

      response.markdown(aiResponse.answer.text);

      // MVP/02 (#23): 自己申告ではなく、行動と結果から習熟度を組み立てる。
      // ここでは「質問に答えた」事実を記録する。ヒントか解説かで種別を分ける。
      const sessionId = randomUUID();
      await persistEvent({
        id: randomUUID(),
        occurredAt: nowIso(),
        type: aiResponse.answer.mode === "hint" ? "hint_used" : "answer_viewed",
        origin: "vscode",
        conceptIds: aiResponse.answer.conceptIds,
        language: codeContext.languageId,
        sessionId,
      });

      // 過去の会話（history）を踏まえてAIが「理解が解消された」と判断した場合のみ、
      // 自力解決の根拠を追加で記録する。履歴が無い最初のターンでは resolution は
      // 付かないため、ここは2回目以降のやり取りでしか発生しない。
      if (aiResponse.answer.resolution === "resolved" && aiResponse.answer.conceptIds.length > 0) {
        await persistEvent({
          id: randomUUID(),
          occurredAt: nowIso(),
          type: "solved_independently",
          origin: "vscode",
          conceptIds: aiResponse.answer.conceptIds,
          language: codeContext.languageId,
          sessionId,
        });
      }
    },
  );
  context.subscriptions.push(chatParticipant);

  const askSelection = vscode.commands.registerCommand("gakushuSochi.askSelection", async () => {
    const editor = vscode.window.activeTextEditor;

    // エディタが開いていない状態でコマンドパレットから実行された場合。
    // 何もせず終了する。エラーにはしない。
    if (!editor) {
      return;
    }

    const selection = editor.selection;

    if (selection.isEmpty) {
      vscode.window.showInformationMessage("コードを選択してください");
      return;
    }

    const codeContext = await collectFromEditor(editor);

    await openChatForContext(codeContext);
  });

  const askTerminalSelection = vscode.commands.registerCommand(
    "gakushuSochi.askTerminalSelection",
    async () => {
      const result = await readTerminalSelection();

      if (!result.ok) {
        // reason ごとに案内を変える。ClipboardSelection が理由を区別して返すのは
        // 呼び出し側で出し分けるためであり、まとめると次の操作が分からなくなる。
        vscode.window.showInformationMessage(
          result.reason === "no-selection"
            ? "ターミナルでテキストを選択してください"
            : "選択されたテキストが空です。内容のある範囲を選択してください。",
        );
        return;
      }

      if (!(await confirmSend(result.text))) {
        return;
      }

      // ターミナル経由は内容しか運ばれてこないため Lv1 になる。
      // source はこのコマンドから呼ばれたという事実で確定させる。推測はしない。
      await openChatForContext(collectFromText(result.text, "terminal"));
    },
  );

  // エディタにもターミナルにも当てはまらない入力元（ブラウザ、他アプリ）向け。
  // キーバインドは割り当てない。他アプリから戻った直後はフォーカス位置が
  // 予測できず、askSelection や askTerminalSelection が誤って動くため。
  const askClipboard = vscode.commands.registerCommand("gakushuSochi.askClipboard", async () => {
    const result = await readClipboard();

    if (!result.ok) {
      // readClipboard は現状 "empty" しか返さないが、それに寄りかからない。
      // 種別が増えたときに「クリップボードが空です」と誤った案内を出し続けるより、
      // ここで分岐しておいて理由をそのまま伝えるほうが崩れ方が小さい。
      vscode.window.showInformationMessage(
        result.reason === "empty"
          ? "クリップボードが空です。送りたい内容をコピーしてから実行してください。"
          : `クリップボードから取得できませんでした（${result.reason}）。`,
      );
      return;
    }

    if (!(await confirmSend(result.text))) {
      return;
    }

    // クリップボードは内容しか運ばず出所の情報を持たない。
    // このコマンドから呼ばれたという事実だけが source の根拠になる。
    await openChatForContext(collectFromText(result.text, "clipboard"));
  });

  context.subscriptions.push(askSelection, askTerminalSelection, askClipboard);
}

export function deactivate(): void {}
