import { useEffect, useState } from "react";
import { CrawlerRequest } from "../../electron/types";
import { StatusBadge } from "../components/StatusBadge";
import { IconPlay, IconStop, IconExternal, IconSend } from "../lib/icons";
import { useApp } from "../context/AppContext";

interface FoundRow {
  url: string;
  status?: number;
  contentType?: string;
  depth?: number;
}

const TECHNIQUES: { key: keyof CrawlerRequest["techniques"]; label: string; hint: string }[] = [
  { key: "forms", label: "Forms", hint: "Follow <form action> targets" },
  { key: "jsFiles", label: "JS files", hint: "Queue <script src> for review" },
  { key: "comments", label: "HTML comments", hint: "Pull URLs out of <!-- --> comments" },
  { key: "sitemapXml", label: "sitemap.xml", hint: "Seed from /sitemap.xml <loc> entries" },
  { key: "robotsTxt", label: "robots.txt", hint: "Seed from /robots.txt" },
  { key: "commonPaths", label: "Common paths", hint: "Probe /admin, /.git/HEAD, /.env, /graphql, wp-login.php…" },
];

export function Crawler() {
  const { sendToRepeater, toast } = useApp();
  const [startUrl, setStartUrl] = useState("https://");
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxPages, setMaxPages] = useState(100);
  const [concurrency, setConcurrency] = useState(5);
  const [scopeHost, setScopeHost] = useState(true);
  const [followSubdomains, setFollowSubdomains] = useState(false);
  const [techniques, setTechniques] = useState<CrawlerRequest["techniques"]>({
    forms: true,
    jsFiles: true,
    comments: true,
    sitemapXml: true,
    robotsTxt: true,
    commonPaths: true,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [rows, setRows] = useState<FoundRow[]>([]);
  const [stats, setStats] = useState({ visited: 0, discovered: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const off = window.wraith.crawler.onEvent((evt) => {
      if (evt.jobId !== jobId) return;
      if (evt.type === "found") setRows((cur) => [...cur, { url: evt.url!, status: evt.status, contentType: evt.contentType, depth: evt.depth }]);
      if (evt.type === "progress") setStats({ visited: evt.visited || 0, discovered: evt.discovered || 0 });
      if (evt.type === "error" && evt.message) setErrors((cur) => [...cur.slice(-30), evt.message!]);
      if (evt.type === "done") setJobId(null);
    });
    return off;
  }, [jobId]);

  const start = async () => {
    setRows([]);
    setErrors([]);
    setStats({ visited: 0, discovered: 0 });
    const req: CrawlerRequest = { startUrl, maxDepth, maxPages, concurrency, scopeHost, followSubdomains, respectRobots: false, techniques };
    const res = await window.wraith.crawler.start(req);
    setJobId(res.jobId);
  };

  const stop = async () => {
    if (jobId) await window.wraith.crawler.stop(jobId);
    setJobId(null);
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Crawler</h1>
        <p className="page-sub">Automatic site discovery — pick your techniques, set the scope, go.</p>
      </div>

      <div className="panel stack">
        <div className="row">
          <input type="text" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://target.example.com" style={{ flex: 1, fontFamily: "var(--font-mono)" }} />
          {jobId ? (
            <button className="btn btn-danger" onClick={stop}>
              <IconStop size={13} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start} disabled={!startUrl.startsWith("http")}>
              <IconPlay size={13} /> Start crawl
            </button>
          )}
        </div>

        <div className="grid-3">
          <div className="field">
            <label>Max depth</label>
            <input type="number" value={maxDepth} min={0} onChange={(e) => setMaxDepth(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Max pages</label>
            <input type="number" value={maxPages} min={1} onChange={(e) => setMaxPages(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Concurrency</label>
            <input type="number" value={concurrency} min={1} max={20} onChange={(e) => setConcurrency(Number(e.target.value))} />
          </div>
        </div>

        <div className="row wrap" style={{ gap: 16 }}>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={scopeHost} onChange={(e) => setScopeHost(e.target.checked)} />
            Stay on this host
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={followSubdomains} onChange={(e) => setFollowSubdomains(e.target.checked)} disabled={!scopeHost} />
            Include subdomains
          </label>
        </div>

        <div className="field">
          <label>Discovery techniques</label>
          <div className="grid-2">
            {TECHNIQUES.map((t) => (
              <label key={t.key} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={techniques[t.key]}
                  onChange={(e) => setTechniques((cur) => ({ ...cur, [t.key]: e.target.checked }))}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <b>{t.label}</b> <span className="faint">— {t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="row muted">
          {jobId ? "crawling…" : "idle"} · visited {stats.visited} · discovered {stats.discovered}
        </div>
      </div>

      <div className="panel">
        <div className="table-scroll" style={{ maxHeight: 420 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>URL</th>
                <th>Content-Type</th>
                <th>Depth</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No results yet.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <StatusBadge code={r.status} />
                  </td>
                  <td className="mono" style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.url}>
                    {r.url}
                  </td>
                  <td className="muted">{r.contentType?.split(";")[0]}</td>
                  <td className="muted">{r.depth}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-ghost btn-icon" title="Open externally" onClick={() => window.wraith.app.openExternal(r.url)}>
                        <IconExternal size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        title="Send to Repeater"
                        onClick={() => {
                          sendToRepeater({ method: "GET", url: r.url, headers: [{ key: "User-Agent", value: "Wraith/1.0" }], body: "" });
                          toast("Sent to Repeater");
                        }}
                      >
                        <IconSend size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="muted" style={{ cursor: "pointer" }}>
              Errors ({errors.length})
            </summary>
            <pre className="codebox">{errors.join("\n")}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
