const $ = (id) => document.getElementById(id);
const error = $("error"),
  selection = $("selection"),
  code = $("code"),
  question = $("question"),
  answer = $("answer"),
  send = $("send"),
  card = $("card"),
  cardTitle = $("card-title"),
  chips = $("chips"),
  form = $("settings-form");
let isAsking = false;

// Concept 一覧は packages/domain が正典（main の concepts:list 経由）。
// 習熟度はまだ API から取れないため、全件 "unobserved" で描く。
// 習熟度が取れるようになったら status をそこから埋める。
const renderConcepts = (concepts) => {
  const list = $("concepts");
  list.replaceChildren(
    ...concepts.map((concept) => {
      const item = document.createElement("li");
      item.className = "concept";
      item.dataset.status = concept.status ?? "unobserved";
      const dot = document.createElement("span");
      dot.className = "dot";
      const label = document.createElement("span");
      label.textContent = concept.label;
      item.append(dot, label);
      return item;
    }),
  );
};

const loadConcepts = async () => {
  try {
    renderConcepts(await window.desktop.getConcepts());
  } catch (e) {
    // 一覧が出せなくても質問はできるので、致命傷にはしない。
    showError(`Learning Map を読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`);
  }
};

// 選択テキストは #selection が唯一の保持先。#code は表示用の写し。
// 冒頭行（宣言部）だけ帯を敷いて、どこを聞いているかを示す。
const renderCode = (text) => {
  selection.value = text;
  const [first, ...rest] = text.split("\n");
  const head = document.createElement("span");
  head.className = "hl";
  head.textContent = first ?? "";
  code.replaceChildren(head, document.createTextNode(rest.length ? `\n${rest.join("\n")}` : ""));
};

// #error は失敗と成功の両方を出す共有チャネル。CSS が data-tone で色を出し分ける。
const showError = (message = "") => {
  error.textContent = message;
  error.dataset.tone = "error";
};
const showNotice = (message = "") => {
  error.textContent = message;
  error.dataset.tone = "notice";
};

void loadConcepts();

const accessibility = document.createElement("button");
// type を明示しないと submit 扱いになり、primary のスタイルも拾ってしまう。
accessibility.type = "button";
accessibility.textContent = "アクセシビリティ設定を開く";
accessibility.onclick = async () => {
  try {
    await window.desktop.openAccessibilitySettings();
  } catch (e) {
    showError(
      `アクセシビリティ設定を開けませんでした: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};
$("settings-cancel").before(accessibility);

const resetCard = () => {
  cardTitle.textContent = "質問する";
  question.hidden = false;
  answer.textContent = "";
  chips.hidden = true;
  chips.replaceChildren();
};

window.desktop.onSelection(({ selection: text, error: message }) => {
  renderCode(text);
  if (message) showError(message);
  else showNotice();
  resetCard();
  card.hidden = false;
  question.focus();
});
window.desktop.onDelta((delta) => {
  // 最初の delta で質問欄を畳み、カードを回答表示に切り替える。
  question.hidden = true;
  answer.textContent += delta;
});

$("retry").onclick = async () => {
  try {
    await window.desktop.retrySelection();
  } catch (e) {
    showError(e.message);
  }
};
$("close").onclick = () => window.desktop.close();
$("card-close").onclick = () => {
  card.hidden = true;
};
// 「もっと自分で考えたい」は Hint モードが入るまで質問欄へ促すだけに留める。
$("think").onclick = () => {
  question.hidden = false;
  question.focus();
  showNotice("自分の言葉で考えを書いてみてください。");
};

const ask = async () => {
  if (isAsking) return;
  isAsking = true;
  send.disabled = true;
  try {
    showNotice();
    answer.textContent = "";
    chips.hidden = true;
    const asked = question.value.trim();
    if (asked) cardTitle.textContent = asked;
    await window.desktop.ask(selection.value, question.value);
  } catch (e) {
    showError(e.message);
  } finally {
    isAsking = false;
    send.disabled = false;
  }
};
send.onclick = ask;

const openSettings = async () => {
  const s = await window.desktop.getSettings();
  ["api-base-url", "shortcut", "model", "temperature", "max-tokens"].forEach((id) => {
    $(id).value = s[id === "api-base-url" ? "apiBaseUrl" : id === "max-tokens" ? "maxTokens" : id];
  });
  $("restore").checked = s.restoreClipboard;
  $("login").checked = s.launchAtLogin;
  form.hidden = false;
};
$("settings").onclick = async () => {
  try {
    await openSettings();
  } catch (e) {
    showError(e.message);
  }
};
$("settings-cancel").onclick = () => {
  form.hidden = true;
};
form.onsubmit = async (event) => {
  event.preventDefault();
  try {
    await window.desktop.saveSettings({
      apiBaseUrl: $("api-base-url").value,
      shortcut: $("shortcut").value,
      apiToken: $("api-token").value,
      model: $("model").value,
      temperature: Number($("temperature").value),
      maxTokens: Number($("max-tokens").value),
      restoreClipboard: $("restore").checked,
      launchAtLogin: $("login").checked,
    });
    form.hidden = true;
    showNotice("設定を保存しました。");
  } catch (e) {
    showError(e.message);
  }
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    // 設定シートが開いていれば、まずそれだけ閉じる。
    if (!form.hidden) {
      form.hidden = true;
      return;
    }
    window.desktop.close();
  }
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void ask();
  }
});
