import { Exchange, NewFinding } from "./types";

/**
 * Lightweight passive scanner: runs on every completed exchange (proxy
 * traffic and Repeater sends alike) and flags common misconfigurations
 * without sending any extra traffic. Deliberately conservative -- this
 * runs on every single response, so false positives here get very noisy
 * very fast; each check only fires when there's a concrete, low-ambiguity
 * signal, not a heuristic guess.
 */

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return null;
  const v = headers[key];
  return Array.isArray(v) ? v.join(", ") : v ?? null;
}

function allHeaderValues(headers: Record<string, string | string[] | undefined>, name: string): string[] {
  const v = headerValue(headers, name);
  return v ? v.split(/,(?=[^;]*=|$)/).map((s) => s.trim()) : [];
}

function decodeBody(b64: string, max = 200_000): string {
  if (!b64) return "";
  const buf = Buffer.from(b64, "base64");
  return buf.subarray(0, max).toString("utf-8");
}

const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "AWS Access Key ID", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Private key block", re: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { label: "Slack token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,48}\b/ },
  { label: "Stripe secret key", re: /\bsk_live_[0-9A-Za-z]{24,}\b/ },
  { label: "Generic bearer/API key assignment", re: /["']?(api[_-]?key|secret|access[_-]?token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-\.]{16,}["']/i },
];

export function scanExchange(exchange: Exchange): NewFinding[] {
  const findings: NewFinding[] = [];
  const { request, response } = exchange;
  if (!response) return findings;

  const contentType = (headerValue(response.headers, "content-type") || "").toLowerCase();
  const isHtml = contentType.includes("text/html");
  const isScriptOrJson = contentType.includes("javascript") || contentType.includes("json") || contentType.includes("text/plain");

  // ---- missing security headers (HTML documents only, successful responses)
  if (isHtml && response.statusCode >= 200 && response.statusCode < 400) {
    const missing: string[] = [];
    if (!headerValue(response.headers, "content-security-policy")) missing.push("Content-Security-Policy");
    if (!headerValue(response.headers, "x-frame-options") && !headerValue(response.headers, "content-security-policy")?.includes("frame-ancestors")) {
      missing.push("X-Frame-Options");
    }
    if (!headerValue(response.headers, "x-content-type-options")) missing.push("X-Content-Type-Options");
    if (exchange.isSSL && !headerValue(response.headers, "strict-transport-security")) missing.push("Strict-Transport-Security");

    if (missing.length > 0) {
      findings.push({
        title: `Missing security headers on ${exchange.host}`,
        description: `${request.method} ${request.url} — response is missing: ${missing.join(", ")}. Consider whether this is exploitable here (clickjacking, MIME sniffing, missing HSTS) or just noise for this response.`,
        severity: "low",
        status: "todo",
        source: "passive-scan",
        exchangeId: exchange.id,
        url: request.url,
      });
    }
  }

  // ---- cookie flags
  const setCookies = allHeaderValues(response.headers, "set-cookie");
  for (const cookie of setCookies) {
    const lower = cookie.toLowerCase();
    const flagsMissing: string[] = [];
    if (exchange.isSSL && !lower.includes("secure")) flagsMissing.push("Secure");
    if (!lower.includes("httponly")) flagsMissing.push("HttpOnly");
    if (!lower.includes("samesite")) flagsMissing.push("SameSite");
    if (flagsMissing.length > 0) {
      const cookieName = cookie.split("=")[0]?.trim() || "(unnamed)";
      findings.push({
        title: `Cookie "${cookieName}" missing ${flagsMissing.join("/")} on ${exchange.host}`,
        description: `${request.method} ${request.url} set a cookie without: ${flagsMissing.join(", ")}. Missing HttpOnly makes it readable from JS (XSS→session theft); missing Secure/SameSite widens CSRF/interception exposure.`,
        severity: flagsMissing.includes("HttpOnly") || flagsMissing.includes("Secure") ? "medium" : "low",
        status: "todo",
        source: "passive-scan",
        exchangeId: exchange.id,
        url: request.url,
      });
      break; // one cookie finding per exchange is enough signal, avoid spam on multi-cookie responses
    }
  }

  // ---- permissive CORS
  const acao = headerValue(response.headers, "access-control-allow-origin");
  const acac = headerValue(response.headers, "access-control-allow-credentials");
  if (acao === "*" && acac?.toLowerCase() === "true") {
    findings.push({
      title: `Invalid/dangerous CORS on ${exchange.host}`,
      description: `${request.method} ${request.url} responded with Access-Control-Allow-Origin: * together with Access-Control-Allow-Credentials: true. Browsers should reject this combo, but some proxies/CDNs still let it through -- worth confirming manually with a cross-origin credentialed request.`,
      severity: "high",
      status: "todo",
      source: "passive-scan",
      exchangeId: exchange.id,
      url: request.url,
    });
  } else if (acao === "*") {
    findings.push({
      title: `Wildcard CORS on ${exchange.host}`,
      description: `${request.method} ${request.url} responded with Access-Control-Allow-Origin: *. Fine for public read-only endpoints; worth checking this isn't exposing authenticated/sensitive data.`,
      severity: "info",
      status: "todo",
      source: "passive-scan",
      exchangeId: exchange.id,
      url: request.url,
    });
  }

  // ---- secrets in response body
  if (isScriptOrJson || isHtml) {
    const text = decodeBody(response.body);
    for (const { label, re } of SECRET_PATTERNS) {
      const match = text.match(re);
      if (match) {
        findings.push({
          title: `Possible ${label} exposed in response from ${exchange.host}`,
          description: `${request.method} ${request.url} — response body matches the pattern for a ${label}. Verify it's real and not a placeholder/test value before reporting.`,
          severity: "high",
          status: "todo",
          source: "passive-scan",
          exchangeId: exchange.id,
          url: request.url,
        });
        break; // one secret finding per exchange -- enough to flag it for review
      }
    }
  }

  // ---- GraphQL introspection
  const reqBodyText = decodeBody(request.body, 20_000);
  if (/__schema|IntrospectionQuery/.test(reqBodyText) && response.statusCode >= 200 && response.statusCode < 300) {
    const resText = decodeBody(response.body, 2000);
    if (resText.includes('"__schema"') || resText.includes('"data"')) {
      findings.push({
        title: `GraphQL introspection enabled on ${exchange.host}`,
        description: `${request.method} ${request.url} accepted an introspection query and returned schema data. Introspection left on in production reveals the full API surface (types, mutations, hidden fields) to anyone.`,
        severity: "medium",
        status: "todo",
        source: "passive-scan",
        exchangeId: exchange.id,
        url: request.url,
      });
    }
  }

  return findings;
}
