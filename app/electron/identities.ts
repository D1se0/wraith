import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { wraithRoot } from "./store";
import { Identity, NewIdentity } from "./types";

/**
 * Named sets of auth headers (Authorization/Cookie/whatever) a user can
 * save once and then "Replay as..." from History -- the classic broken
 * access control / IDOR check: does the same request return someone
 * else's data under a different identity? Same load/persist pattern as
 * findings.ts.
 */
const IDENTITIES_PATH = () => path.join(wraithRoot(), "identities.json");

let cache: Identity[] | null = null;

function load(): Identity[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(IDENTITIES_PATH(), "utf-8"));
  } catch {
    cache = [];
  }
  return cache!;
}

function persist(): void {
  fs.writeFileSync(IDENTITIES_PATH(), JSON.stringify(cache, null, 2), "utf-8");
}

export function getIdentities(): Identity[] {
  return load();
}

export function addIdentity(input: NewIdentity): Identity {
  const identity: Identity = { ...input, id: randomUUID() };
  load().push(identity);
  persist();
  return identity;
}

export function updateIdentity(id: string, patch: Partial<Identity>): Identity | null {
  const items = load();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id: items[idx].id };
  persist();
  return items[idx];
}

export function deleteIdentity(id: string): boolean {
  const items = load();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  persist();
  return true;
}
