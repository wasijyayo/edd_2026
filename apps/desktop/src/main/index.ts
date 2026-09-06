import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { createCredentialStore } from "./credentials.js";
import { captureSelection, type ClipboardSnapshot } from "./selection.js";
import { DEFAULT_SETTINGS, normalizeSettings, type DesktopSettings } from "./settings.js";
import { parseOpenAIStream } from "./stream.js";
import { normalizeQuestion } from "./question.js";
import { shouldShowStartupWindow } from "./startup.js";
import { activatePopup } from "./activation.js";

const execFileAsync = promisify(execFile);
const SERVICE_NAME = "Gakushu Sochi";
const MAX_SELECTION_LENGTH = 20_000;
const ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
let popup: BrowserWindow | undefined;
let tray: Tray | undefined;
let settings = { ...DEFAULT_SETTINGS };
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function updateLoginItem(): void {
  // 開発中は electron バイナリ自身をログイン項目へ登録できないため、
  // パッケージ済みアプリでのみ OS の自動起動設定を変更する。
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  }
}

async function guideAccessibilityPermission(): Promise<void> {
  if (process.platform !== "darwin" || systemPreferences.isTrustedAccessibilityClient(true)) return;
  const result = await dialog.showMessageBox({
    type: "warning",
    title: "アクセシビリティ許可が必要です",
    message: "選択テキストを取得するには、Gakushu Sochi にコンピュータの制御を許可してください。",
    detail:
      "システム設定の「プライバシーとセキュリティ > アクセシビリティ」で、開発中は Electron を追加して有効にしてください。許可後にアプリを再起動するとショートカットが使えます。",
    buttons: ["アクセシビリティ設定を開く", "後で設定する"],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response === 0) {
    await openAccessibilitySettings();
  }
}

async function openAccessibilitySettings(): Promise<void> {
  if (process.platform !== "darwin") return;
  // URL スキームだけでは無視される macOS 環境があるため、アプリを明示する。
  await execFileAsync("/usr/bin/open", ["-a", "System Settings", ACCESSIBILITY_SETTINGS_URL]);
}

function credentialStore(fileName: string) {
  const filePath = path.join(app.getPath("userData"), fileName);
  return createCredentialStore(
    {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value).toString("base64"),
      decrypt: (value) => safeStorage.decryptString(Buffer.from(value, "base64")),
    },
    {
      read: () => (existsSync(filePath) ? readFileSync(filePath, "utf8") : ""),
      write: (value) => writeFileSync(filePath, value, { encoding: "utf8", mode: 0o600 }),
    },
  );
}

function apiTokenStore() {
  return credentialStore("api-token.enc");
}

async function readClipboardSnapshot(): Promise<ClipboardSnapshot> {
  const items = await clipboard.read();
  const fingerprints: string[] = [];
  for (const item of items) {
    const values: string[] = [];
    for (const type of [...item.types].sort()) {
      const value = await item.getType(type);
      if (value instanceof Blob) {
        const bytes = Buffer.from(await value.arrayBuffer()).toString("base64");
        values.push(`${type}:blob:${value.type}:${bytes}`);
      } else {
        values.push(`${type}:bookmark:${JSON.stringify(value)}`);
      }
    }
    fingerprints.push(values.join("\u0000"));
  }
  return { items, fingerprint: fingerprints.join("\u0001") };
}

async function loadSettings(): Promise<void> {
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  try {
    settings = normalizeSettings(JSON.parse(await readFile(settingsPath, "utf8")));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("設定ファイルを読み込めませんでした", { cause: error });
  }
}

async function saveSettings(next: DesktopSettings): Promise<void> {
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  settings = next;
  updateLoginItem();
}

function createPopup(): BrowserWindow {
  const window = new BrowserWindow({
    width: 560,
    height: 600,
    show: false,
    resizable: true,
    minimizable: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), "out/main/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void window.loadFile(path.join(app.getAppPath(), "src/renderer/index.html"));
  window.on("closed", () => {
    popup = undefined;
  });
  return window;
}

function showPopup(selection: string, error?: string): void {
  popup ??= createPopup();
  activatePopup(app, popup);
  const sendSelection = () => popup?.webContents.send("selection", { selection, error });
  if (popup.webContents.isLoading()) popup.webContents.once("did-finish-load", sendSelection);
  else sendSelection();
}

async function simulateCopy(): Promise<void> {
  if (process.platform === "darwin") {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      );
      throw new Error(
        "選択テキストを取得するには、システム設定の「プライバシーとセキュリティ > アクセシビリティ」で Gakushu Sochi（開発中は Electron）にコンピュータの制御を許可してください。",
      );
    }
    await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to tell (first process whose frontmost is true) to key code 8 using {command down}',
    ]);
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')",
    ]);
    return;
  }
  throw new Error(
    "この OS の選択テキスト取得には未対応です。macOS または Windows で実行してください。",
  );
}

