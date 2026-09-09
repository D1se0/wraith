import { CapturedRequest, CapturedResponse, Exchange, ExchangeTag, ScopeRule } from "../types";

function headerValue(headers: Record<string, any>, name: string): string {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : "";
}

function decodeBody(b64: string): string {
  if (!b64) return "";
  try {
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Classifies an exchange for the History table's colored badges and the
 * user-configurable highlight rules — this is what lets the Proxy tab
 * highlight "JSON" / "GraphQL" traffic the way the user asked for.
 */
export function detectTags(request: CapturedRequest, response: CapturedResponse | null): ExchangeTag[] {
  const tags = new Set<ExchangeTag>();
  const reqCT = headerValue(request.headers, "content-type");
  const resCT = response ? headerValue(response.headers, "content-type") : "";
  const url = request.url.toLowerCase();
  const reqBody = decodeBody(request.body);

  if (reqCT.includes("json") || resCT.includes("json")) tags.add("json");
  if (
    url.includes("/graphql") ||
    reqCT.includes("graphql") ||
    (reqCT.includes("json") && /"query"\s*:\s*"/.test(reqBody)) ||
    /\bquery\s*[\w]*\s*\{/.test(reqBody)
  ) {
    tags.add("graphql");
  }
  if (resCT.includes("html")) tags.add("html");
  if (resCT.includes("xml") && !resCT.includes("html")) tags.add("xml");
  if (resCT.includes("javascript") || url.endsWith(".js")) tags.add("js");
  if (resCT.includes("css") || url.endsWith(".css")) tags.add("css");
  if (resCT.startsWith("image/")) tags.add("image");
  if (reqCT.includes("form-urlencoded") || reqCT.includes("multipart/form-data")) tags.add("form");

  const authHeader = headerValue(request.headers, "authorization");
  const cookieHeader = headerValue(request.headers, "cookie");
  if (authHeader || /token|bearer|jwt|apikey|api_key/i.test(reqBody)) tags.add("auth");
  if (cookieHeader || (response && headerValue(response.headers, "set-cookie"))) tags.add("cookie");

  if (response && response.statusCode >= 400) tags.add("error");

  return Array.from(tags);
}

/**
 * Decides whether a request falls inside the interception scope. An empty
 * scope list means "everything", matching Burp's default target scope
 * behavior of intercepting all traffic until the user narrows it down.
 */
export function matchesScope(url: string, host: string, rules: ScopeRule[]): boolean {
  const active = rules.filter((r) => r.enabled);
  if (active.length === 0) return true;
  return active.some((r) => {
    if (r.pattern.startsWith("re:")) {
      try {
        return new RegExp(r.pattern.slice(3), "i").test(url);
      } catch {
        return false;
      }
    }
    return url.toLowerCase().includes(r.pattern.toLowerCase()) || host.toLowerCase().includes(r.pattern.toLowerCase());
  });
}

export function exchangeSearchableText(ex: Exchange): string {
  const reqBody = decodeBody(ex.request.body);
  const resBody = ex.response ? decodeBody(ex.response.body) : "";
  return [
    ex.request.method,
    ex.request.url,
    JSON.stringify(ex.request.headers),
    reqBody,
    ex.response ? String(ex.response.statusCode) : "",
    ex.response ? JSON.stringify(ex.response.headers) : "",
    resBody,
  ]
    .join(" \n ")
    .slice(0, 200000);
}
