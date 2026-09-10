import { CapturedRequest, CapturedResponse, MatchReplaceRule } from "../types";

function applyOne(input: string, rule: MatchReplaceRule): string {
  if (rule.matchType === "regex") {
    try {
      return input.replace(new RegExp(rule.match, "g"), rule.replace);
    } catch {
      return input; // invalid regex -- skip rather than crash the proxy pipeline
    }
  }
  return rule.match ? input.split(rule.match).join(rule.replace) : input;
}

/**
 * Exported on its own (not just used internally) because the proxy engine
 * needs to rewrite response headers at the point they're first written to
 * the client -- which, in streaming mode (Intercept Responses off), happens
 * before a full CapturedResponse object exists yet.
 */
export function applyHeaderRules(
  headers: Record<string, string | string[] | undefined>,
  rules: MatchReplaceRule[],
  scope: "request" | "response"
): Record<string, string | string[] | undefined> {
  const headerRules = rules.filter((r) => r.enabled && r.scope === scope && r.target === "header" && r.headerName);
  if (headerRules.length === 0) return headers;
  const out = { ...headers };
  for (const [key, value] of Object.entries(out)) {
    const rule = headerRules.find((r) => r.headerName!.toLowerCase() === key.toLowerCase());
    if (!rule || value === undefined) continue;
    out[key] = Array.isArray(value) ? value.map((v) => applyOne(v, rule)) : applyOne(value, rule);
  }
  return out;
}

function applyToBody(bodyBase64: string, rules: MatchReplaceRule[]): string {
  const bodyRules = rules.filter((r) => r.target === "body");
  if (bodyRules.length === 0 || !bodyBase64) return bodyBase64;
  let text: string;
  try {
    text = Buffer.from(bodyBase64, "base64").toString("utf-8");
  } catch {
    return bodyBase64;
  }
  for (const rule of bodyRules) text = applyOne(text, rule);
  return Buffer.from(text, "utf-8").toString("base64");
}

/**
 * Global find/replace rules applied to every request that matches, before
 * it's forwarded upstream -- the request is fully buffered in memory at
 * this point in the pipeline, so this is always safe to run regardless of
 * whether Intercept is on.
 */
export function applyMatchReplaceToRequest(request: CapturedRequest, rules: MatchReplaceRule[]): CapturedRequest {
  const active = rules.filter((r) => r.enabled && r.scope === "request");
  if (active.length === 0) return request;
  let url = request.url;
  for (const rule of active.filter((r) => r.target === "url")) url = applyOne(url, rule);
  return { ...request, url, headers: applyHeaderRules(request.headers, rules, "request"), body: applyToBody(request.body, active) };
}

/**
 * Same idea for responses, but body rewriting is only safe once the
 * response is fully buffered -- the proxy streams response bodies straight
 * through to the client as they arrive when Intercept Responses is off, so
 * `includeBody` should only be true when the caller already has the full
 * buffered response (i.e. Intercept Responses is on). Header rewriting is
 * always safe: headers are written once, never streamed.
 */
export function applyMatchReplaceToResponse(response: CapturedResponse, rules: MatchReplaceRule[], includeBody: boolean): CapturedResponse {
  const active = rules.filter((r) => r.enabled && r.scope === "response");
  if (active.length === 0) return response;
  const headers = applyHeaderRules(response.headers, rules, "response");
  if (!includeBody) return { ...response, headers };
  return { ...response, headers, body: applyToBody(response.body, active) };
}