async function openForSelection(): Promise<void> {
  try {
    const selection = await captureSelection({
      readText: () => clipboard.readText(),
      copy: simulateCopy,
      wait: () => new Promise((resolve) => setTimeout(resolve, 250)),
      readClipboard: readClipboardSnapshot,
      writeClipboard: (items) => clipboard.write([...items] as Electron.ClipboardItem[]),
      restoreClipboard: settings.restoreClipboard,
    });
    showPopup(
      selection.length > MAX_SELECTION_LENGTH
        ? selection.slice(0, MAX_SELECTION_LENGTH)
        : selection,
      selection.length > MAX_SELECTION_LENGTH
        ? `長文のため先頭 ${MAX_SELECTION_LENGTH.toLocaleString()} 文字のみを使用します。`
        : undefined,
    );
  } catch (error) {
    showPopup("", error instanceof Error ? error.message : "選択テキストの取得に失敗しました。");
  }
}

function registerShortcut(shortcut: string): void {
  globalShortcut.unregisterAll();
  if (
    !globalShortcut.register(shortcut, () => {
      void openForSelection();
    })
  ) {
    throw new Error(
      `ショートカット「${shortcut}」を登録できませんでした。他のアプリとの競合または権限を確認してください。`,
    );
  }
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip(SERVICE_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "選択テキストを質問",
        click: () => {
          void openForSelection();
        },
      },
      { label: "設定", click: () => showPopup("") },
      ...(process.platform === "darwin"
        ? [
            {
              label: "アクセシビリティ設定を開く",
              click: () => {
                void openAccessibilitySettings().catch((error) =>
                  showPopup(
                    "",
                    error instanceof Error
                      ? `アクセシビリティ設定を開けませんでした: ${error.message}`
                      : "アクセシビリティ設定を開けませんでした。",
                  ),
                );
              },
            },
          ]
        : []),
      { type: "separator" },
      { label: "終了", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => {
    void openForSelection();
  });
}

async function askManagedAI(
  selection: string,
  question: string,
  onDelta: (text: string) => void,
): Promise<void> {
  const apiToken = apiTokenStore().get();
  if (!apiToken) throw new Error("API トークンが未設定です。設定で入力してください。");
  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}/v1/ai/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      selection,
      question,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    }),
  });
  if (!response.ok || !response.body)
    throw new Error(
      `API サービスへの接続に失敗しました (${response.status})。API URL・トークンとネットワークを確認してください。`,
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    parseOpenAIStream(lines.join("\n"), onDelta);
    if (done) break;
  }
  if (pending) parseOpenAIStream(pending, onDelta);
}

app.on("second-instance", () => {
  if (popup) {
    popup.show();
    popup.focus();
  }
});

app
  .whenReady()
  .then(async () => {
    if (!hasSingleInstanceLock) return;
    await loadSettings();
    updateLoginItem();
    await guideAccessibilityPermission();
    createTray();
    registerShortcut(settings.shortcut);
    ipcMain.handle("settings:get", async () => ({
      ...settings,
      hasApiToken: Boolean(apiTokenStore().get()),
    }));
    ipcMain.handle(
      "settings:save",
      async (_event, next: DesktopSettings & { apiToken?: string }) => {
        const { apiToken, ...candidate } = next;
        const valid = normalizeSettings(candidate);
        if (
          JSON.stringify(valid) === JSON.stringify(DEFAULT_SETTINGS) &&
          JSON.stringify(candidate) !== JSON.stringify(DEFAULT_SETTINGS)
        )
          throw new Error("設定値が不正です。");
        try {
          registerShortcut(valid.shortcut);
        } catch (error) {
          registerShortcut(settings.shortcut);
          throw error;
        }
        await saveSettings(valid);
        if (apiToken) apiTokenStore().set(apiToken);
      },
    );
    ipcMain.handle("selection:retry", openForSelection);
    ipcMain.handle("answer:ask", async (event, selection: string, question: string) => {
      if (!selection.trim()) throw new Error("選択テキストを取得できませんでした。");
      await askManagedAI(selection, normalizeQuestion(question), (delta) =>
        event.sender.send("answer:delta", delta),
      );
    });
    ipcMain.handle("window:close", () => popup?.hide());
    ipcMain.handle("system:accessibility", async () => {
      await openAccessibilitySettings();
    });
    if (shouldShowStartupWindow(app.isPackaged)) showPopup("");
  })
  .catch((error) => {
    console.error("アプリの初期化に失敗しました", error);
    const message = error instanceof Error ? error.message : "アプリの初期化に失敗しました。";
    dialog.showErrorBox("Gakushu Sochi の起動に失敗しました", message);
    app.quit();
  });

app.on("will-quit", () => globalShortcut.unregisterAll());
