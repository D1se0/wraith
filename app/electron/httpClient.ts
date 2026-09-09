import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { CapturedResponse } from "./types";

export interface SendOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  insecure?: boolean;
  timeoutMs?: number;
  maxCaptureBytes?: number;
  /** called with each raw chunk as it arrives, before the capture cap is applied */
  onChunk?: (chunk: Buffer) => void;
  onHeaders?: (statusCode: number, statusMessage: string, headers: http.IncomingHttpHeaders) => void;
}

export interface SendResult {
  response: CapturedResponse;
  raw: http.IncomingMessage;
}

/**
 * Performs a single outbound HTTP(S) request and fully resolves it,
 * capturing up to `maxCaptureBytes` of the response body for display
 * while still allowing the caller to stream every byte via onChunk.
 *
 * Used by both the intercepting proxy (forwarding) and the Repeater tab,
 * so "resend this request" and "let this request through" behave identically.
 */
export function sendHttpRequest(opts: SendOptions): Promise<SendResult> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(opts.url);
    } catch (e) {
      reject(e);
      return;
    }
    const isSSL = target.protocol === "https:";
    const lib = isSSL ? https : http;
    const started = Date.now();
    const maxCapture = opts.maxCaptureBytes ?? 5 * 1024 * 1024;

    const headers = { ...opts.headers };
    delete headers["content-length"];
    if (opts.body && opts.body.length > 0) {
      headers["content-length"] = String(opts.body.length);
    }

    const req = lib.request(
      {
        method: opts.method,
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isSSL ? 443 : 80),
        path: target.pathname + target.search,
        headers,
        rejectUnauthorized: opts.insecure ? false : true,
        timeout: opts.timeoutMs ?? 30000,
      },
      (res) => {
        opts.onHeaders?.(res.statusCode || 0, res.statusMessage || "", res.headers);
        const chunks: Buffer[] = [];
        let captured = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          opts.onChunk?.(chunk);
          if (captured < maxCapture) {
            const room = maxCapture - captured;
            const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
            chunks.push(slice);
            captured += slice.length;
            if (slice.length < chunk.length) truncated = true;
          } else {
            truncated = true;
          }
        });
        res.on("end", () => {
          resolve({
            raw: res,
            response: {
              statusCode: res.statusCode || 0,
              statusMessage: res.statusMessage || "",
              headers: res.headers as any,
              body: Buffer.concat(chunks).toString("base64"),
              bodyTruncated: truncated,
              timeMs: Date.now() - started,
            },
          });
        });
        res.on("error", reject);
      }
    );

    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);

    if (opts.body && opts.body.length > 0) {
      req.write(opts.body);
    }
    req.end();
  });
}
