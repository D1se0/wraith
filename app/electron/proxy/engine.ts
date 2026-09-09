import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import * as http from "http";
import * as net from "net";
import { Proxy } from "http-mitm-proxy";

import { sslCaDir } from "../ca";
import { sendHttpRequest } from "../httpClient";
import { detectTags, matchesScope } from "./rules";
import {
  Exchange,
  CapturedRequest,
  CapturedResponse,
  InterceptPending,
  InterceptResolution,
  ProxySettings,
} from "../types";

type SettingsProvider = () => ProxySettings;

function buildUrl(isSSL: boolean, host: string, port: string | number | null | undefined, reqPath: string): string {
  if (/^https?:\/\//i.test(reqPath)) return reqPath;
  const scheme = isSSL ? "https" : "http";
  const defaultPort = isSSL ? "443" : "80";
  const portSuffix = port && String(port) !== defaultPort ? `:${port}` : "";
  return `${scheme}://${host}${portSuffix}${reqPath}`;
}

function stringifyHeaders(headers: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (Array.isArray(v)) out[k] = v.join(", ");
    else if (v !== undefined) out[k] = String(v);
  }
  return out;
}

function cleanHeadersForWrite(headers: Record<string, any>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (/^(connection|transfer-encoding|content-length)$/i.test(k)) continue;
    if (v !== undefined) out[k] = v as any;
  }
  return out;
}

/**
 * http-mitm-proxy doesn't attach an 'error' handler to its internal HTTP
 * server, so a plain EADDRINUSE would otherwise surface as an uncaught
 * exception and crash the whole app. We probe the port ourselves first
 * and turn that into a clean, catchable rejection instead.
 */
function checkPortAvailable(port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        reject(new Error(`Port ${port} is unavailable (${err.code}). Pick a different port in Settings.`));
      } else {
        reject(err);
      }
    });
    tester.once("listening", () => {
      tester.close(() => resolve());
    });
    tester.listen(port, host === "0.0.0.0" ? undefined : host);
  });
}

