export interface DesktopSettings {
  apiBaseUrl: string;
  shortcut: string;
  model: string;
  temperature: number;
  maxTokens: number;
  restoreClipboard: boolean;
  launchAtLogin: boolean;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  apiBaseUrl: "http://localhost:8787",
  shortcut: "CommandOrControl+Shift+K",
  model: "gemini-3.6-flash",
  temperature: 0.3,
  maxTokens: 1024,
  restoreClipboard: true,
  launchAtLogin: false,
};

export function normalizeSettings(value: unknown): DesktopSettings {
  if (!isSettings(value)) return { ...DEFAULT_SETTINGS };
  return value;
}

function isSettings(value: unknown): value is DesktopSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.apiBaseUrl === "string" &&
    isSafeApiBaseUrl(settings.apiBaseUrl) &&
    typeof settings.shortcut === "string" &&
    settings.shortcut.length > 0 &&
    typeof settings.model === "string" &&
    settings.model.length > 0 &&
    typeof settings.temperature === "number" &&
    settings.temperature >= 0 &&
    settings.temperature <= 2 &&
    typeof settings.maxTokens === "number" &&
    Number.isInteger(settings.maxTokens) &&
    settings.maxTokens > 0 &&
    settings.maxTokens <= 16_384 &&
    typeof settings.restoreClipboard === "boolean" &&
    typeof settings.launchAtLogin === "boolean"
  );
}

function isSafeApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
