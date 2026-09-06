const $ = (id) => document.getElementById(id);
const error = $("error"),
  selection = $("selection"),
  question = $("question"),
  answer = $("answer"),
  form = $("settings-form");
const accessibility = document.createElement("button");
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
$("settings").parentElement?.append(accessibility);
const showError = (message = "") => {
  error.textContent = message;
};
window.desktop.onSelection(({ selection: text, error: message }) => {
  selection.value = text;
  showError(message);
  answer.textContent = "";
  question.focus();
});
window.desktop.onDelta((delta) => {
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
$("send").onclick = async () => {
  try {
    showError();
    answer.textContent = "";
    await window.desktop.ask(selection.value, question.value);
  } catch (e) {
    showError(e.message);
  }
};
$("settings").onclick = async () => {
  const s = await window.desktop.getSettings();
  ["api-base-url", "shortcut", "model", "temperature", "max-tokens"].forEach((id) => {
    $(id).value = s[id === "api-base-url" ? "apiBaseUrl" : id === "max-tokens" ? "maxTokens" : id];
  });
  $("restore").checked = s.restoreClipboard;
  $("login").checked = s.launchAtLogin;
  form.hidden = false;
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
    showError("設定を保存しました。");
  } catch (e) {
    showError(e.message);
  }
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.desktop.close();
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) $("send").click();
});
