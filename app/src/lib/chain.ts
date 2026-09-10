import { EditableRequest } from "../components/RequestEditor";
import { KV } from "../components/KeyValueEditor";

/**
 * Attack Chain Notebook: a saved sequence of requests where a later step
 * can reference a value extracted from an earlier one (e.g. step 1 logs in
 * and extracts an access_token, step 2 uses it as {{access_token}} in its
 * Authorization header) -- turns a multi-step exploit chain into something
 * you build once, replay with one click, and hand off as a runnable PoC.
 */

export interface ChainVarExtract {
  varName: string;
  /** "json:$.path.to.field" (dot-path into the parsed JSON body) or "regex:<pattern>" (first capture group, or whole match if none) */
  source: string;
}

export interface ChainStep {
  id: string;
  label: string;
  request: EditableRequest;
  insecure: boolean;
  extracts: ChainVarExtract[];
  lastStatusCode?: number;
  lastBodyPreview?: string;
  lastExtracted?: Record<string, string>;
  lastError?: string;
}

const VAR_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(VAR_RE, (whole, name) => (name in vars ? vars[name] : whole));
}

function substituteKv(rows: KV[], vars: Record<string, string>): KV[] {
  return rows.map((r) => ({ key: substituteVars(r.key, vars), value: substituteVars(r.value, vars) }));
}

export function applySubstitution(req: EditableRequest, vars: Record<string, string>): EditableRequest {
  return {
    method: req.method,
    url: substituteVars(req.url, vars),
    headers: substituteKv(req.headers, vars),
    bodyText: substituteVars(req.bodyText, vars),
  };
}

/** Reads a value out of a parsed object by a dot path like "data.user.id" -- no array indexing, kept deliberately simple. */
function jsonPathGet(obj: any, path: string): unknown {
  const parts = path.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function extractValue(bodyText: string, source: string): string | null {
  if (source.startsWith("json:")) {
    const path = source.slice(5).trim();
    try {
      const parsed = JSON.parse(bodyText);
      const v = jsonPathGet(parsed, path);
      if (v === undefined || v === null) return null;
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      return null;
    }
  }
  if (source.startsWith("regex:")) {
    const pattern = source.slice(6);
    try {
      const match = bodyText.match(new RegExp(pattern));
      if (!match) return null;
      return match[1] !== undefined ? match[1] : match[0];
    } catch {
      return null;
    }
  }
  return null;
}

export function blankStep(index: number): ChainStep {
  return {
    id: `step-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    label: `Step ${index}`,
    request: { method: "GET", url: "https://", headers: [{ key: "User-Agent", value: "Wraith/1.0" }], bodyText: "" },
    insecure: true,
    extracts: [],
  };
}
