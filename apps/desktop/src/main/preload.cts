import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  retrySelection: () => ipcRenderer.invoke("selection:retry"),
  ask: (selection: string, question: string) =>
    ipcRenderer.invoke("answer:ask", selection, question),
  close: () => ipcRenderer.invoke("window:close"),
  openAccessibilitySettings: () => ipcRenderer.invoke("system:accessibility"),
  onSelection: (listener: (payload: { selection: string; error?: string }) => void) =>
    ipcRenderer.on("selection", (_event, payload) => listener(payload)),
  onDelta: (listener: (delta: string) => void) =>
    ipcRenderer.on("answer:delta", (_event, delta) => listener(delta)),
});
