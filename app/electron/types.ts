/**
 * Shared type contract between the Electron main process and the React renderer.
 * The renderer talks to these shapes exclusively through `window.wraith` (see preload.ts).
 */

export type ExchangeProtocol = "http" | "https" | "ws" | "wss";

export interface HttpMessageHeaders {
  [key: string]: string | string[] | undefined;
}

export interface CapturedRequest {
  method: string;
  url: string; // full absolute URL
  httpVersion: string;
  headers: HttpMessageHeaders;
  body: string; // base64 encoded raw bytes ("" if none)
}

export interface CapturedResponse {
  statusCode: number;
  statusMessage: string;
  headers: HttpMessageHeaders;
  body: string; // base64 encoded raw bytes ("" if none)
  bodyTruncated: boolean;
  timeMs: number;
}

export type ExchangeTag =
  | "json"
  | "graphql"
  | "html"
  | "xml"
  | "js"
  | "css"
  | "image"
  | "auth"
  | "cookie"
  | "form"
  | "error"
  | "websocket";

export interface Exchange {
  id: string;
  protocol: ExchangeProtocol;
  host: string;
  port: number;
  isSSL: boolean;
  request: CapturedRequest;
  response: CapturedResponse | null;
  tags: ExchangeTag[];
  startedAt: number;
  finishedAt: number | null;
  fromTool?: "proxy" | "repeater" | "crawler";
  note?: string;
  starred?: boolean;
  dropped?: boolean;
}

export type InterceptDirection = "request" | "response";

export interface InterceptPending {
  id: string;
  exchangeId: string;
  direction: InterceptDirection;
  host: string;
  isSSL: boolean;
  request: CapturedRequest;
  response?: CapturedResponse;
}

export interface InterceptResolution {
  id: string;
  action: "forward" | "drop";
  edited?: {
    request?: Partial<CapturedRequest>;
    response?: Partial<CapturedResponse>;
  };
}

export interface HighlightRule {
  id: string;
  label: string;
  enabled: boolean;
  color: string; // css color token
  matchTag?: ExchangeTag;
  matchRegex?: string; // matched against method+url+headers+body
  matchScope: "any" | "request" | "response";
}

export interface ScopeRule {
  id: string;
  pattern: string; // glob-ish / substring / regex (prefixed with re:)
  enabled: boolean;
}

export interface ProxySettings {
  port: number;
  host: string;
  interceptRequests: boolean;
  interceptResponses: boolean;
  interceptScope: ScopeRule[]; // if empty -> intercept everything
  upstreamProxy?: string; // optional chained proxy host:port
  allowInsecureUpstream: boolean; // rejectUnauthorized:false for backend TLS
  maxBodyCaptureBytes: number;
}

export interface WraithSettings {
  proxy: ProxySettings;
  highlightRules: HighlightRule[];
  theme: "wraith-dark";
  firstRunComplete: boolean;
}

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  family: "IPv4" | "IPv6";
  internal: boolean;
}

export interface CurlOption {
  flag: string;
  value?: string;
}

export interface CurlRunRequest {
  url: string;
  method: string;
  headers: { key: string; value: string }[];
  data?: string;
  dataIsFile?: boolean;
  followRedirects: boolean;
  insecure: boolean;
  includeHeadersInOutput: boolean;
  verbose: boolean;
  userAgent?: string;
  cookie?: string;
  authUser?: string;
  authPass?: string;
  proxy?: string;
  timeoutSeconds?: number;
  extraArgs?: string;
  outputMode: "raw" | "render-html";
}

export interface CurlRunResult {
  argv: string[];
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  headers: string;
  bodyBase64: string;
  contentType: string | null;
  error?: string;
}

export type CrackerTool = "john" | "hashcat";

export interface CrackerJobRequest {
  tool: CrackerTool;
  hashFile: string;
  wordlistFile?: string;
  hashcatMode?: string;
  johnFormat?: string;
  rulesEnabled?: boolean;
  extraArgs?: string;
  attackMode?: "wordlist" | "bruteforce" | "mask";
  mask?: string;
}

export interface CrackerJobEvent {
  jobId: string;
  type: "stdout" | "stderr" | "status" | "done" | "error" | "cracked";
  data: string;
}

export interface CaptureStartRequest {
  interfaceName: string;
  bpfFilter?: string;
}

export interface CapturedPacketSummary {
  id: number;
  time: string;
  source: string;
  destination: string;
  protocol: string;
  length: number;
  info: string;
  raw?: any;
}

export interface CrawlerRequest {
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  scopeHost: boolean;
  followSubdomains: boolean;
  respectRobots: boolean;
  techniques: {
    forms: boolean;
    jsFiles: boolean;
    comments: boolean;
    sitemapXml: boolean;
    robotsTxt: boolean;
    commonPaths: boolean;
  };
}

export interface CrawlerEvent {
  jobId: string;
  type: "found" | "progress" | "done" | "error";
  url?: string;
  status?: number;
  contentType?: string;
  depth?: number;
  discovered?: number;
  visited?: number;
  message?: string;
}

export interface DiscoveredCertInfo {
  caCertPath: string;
  caCertPem: string;
  fingerprintSha256: string;
}

export type CodecOp =
  | "base64-encode"
  | "base64-decode"
  | "url-encode"
  | "url-decode"
  | "hex-encode"
  | "hex-decode"
  | "html-entities-encode"
  | "html-entities-decode"
  | "jwt-decode"
  | "gzip-decode"
  | "gzip-encode"
  | "md5"
  | "sha1"
  | "sha256"
  | "unicode-escape"
  | "unicode-unescape";

export interface CodecRequest {
  op: CodecOp;
  input: string;
}

export interface CodecResult {
  output: string;
  error?: string;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  host: string;
}
