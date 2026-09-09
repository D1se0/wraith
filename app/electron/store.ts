import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { Exchange, WraithSettings, HighlightRule } from "./types";

/**
 * Everything Wraith writes to disk lives under one root folder
 * (Electron's per-user "userData" dir) so install/uninstall never
 * scatters files: <userData>/{settings.json, history.jsonl, ca/, tmp/}
 */
export function wraithRoot(): string {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function caDir(): string {
  const dir = path.join(wraithRoot(), "ca");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function tmpDir(): string {
  const dir = path.join(wraithRoot(), "tmp");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const SETTINGS_PATH = () => path.join(wraithRoot(), "settings.json");
const HISTORY_PATH = () => path.join(wraithRoot(), "history.jsonl");

const DEFAULT_HIGHLIGHT_RULES: HighlightRule[] = [
  { id: "hl-json", label: "JSON", enabled: true, color: "#37e6c4", matchTag: "json", matchScope: "any" },
  { id: "hl-graphql", label: "GraphQL", enabled: true, color: "#c792ff", matchTag: "graphql", matchScope: "any" },
  { id: "hl-auth", label: "Auth / Cookies", enabled: true, color: "#ff5c8a", matchTag: "auth", matchScope: "any" },
  { id: "hl-error", label: "4xx / 5xx", enabled: true, color: "#ff8a3d", matchTag: "error", matchScope: "response" },
  { id: "hl-html", label: "HTML", enabled: false, color: "#4fb0ff", matchTag: "html", matchScope: "any" },
];

export function defaultSettings(): WraithSettings {
  return {
    proxy: {
      port: 8081,
      host: "0.0.0.0",
      interceptRequests: false,
      interceptResponses: false,
      interceptScope: [],
      allowInsecureUpstream: true,
      maxBodyCaptureBytes: 5 * 1024 * 1024,
    },
    highlightRules: DEFAULT_HIGHLIGHT_RULES,
    theme: "wraith-dark",
    firstRunComplete: false,
  };
}

let cachedSettings: WraithSettings | null = null;

export function loadSettings(): WraithSettings {
  if (cachedSettings) return cachedSettings;
  let resolved: WraithSettings;
  try {
    const raw = fs.readFileSync(SETTINGS_PATH(), "utf-8");
    const parsed = JSON.parse(raw);
    resolved = { ...defaultSettings(), ...parsed, proxy: { ...defaultSettings().proxy, ...parsed.proxy } };
  } catch {
    resolved = defaultSettings();
  }
  cachedSettings = resolved;
  return resolved;
}

export function saveSettings(settings: WraithSettings): void {
  cachedSettings = settings;
  fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2), "utf-8");
}

export function updateSettings(patch: Partial<WraithSettings>): WraithSettings {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}

/**
 * History is append-only JSONL for cheap writes; the in-memory ring buffer
 * backs fast reads for the renderer. Capped so long sessions don't grow
 * memory/disk unbounded.
 */
const MAX_HISTORY_IN_MEMORY = 5000;
let historyBuffer: Exchange[] = [];
let historyStream: fs.WriteStream | null = null;

export function initHistory(): void {
  historyStream = fs.createWriteStream(HISTORY_PATH(), { flags: "a" });
}

export function appendExchange(exchange: Exchange): void {
  historyBuffer.push(exchange);
  if (historyBuffer.length > MAX_HISTORY_IN_MEMORY) {
    historyBuffer.splice(0, historyBuffer.length - MAX_HISTORY_IN_MEMORY);
  }
  historyStream?.write(JSON.stringify(exchange) + "\n");
}

export function updateExchange(id: string, patch: Partial<Exchange>): Exchange | null {
  const idx = historyBuffer.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  historyBuffer[idx] = { ...historyBuffer[idx], ...patch };
  return historyBuffer[idx];
}

export function getHistory(): Exchange[] {
  return historyBuffer;
}

export function clearHistory(): void {
  historyBuffer = [];
  try {
    fs.writeFileSync(HISTORY_PATH(), "");
  } catch {
    /* ignore */
  }
}

export function purgeAllWraithData(): void {
  const root = wraithRoot();
  fs.rmSync(root, { recursive: true, force: true });
}
