import { randomUUID } from "crypto";
import { sendHttpRequest } from "./httpClient";
import { detectTags } from "./proxy/rules";
import { CapturedRequest, Exchange } from "./types";

export interface RepeaterSendRequest {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  bodyBase64: string;
  insecure: boolean;
}

/**
 * Fires a single request outside the proxy pipeline (the Repeater tab)
 * and returns a fully-formed Exchange so the UI can render it with the
 * same request/response viewer components used everywhere else.
 */
export async function repeaterSend(req: RepeaterSendRequest, maxCaptureBytes: number): Promise<Exchange> {
  const headerMap: Record<string, string> = {};
  for (const h of req.headers) {
    if (h.key.trim()) headerMap[h.key] = h.value;
  }

  const request: CapturedRequest = {
    method: req.method,
    url: req.url,
    httpVersion: "1.1",
    headers: headerMap,
    body: req.bodyBase64 || "",
  };

  const startedAt = Date.now();
  const exchangeId = randomUUID();
  const host = safeHost(req.url);

  try {
    const { response } = await sendHttpRequest({
      method: req.method,
      url: req.url,
      headers: headerMap,
      body: Buffer.from(req.bodyBase64 || "", "base64"),
      insecure: req.insecure,
      maxCaptureBytes,
    });

    return {
      id: exchangeId,
      protocol: req.url.startsWith("https") ? "https" : "http",
      host,
      port: portFromUrl(req.url),
      isSSL: req.url.startsWith("https"),
      request,
      response,
      tags: detectTags(request, response),
      startedAt,
      finishedAt: Date.now(),
      fromTool: "repeater",
    };
  } catch (err: any) {
    return {
      id: exchangeId,
      protocol: req.url.startsWith("https") ? "https" : "http",
      host,
      port: portFromUrl(req.url),
      isSSL: req.url.startsWith("https"),
      request,
      response: {
        statusCode: 0,
        statusMessage: "Connection failed",
        headers: {},
        body: Buffer.from(String(err?.message || err)).toString("base64"),
        bodyTruncated: false,
        timeMs: Date.now() - startedAt,
      },
      tags: detectTags(request, null),
      startedAt,
      finishedAt: Date.now(),
      fromTool: "repeater",
    };
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function portFromUrl(url: string): number {
  try {
    const u = new URL(url);
    return u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  } catch {
    return 0;
  }
}
