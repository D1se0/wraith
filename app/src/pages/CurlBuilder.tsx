import { useMemo, useState } from "react";
import { CurlRunRequest, CurlRunResult } from "../../electron/types";
import { KeyValueEditor, KV } from "../components/KeyValueEditor";
import { base64ToUtf8 } from "../lib/base64";
import { prettyPrintMaybeJson, copyToClipboard } from "../lib/format";
import { IconPlay, IconCopy } from "../lib/icons";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function previewCurlCommand(req: CurlRunRequest): string {
  const parts = ["curl", "-s", "-S", "-X", req.method];
  if (req.followRedirects) parts.push("-L");
  if (req.insecure) parts.push("-k");
  if (req.verbose) parts.push("-v");
  if (req.userAgent) parts.push("-A", quote(req.userAgent));
  if (req.cookie) parts.push("-b", quote(req.cookie));
  if (req.authUser) parts.push("-u", quote(req.authUser + (req.authPass ? ":" + req.authPass : "")));
  if (req.proxy) parts.push("-x", quote(req.proxy));
  if (req.timeoutSeconds) parts.push("--max-time", String(req.timeoutSeconds));
  for (const h of req.headers) if (h.key.trim()) parts.push("-H", quote(`${h.key}: ${h.value}`));
  if (req.data) parts.push("--data-raw", quote(req.data));
  if (req.extraArgs) parts.push(req.extraArgs);
  parts.push(quote(req.url));
  return parts.join(" ");
}

