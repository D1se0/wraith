import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { wraithRoot } from "./store";
import { Finding, NewFinding } from "./types";

/**
 * The Kanban-style findings board, and also where the AI agent (and the
 * future passive scanner) record what they notice. Persisted as a single
 * JSON array file -- findings are a small, low-write-frequency dataset
 * compared to history, so unlike history.jsonl this doesn't need an
 * append-only log, just load-modify-save.
 */
const FINDINGS_PATH = () => path.join(wraithRoot(), "findings.json");

let cache: Finding[] | null = null;

function load(): Finding[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FINDINGS_PATH(), "utf-8"));
  } catch {
    cache = [];
  }
  return cache!;
}

function persist(): void {
  fs.writeFileSync(FINDINGS_PATH(), JSON.stringify(cache, null, 2), "utf-8");
}

export function getFindings(): Finding[] {
  return load();
}

export function addFinding(input: NewFinding): Finding {
  const finding: Finding = { ...input, id: randomUUID(), createdAt: Date.now() };
  load().push(finding);
  persist();
  return finding;
}

export function updateFinding(id: string, patch: Partial<Finding>): Finding | null {
  const items = load();
  const idx = items.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id: items[idx].id, createdAt: items[idx].createdAt };
  persist();
  return items[idx];
}

export function deleteFinding(id: string): boolean {
  const items = load();
  const idx = items.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  persist();
  return true;
}

export function clearFindings(): void {
  cache = [];
  persist();
}
