import { Exchange, CapturedRequest, CapturedResponse } from "../../electron/types";
import { base64ToBytes, base64ToUtf8, isLikelyBinary, utf8ToBase64 } from "./base64";

/** Standard HAR 1.2 (http://www.softwareishard.com/blog/har-12-spec/) -- only the fields other tools (Burp, browser devtools, Postman) actually read/write. */

/** HTTP header names are case-insensitive by spec -- servers/clients disagree on capitalization constantly. */
function headerValueCI(headers: Record<string, string | string[] | undefined>, name: string): string {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  const v = key ? headers[key] : undefined;
  return v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
}

function headersToHarArray(headers: Record<string, string | string[] | undefined>): { name: string; value: string }[] {
  return Object.entries(headers || {}).flatMap(([name, v]) =>
    v === undefined ? [] : Array.isArray(v) ? v.map((value) => ({ name, value })) : [{ name, value: String(v) }]
  );
}

function harArrayToHeaders(entries: { name: string; value: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of entries || []) out[h.name] = h.value;
  return out;
}

function queryStringFromUrl(url: string): { name: string; value: string }[] {
  try {
    return Array.from(new URL(url).searchParams.entries()).map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

export function exchangesToHar(exchanges: Exchange[]): object {
  return {
    log: {
      version: "1.2",
      creator: { name: "Wraith", version: "0.3.0" },
      entries: exchanges.map((ex) => {
        const reqBytes = base64ToBytes(ex.request.body);
        const reqBinary = isLikelyBinary(reqBytes);
        const resBytes = ex.response ? base64ToBytes(ex.response.body) : new Uint8Array();
        const resBinary = ex.response ? isLikelyBinary(resBytes) : false;

        return {
          startedDateTime: new Date(ex.startedAt).toISOString(),
          time: ex.response?.timeMs ?? (ex.finishedAt ? ex.finishedAt - ex.startedAt : 0),
          request: {
            method: ex.request.method,
            url: ex.request.url,
            httpVersion: `HTTP/${ex.request.httpVersion}`,
            headers: headersToHarArray(ex.request.headers),
            queryString: queryStringFromUrl(ex.request.url),
            cookies: [],
            headersSize: -1,
            bodySize: reqBytes.length,
            ...(reqBytes.length > 0
              ? { postData: { mimeType: headerValueCI(ex.request.headers, "content-type") || "application/octet-stream", text: reqBinary ? ex.request.body : base64ToUtf8(ex.request.body), ...(reqBinary ? { encoding: "base64" } : {}) } }
              : {}),
          },
          response: ex.response
            ? {
                status: ex.response.statusCode,
                statusText: ex.response.statusMessage,
                httpVersion: `HTTP/${ex.request.httpVersion}`,
                headers: headersToHarArray(ex.response.headers),
                cookies: [],
                content: {
                  size: resBytes.length,
                  mimeType: headerValueCI(ex.response.headers, "content-type") || "application/octet-stream",
                  text: resBinary ? ex.response.body : base64ToUtf8(ex.response.body),
                  ...(resBinary ? { encoding: "base64" } : {}),
                },
                redirectURL: headerValueCI(ex.response.headers, "location"),
                headersSize: -1,
                bodySize: resBytes.length,
              }
            : { status: 0, statusText: "", httpVersion: "HTTP/1.1", headers: [], cookies: [], content: { size: 0, mimeType: "" }, redirectURL: "", headersSize: -1, bodySize: -1 },
          cache: {},
          timings: { send: 0, wait: ex.response?.timeMs ?? 0, receive: 0 },
        };
      }),
    },
  };
}

function safeHostname(url: string): string {
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

/** Best-effort HAR -> Exchange[] for import; tolerant of entries other tools produce that don't fill every optional field. */
export function harToExchanges(har: any): Omit<Exchange, "id">[] {
  const entries: any[] = har?.log?.entries || [];
  return entries.map((entry): Omit<Exchange, "id"> => {
    const req = entry.request || {};
    const res = entry.response;
    const startedAt = entry.startedDateTime ? new Date(entry.startedDateTime).getTime() : Date.now();
    const timeMs = typeof entry.time === "number" ? entry.time : 0;

    const request: CapturedRequest = {
      method: req.method || "GET",
      url: req.url || "",
      httpVersion: (req.httpVersion || "HTTP/1.1").replace(/^HTTP\//i, ""),
      headers: harArrayToHeaders(req.headers),
      body: req.postData?.text ? (req.postData.encoding === "base64" ? req.postData.text : utf8ToBase64(req.postData.text)) : "",
    };

    let response: CapturedResponse | null = null;
    if (res && typeof res.status === "number" && res.status > 0) {
      const bodyText: string = res.content?.text || "";
      response = {
        statusCode: res.status,
        statusMessage: res.statusText || "",
        headers: harArrayToHeaders(res.headers),
        body: bodyText ? (res.content?.encoding === "base64" ? bodyText : utf8ToBase64(bodyText)) : "",
        bodyTruncated: false,
        timeMs,
      };
    }

    const url = request.url;
    return {
      protocol: url.startsWith("https") ? "https" : "http",
      host: safeHostname(url),
      port: portFromUrl(url),
      isSSL: url.startsWith("https"),
      request,
      response,
      tags: [],
      startedAt,
      finishedAt: response ? startedAt + timeMs : null,
      note: "Imported from HAR",
    };
  });
}