function quote(s: string): string {
  return /[\s"']/.test(s) ? `'${s.replace(/'/g, `'\\''`)}'` : s;
}

export function CurlBuilder() {
  const [url, setUrl] = useState("https://");
  const [method, setMethod] = useState("GET");
  const [followRedirects, setFollowRedirects] = useState(true);
  const [insecure, setInsecure] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [headers, setHeaders] = useState<KV[]>([]);
  const [data, setData] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [cookie, setCookie] = useState("");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [proxy, setProxy] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState<number | "">("");
  const [extraArgs, setExtraArgs] = useState("");
  const [renderIfHtml, setRenderIfHtml] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CurlRunResult | null>(null);
  const [tab, setTab] = useState<"headers" | "body" | "render">("body");

  const req: CurlRunRequest = useMemo(
    () => ({
      url,
      method,
      headers,
      data: data || undefined,
      followRedirects,
      insecure,
      includeHeadersInOutput: true,
      verbose,
      userAgent: userAgent || undefined,
      cookie: cookie || undefined,
      authUser: authUser || undefined,
      authPass: authPass || undefined,
      proxy: proxy || undefined,
      timeoutSeconds: timeoutSeconds === "" ? undefined : Number(timeoutSeconds),
      extraArgs: extraArgs || undefined,
      outputMode: renderIfHtml ? "render-html" : "raw",
    }),
    [url, method, headers, data, followRedirects, insecure, verbose, userAgent, cookie, authUser, authPass, proxy, timeoutSeconds, extraArgs, renderIfHtml]
  );

  const preview = useMemo(() => previewCurlCommand(req), [req]);

  const setContentType = (ct: string, sample?: string) => {
    const next = headers.filter((h) => h.key.toLowerCase() !== "content-type");
    next.push({ key: "Content-Type", value: ct });
    setHeaders(next);
    if (sample !== undefined && !data) setData(sample);
  };

  const formatJson = () => {
    const pretty = prettyPrintMaybeJson(data);
    if (pretty.isJson) setData(pretty.pretty);
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await window.wraith.curl.run(req);
      setResult(r);
      setTab(r.contentType?.includes("html") && renderIfHtml ? "render" : "body");
    } finally {
      setRunning(false);
    }
  };

  const bodyText = result ? base64ToUtf8(result.bodyBase64) : "";
  const pretty = prettyPrintMaybeJson(bodyText);
  const isHtml = result?.contentType?.includes("html");

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">cURL Builder</h1>
        <p className="page-sub">Every flag is a button. See the exact command before you run it.</p>
      </div>

      <div className="panel stack">
        <div className="row" style={{ gap: 8 }}>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: 120, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://target.example.com/path" style={{ fontFamily: "var(--font-mono)" }} />
          <button className="btn btn-primary" onClick={run} disabled={running}>
            <IconPlay size={13} /> {running ? "Running…" : "Execute"}
          </button>
        </div>

        <div className="row wrap" style={{ gap: 8 }}>
          <button className={`chip ${followRedirects ? "active" : ""}`} onClick={() => setFollowRedirects((v) => !v)}>
            -L Follow redirects
          </button>
          <button className={`chip ${insecure ? "active" : ""}`} onClick={() => setInsecure((v) => !v)}>
            -k Insecure
          </button>
          <button className={`chip ${verbose ? "active" : ""}`} onClick={() => setVerbose((v) => !v)}>
            -v Verbose
          </button>
          <button className={`chip ${renderIfHtml ? "active" : ""}`} onClick={() => setRenderIfHtml((v) => !v)}>
            Render if HTML
          </button>
        </div>

        <div className="field">
          <label>Headers</label>
          <KeyValueEditor rows={headers} onChange={setHeaders} />
        </div>

        <div className="field">
          <div className="row between">
            <label>Body</label>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setContentType("application/json", "{\n  \n}")}>
                JSON
              </button>
              <button className="btn btn-sm" onClick={() => setContentType("application/x-www-form-urlencoded", "key=value")}>
                Form
              </button>
              <button className="btn btn-sm" onClick={() => setContentType("text/plain")}>
                Text
              </button>
              <button className="btn btn-sm" onClick={formatJson}>
                Format JSON
              </button>
            </div>
          </div>
          <textarea rows={6} value={data} onChange={(e) => setData(e.target.value)} placeholder="(no body)" />
        </div>

        <details open={showMore} onToggle={(e) => setShowMore((e.target as HTMLDetailsElement).open)}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            More options
          </summary>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div className="field">
              <label>User-Agent</label>
              <input type="text" value={userAgent} onChange={(e) => setUserAgent(e.target.value)} />
            </div>
            <div className="field">
              <label>Cookie</label>
              <input type="text" value={cookie} onChange={(e) => setCookie(e.target.value)} placeholder="name=value; other=value" />
            </div>
            <div className="field">
              <label>Basic auth user</label>
              <input type="text" value={authUser} onChange={(e) => setAuthUser(e.target.value)} />
            </div>
            <div className="field">
              <label>Basic auth password</label>
              <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} />
            </div>
            <div className="field">
              <label>Proxy (host:port)</label>
              <input type="text" value={proxy} onChange={(e) => setProxy(e.target.value)} />
            </div>
            <div className="field">
              <label>Timeout (seconds)</label>
              <input type="number" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Extra arguments</label>
            <input type="text" value={extraArgs} onChange={(e) => setExtraArgs(e.target.value)} placeholder="--compressed --http1.1 …" />
          </div>
        </details>

        <div className="row between">
          <code className="mono faint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {preview}
          </code>
          <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(preview)}>
            <IconCopy size={12} />
          </button>
        </div>
      </div>

      {result && (
        <div className="panel">
          <div className="row wrap" style={{ gap: 14 }}>
            <span>
              exit code <b>{result.exitCode ?? "—"}</b>
            </span>
            <span className="muted">{result.durationMs} ms</span>
            {result.contentType && <span className="muted">{result.contentType}</span>}
            {result.error && <span className="badge badge-5xx">{result.error}</span>}
          </div>
          <div className="tabs">
            <button className={`tab-btn ${tab === "headers" ? "active" : ""}`} onClick={() => setTab("headers")}>
              Headers
            </button>
            <button className={`tab-btn ${tab === "body" ? "active" : ""}`} onClick={() => setTab("body")}>
              Body (raw)
            </button>
            {isHtml && (
              <button className={`tab-btn ${tab === "render" ? "active" : ""}`} onClick={() => setTab("render")}>
                Body (rendered)
              </button>
            )}
          </div>
          {tab === "headers" && <pre className="codebox">{result.headers || "(no headers captured)"}</pre>}
          {tab === "body" && <pre className="codebox">{pretty.pretty || "(empty body)"}</pre>}
          {tab === "render" && isHtml && (
            <iframe title="curl-render" sandbox="" srcDoc={bodyText} style={{ width: "100%", height: 460, border: "none", borderRadius: 12, background: "#fff" }} />
          )}
          {result.stderr && (
            <details style={{ marginTop: 10 }}>
              <summary className="muted" style={{ cursor: "pointer" }}>
                stderr / verbose log
              </summary>
              <pre className="codebox">{result.stderr}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