function readClientBody(req: http.IncomingMessage, hardCapBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > hardCapBytes) {
        rejected = true;
        req.destroy();
        reject(new Error(`Request body exceeds the ${Math.round(hardCapBytes / 1024 / 1024)}MB capture cap (raise it in Settings)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on("error", (err) => {
      if (!rejected) reject(err);
    });
    req.resume();
  });
}

export declare interface WraithProxy {
  on(event: "exchange:new", listener: (exchange: Exchange) => void): this;
  on(event: "exchange:update", listener: (id: string, patch: Partial<Exchange>) => void): this;
  on(event: "intercept:pending", listener: (pending: InterceptPending) => void): this;
  on(event: "log", listener: (line: string) => void): this;
  on(event: "started", listener: (port: number, host: string) => void): this;
  on(event: "stopped", listener: () => void): this;
  on(event: "error", listener: (message: string) => void): this;
}

/**
 * The MITM engine takes full manual control of forwarding every request
 * (rather than letting http-mitm-proxy pipe it through automatically) so
 * that both requests AND responses can be paused, inspected, edited and
 * released one at a time -- the "Intercept" behaviour the whole Proxy tab
 * is built around. http-mitm-proxy is used purely for the hard part: TLS
 * termination with an on-the-fly, per-host certificate signed by our CA.
 */
export class WraithProxy extends EventEmitter {
  private proxy: any = null;
  private pending = new Map<string, (resolution: InterceptResolution) => void>();
  private settingsProvider: SettingsProvider;
  private running = false;

  constructor(settingsProvider: SettingsProvider) {
    super();
    this.settingsProvider = settingsProvider;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.running) {
        resolve();
        return;
      }
      const settings = this.settingsProvider();
      const proxy = new Proxy();
      this.proxy = proxy;

      proxy.onError((_ctx: any, err: Error | null | undefined, kind?: string) => {
        this.emit("log", `[${kind || "error"}] ${err?.message || err}`);
      });

      proxy.onRequest((ctx: any, callback: (e?: Error | null) => void) => {
        // Deliberately never call `callback()` here: we take over the
        // entire request/response lifecycle ourselves below, which is
        // what lets us hold a request in memory for editing.
        this.handleExchange(ctx).catch((err) => {
          this.emit("log", `[handleExchange] ${err?.message || err}`);
          try {
            if (!ctx.proxyToClientResponse.headersSent) {
              ctx.proxyToClientResponse.writeHead(502, { "content-type": "text/plain" });
            }
            ctx.proxyToClientResponse.end(`Wraith proxy error: ${err?.message || err}`);
          } catch {
            /* client already gone */
          }
        });
        void callback;
      });

      proxy.onWebSocketConnection((ctx: any, callback: (e?: Error | null) => void) => {
        this.emit("log", `[ws] connection opened: ${ctx.clientToProxyWebSocket?.url || ctx.connectRequest?.url || "?"}`);
        callback();
      });

      proxy.onWebSocketFrame(
        (_ctx: any, _type: string, fromServer: boolean, data: any, flags: any, callback: (e?: Error | null, message?: any, flags?: any) => void) => {
          const preview = typeof data === "string" ? data : Buffer.isBuffer(data) ? `<${data.length} bytes binary>` : String(data);
          this.emit("log", `[ws ${fromServer ? "←" : "→"}] ${preview.slice(0, 300)}`);
          callback(null, data, flags);
        }
      );

      checkPortAvailable(settings.port, settings.host)
        .then(() => {
          proxy.listen(
            { port: settings.port, host: settings.host, sslCaDir: sslCaDir() },
            (err?: Error | null) => {
              if (err) {
                reject(err);
                return;
              }
              this.running = true;
              this.emit("started", settings.port, settings.host);
              resolve();
            }
          );
        })
        .catch(reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Any request currently held waiting on a human decision gets
      // auto-forwarded so it doesn't hang forever once we shut down.
      for (const resolver of this.pending.values()) {
        resolver({ id: "", action: "forward" });
      }
      this.pending.clear();
      if (this.proxy && this.running) {
        this.proxy.close();
      }
      this.running = false;
      this.emit("stopped");
      resolve();
    });
  }

  resolveIntercept(resolution: InterceptResolution): boolean {
    const resolver = this.pending.get(resolution.id);
    if (!resolver) return false;
    this.pending.delete(resolution.id);
    resolver(resolution);
    return true;
  }

  /** Auto-forwards every currently held request/response (Burp's "Forward all"). */
  forwardAll(): number {
    const count = this.pending.size;
    for (const [id, resolver] of this.pending) {
      resolver({ id, action: "forward" });
    }
    this.pending.clear();
    return count;
  }

  private waitForDecision(pending: InterceptPending): Promise<InterceptResolution> {
    return new Promise((resolve) => {
      this.pending.set(pending.id, resolve);
      this.emit("intercept:pending", pending);
    });
  }

  private async handleExchange(ctx: any): Promise<void> {
    const settings = this.settingsProvider();
    const reqOptions = ctx.proxyToServerRequestOptions;
    const isSSL: boolean = !!ctx.isSSL;
    const host: string = reqOptions.host;
    const port = reqOptions.port;
    const fullUrl = buildUrl(isSSL, host, port, reqOptions.path);

    const hardCap = Math.max(settings.maxBodyCaptureBytes, 1024 * 1024);
    const bodyBuf = await readClientBody(ctx.clientToProxyRequest, hardCap);

    let request: CapturedRequest = {
      method: reqOptions.method,
      url: fullUrl,
      httpVersion: ctx.clientToProxyRequest.httpVersion || "1.1",
      headers: stringifyHeaders(reqOptions.headers),
      body: bodyBuf.toString("base64"),
    };

    const exchangeId = randomUUID();
    const exchange: Exchange = {
      id: exchangeId,
      protocol: isSSL ? "https" : "http",
      host,
      port: Number(port) || (isSSL ? 443 : 80),
      isSSL,
      request,
      response: null,
      tags: detectTags(request, null),
      startedAt: Date.now(),
      finishedAt: null,
      fromTool: "proxy",
    };

    const inScope = matchesScope(fullUrl, host, settings.interceptScope);

    if (settings.interceptRequests && inScope) {
      const decision = await this.waitForDecision({
        id: randomUUID(),
        exchangeId,
        direction: "request",
        host,
        isSSL,
        request,
      });
      if (decision.action === "drop") {
        exchange.dropped = true;
        exchange.finishedAt = Date.now();
        this.emit("exchange:new", exchange);
        ctx.proxyToClientResponse.writeHead(502, { "content-type": "text/plain" });
        ctx.proxyToClientResponse.end("Request dropped in Wraith Intercept.");
        return;
      }
      if (decision.edited?.request) {
        request = { ...request, ...decision.edited.request } as CapturedRequest;
        exchange.request = request;
        exchange.tags = detectTags(request, null);
      }
    }

    this.emit("exchange:new", exchange);

    const willInterceptResponse = settings.interceptResponses && inScope;
    let headersWritten = false;

    try {
      const result = await sendHttpRequest({
        method: request.method,
        url: request.url,
        headers: stringifyHeaders(request.headers),
        body: Buffer.from(request.body, "base64"),
        insecure: settings.allowInsecureUpstream,
        maxCaptureBytes: settings.maxBodyCaptureBytes,
        onHeaders: (statusCode, _statusMessage, headers) => {
          if (!willInterceptResponse) {
            ctx.proxyToClientResponse.writeHead(statusCode, cleanHeadersForWrite(headers));
            headersWritten = true;
          }
        },
        onChunk: (chunk) => {
          if (!willInterceptResponse) {
            ctx.proxyToClientResponse.write(chunk);
          }
        },
      });

      let response: CapturedResponse = result.response;

      if (willInterceptResponse) {
        const decision = await this.waitForDecision({
          id: randomUUID(),
          exchangeId,
          direction: "response",
          host,
          isSSL,
          request,
          response,
        });
        if (decision.action === "drop") {
          response = { statusCode: 502, statusMessage: "Dropped", headers: { "content-type": "text/plain" }, body: Buffer.from("Response dropped in Wraith Intercept.").toString("base64"), bodyTruncated: false, timeMs: response.timeMs };
        } else if (decision.edited?.response) {
          response = { ...response, ...decision.edited.response } as CapturedResponse;
        }
        ctx.proxyToClientResponse.writeHead(response.statusCode, cleanHeadersForWrite(response.headers));
        ctx.proxyToClientResponse.end(Buffer.from(response.body, "base64"));
      } else {
        if (!headersWritten) {
          ctx.proxyToClientResponse.writeHead(response.statusCode, cleanHeadersForWrite(response.headers));
        }
        ctx.proxyToClientResponse.end();
      }

      exchange.response = response;
      exchange.tags = detectTags(request, response);
      exchange.finishedAt = Date.now();
      this.emit("exchange:update", exchange.id, {
        response: exchange.response,
        tags: exchange.tags,
        finishedAt: exchange.finishedAt,
      });
    } catch (err: any) {
      const response: CapturedResponse = {
        statusCode: 0,
        statusMessage: "Connection failed",
        headers: {},
        body: Buffer.from(String(err?.message || err)).toString("base64"),
        bodyTruncated: false,
        timeMs: Date.now() - exchange.startedAt,
      };
      exchange.response = response;
      exchange.finishedAt = Date.now();
      this.emit("exchange:update", exchange.id, { response, finishedAt: exchange.finishedAt });
      try {
        if (!ctx.proxyToClientResponse.headersSent) {
          ctx.proxyToClientResponse.writeHead(502, { "content-type": "text/plain" });
        }
        ctx.proxyToClientResponse.end(`Wraith: upstream request failed — ${err?.message || err}`);
      } catch {
        /* client already gone */
      }
    }
  }
}
