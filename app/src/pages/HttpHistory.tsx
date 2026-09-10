import { useEffect, useMemo, useRef, useState } from "react";
import { Exchange, HighlightRule } from "../../electron/types";
import { StatusBadge, MethodBadge } from "../components/StatusBadge";
import { TagPills, firstMatchColor } from "../components/TagPills";
import { ResponseViewer } from "../components/ResponseViewer";
import { base64ToUtf8, base64ToBytes, formatBytes, isLikelyBinary } from "../lib/base64";
import { prettyPrintMaybeJson, headersToText } from "../lib/format";
import { IconStar, IconSend, IconTrash, IconDownload, IconFlag, IconCompare, IconUpload, IconUsers, IconZap, IconRace, IconList } from "../lib/icons";
import { useApp } from "../context/AppContext";
import { AskClaudeButton } from "../components/AskClaude";
import { ExportCodeButton } from "../components/ExportCode";
import { Finding, Identity } from "../../electron/types";
import { exchangesToHar, harToExchanges } from "../lib/har";

export function HttpHistory() {
  const { sendToRepeater, sendToComparer, sendToFuzzer, sendToRace, toast } = useApp();
  const [items, setItems] = useState<Exchange[]>([]);
  const [rules, setRules] = useState<HighlightRule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [findingsByExchange, setFindingsByExchange] = useState<Record<string, Finding[]>>({});
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [replayMenuOpen, setReplayMenuOpen] = useState(false);
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem("wraith:historyCompact") === "1";
    } catch {
      return false;
    }
  });
  const toggleCompact = () => {
    setCompact((v) => {
      const next = !v;
      try {
        localStorage.setItem("wraith:historyCompact", next ? "1" : "0");
      } catch {
        /* private-window localStorage can throw; the toggle still works for this session */
      }
      return next;
    });
  };

  const [splitPct, setSplitPct] = useState(() => {
    try {
      return Number(localStorage.getItem("wraith:historySplitPct")) || 45;
    } catch {
      return 45;
    }
  });
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(75, Math.max(25, pct)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setSplitPct((p) => {
        try {
          localStorage.setItem("wraith:historySplitPct", String(Math.round(p)));
        } catch {
          /* private-window localStorage can throw; the resize still works for this session */
        }
        return p;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    window.wraith.identities.list().then(setIdentities);
  }, []);

  useEffect(() => {
    window.wraith.history.list().then(setItems);
    window.wraith.settings.get().then((s) => setRules(s.highlightRules));

    const offNew = window.wraith.proxy.onExchangeNew((ex) => setItems((cur) => [...cur, ex]));
    const offUpdate = window.wraith.proxy.onExchangeUpdate(({ id, patch }) =>
      setItems((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    );
    return () => {
      offNew();
      offUpdate();
    };
  }, []);

  const groupFindings = (list: Finding[]) => {
    const map: Record<string, Finding[]> = {};
    for (const f of list) {
      if (!f.exchangeId) continue;
      (map[f.exchangeId] ||= []).push(f);
    }
    setFindingsByExchange(map);
  };

  useEffect(() => {
    window.wraith.findings.list().then(groupFindings);
    const off = window.wraith.findings.onNew((f) => {
      if (!f.exchangeId) return;
      setFindingsByExchange((cur) => ({ ...cur, [f.exchangeId!]: [...(cur[f.exchangeId!] || []), f] }));
    });
    return off;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) =>
      [e.request.method, e.request.url, String(e.response?.statusCode || ""), ...e.tags].join(" ").toLowerCase().includes(q)
    );
  }, [items, search]);

  const selected = items.find((e) => e.id === selectedId) || null;

  const clear = () => {
    if (!confirm("Clear all HTTP history?")) return;
    window.wraith.history.clear();
    setItems([]);
    setSelectedId(null);
  };

  const toggleStar = (e: Exchange) => {
    window.wraith.history.update(e.id, { starred: !e.starred });
    setItems((cur) => cur.map((x) => (x.id === e.id ? { ...x, starred: !x.starred } : x)));
  };

  const sendSelectedToRepeater = () => {
    if (!selected) return;
    sendToRepeater({
      method: selected.request.method,
      url: selected.request.url,
      headers: Object.entries(selected.request.headers).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) })),
      body: base64ToUtf8(selected.request.body),
    });
    toast("Sent to Repeater");
  };

  const replayAs = (identity: Identity) => {
    if (!selected) return;
    const headers = Object.entries(selected.request.headers).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) }));
    for (const h of identity.headers) {
      if (!h.key.trim()) continue;
      const idx = headers.findIndex((x) => x.key.toLowerCase() === h.key.toLowerCase());
      if (idx >= 0) headers[idx] = { key: headers[idx].key, value: h.value };
      else headers.push({ key: h.key, value: h.value });
    }
    sendToRepeater(
      { method: selected.request.method, url: selected.request.url, headers, body: base64ToUtf8(selected.request.body) },
      `${identity.name} · ${safeHostnameForLabel(selected.request.url)}`
    );
    setReplayMenuOpen(false);
    toast(`Sent to Repeater as "${identity.name}"`);
  };

  const exportRows = () =>
    filtered.map((e) => ({
      id: e.id,
      method: e.request.method,
      url: e.request.url,
      host: e.host,
      port: e.port,
      isSSL: e.isSSL,
      statusCode: e.dropped ? "dropped" : e.response?.statusCode ?? "",
      statusMessage: e.response?.statusMessage ?? "",
      sizeBytes: e.response ? base64ToBytes(e.response.body).length : 0,
      timeMs: e.response?.timeMs ?? (e.finishedAt ? e.finishedAt - e.startedAt : ""),
      tags: e.tags.join(";"),
      startedAt: new Date(e.startedAt).toISOString(),
      finishedAt: e.finishedAt ? new Date(e.finishedAt).toISOString() : "",
      starred: !!e.starred,
      fromTool: e.fromTool ?? "proxy",
    }));

  const exportJson = async () => {
    const path = await window.wraith.app.chooseSaveFile("wraith-history.json");
    if (!path) return;
    try {
      await window.wraith.app.writeFile({ path, content: JSON.stringify(exportRows(), null, 2), encoding: "utf-8" });
      toast(`Exported ${filtered.length} exchange(s) to ${path}`);
    } catch (err: any) {
      toast(`Export failed: ${err?.message || err}`, "error");
    }
  };

  const exportHar = async () => {
    const path = await window.wraith.app.chooseSaveFile("wraith-history.har");
    if (!path) return;
    try {
      await window.wraith.app.writeFile({ path, content: JSON.stringify(exchangesToHar(filtered), null, 2), encoding: "utf-8" });
      toast(`Exported ${filtered.length} exchange(s) to ${path}`);
    } catch (err: any) {
      toast(`Export failed: ${err?.message || err}`, "error");
    }
  };

  const harInputRef = useRef<HTMLInputElement | null>(null);
  const importHar = async (file: File) => {
    try {
      const text = await file.text();
      const har = JSON.parse(text);
      const parsed = harToExchanges(har);
      if (parsed.length === 0) {
        toast("No entries found in that HAR file", "error");
        return;
      }
      const imported = await window.wraith.history.import(parsed as Exchange[]);
      setItems((cur) => [...cur, ...imported]);
      toast(`Imported ${imported.length} exchange(s) from HAR`);
    } catch (err: any) {
      toast(`Import failed: ${err?.message || err}`, "error");
    }
  };

  const csvCell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

  const exportCsv = async () => {
    const path = await window.wraith.app.chooseSaveFile("wraith-history.csv");
    if (!path) return;
    try {
      const rows = exportRows();
      const headers = Object.keys(rows[0] || { id: "", method: "", url: "", host: "", port: "", isSSL: "", statusCode: "", statusMessage: "", sizeBytes: "", timeMs: "", tags: "", startedAt: "", finishedAt: "", starred: "", fromTool: "" });
      const lines = [headers.map(csvCell).join(","), ...rows.map((r) => headers.map((h) => csvCell((r as any)[h])).join(","))];
      await window.wraith.app.writeFile({ path, content: lines.join("\n"), encoding: "utf-8" });
      toast(`Exported ${filtered.length} exchange(s) to ${path}`);
    } catch (err: any) {
      toast(`Export failed: ${err?.message || err}`, "error");
    }
  };

  return (
    <div className="stack" style={{ height: "100%" }}>
      <div className="row between">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-sub">Everything that passed through the proxy, tagged and searchable.</p>
        </div>
        <div className="row">
          <input type="search" placeholder="Search method, url, status, tags…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
          <button className="btn btn-sm" onClick={exportCsv} disabled={filtered.length === 0} title="Export the currently-filtered list as CSV">
            <IconDownload size={13} /> CSV
          </button>
          <button className="btn btn-sm" onClick={exportJson} disabled={filtered.length === 0} title="Export the currently-filtered list as JSON">
            <IconDownload size={13} /> JSON
          </button>
          <button className="btn btn-sm" onClick={exportHar} disabled={filtered.length === 0} title="Export the currently-filtered list as a HAR file (readable by browser devtools, Burp, Postman, etc.)">
            <IconDownload size={13} /> HAR
          </button>
          <input
            ref={harInputRef}
            type="file"
            accept=".har,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importHar(file);
              e.target.value = "";
            }}
          />
          <button className="btn btn-sm" onClick={() => harInputRef.current?.click()} title="Import a HAR file into History">
            <IconUpload size={13} /> Import HAR
          </button>
          <button className={`btn btn-sm ${compact ? "btn-primary" : ""}`} onClick={toggleCompact} title="Toggle compact row density">
            <IconList size={13} /> Compact
          </button>
          <button className="btn btn-danger btn-sm" onClick={clear}>
            <IconTrash size={13} /> Clear
          </button>
        </div>
      </div>

      <div
        ref={splitContainerRef}
        style={{ display: "grid", gridTemplateColumns: `${splitPct}% 6px 1fr`, gap: 0, flex: 1, minHeight: 0 }}
      >
        <div className="table-scroll" style={{ marginRight: 8 }}>
          <table className={`data-table ${compact ? "compact" : ""}`}>
            <thead>
              <tr>
                <th></th>
                <th>Method</th>
                <th>Host / Path</th>
                <th>Status</th>
                <th>Size</th>
                <th>Time</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No traffic yet — browse through the proxy to see requests here.
                  </td>
                </tr>
              )}
              {filtered
                .slice()
                .reverse()
                .map((e) => {
                  const color = firstMatchColor(e.tags, rules);
                  let path = e.request.url;
                  try {
                    const u = new URL(e.request.url);
                    path = u.hostname + u.pathname + u.search;
                  } catch {
                    /* keep raw */
                  }
                  const bytes = e.response ? base64ToBytes(e.response.body).length : 0;
                  return (
                    <tr
                      key={e.id}
                      className={selectedId === e.id ? "selected" : ""}
                      style={{ borderLeftColor: color || "transparent" }}
                      onClick={() => setSelectedId(e.id)}
                    >
                      <td onClick={(ev) => { ev.stopPropagation(); toggleStar(e); }}>
                        <IconStar size={13} filled={!!e.starred} style={{ color: e.starred ? "var(--warn)" : "var(--text-faint)" }} />
                      </td>
                      <td>
                        <MethodBadge method={e.request.method} />
                      </td>
                      <td className="mono" title={e.request.url} style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {path}
                      </td>
                      <td>{e.dropped ? <span className="badge badge-4xx">dropped</span> : <StatusBadge code={e.response?.statusCode} />}</td>
                      <td className="muted">{formatBytes(bytes)}</td>
                      <td className="muted">{e.response?.timeMs ?? (e.finishedAt ? e.finishedAt - e.startedAt : "…")}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <TagPills tags={e.tags} rules={rules} />
                          {findingsByExchange[e.id]?.length > 0 && (
                            <span className="badge sev-medium" title={`${findingsByExchange[e.id].length} finding(s) flagged here`}>
                              <IconFlag size={10} /> {findingsByExchange[e.id].length}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div onMouseDown={startResize} style={{ cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center" }} title="Drag to resize">
          <div style={{ width: 3, height: 40, borderRadius: 2, background: "var(--panel-border)" }} />
        </div>

        <div className="panel" style={{ overflow: "auto", marginLeft: 8 }}>
          {!selected ? (
            <div className="empty-state muted">Select a request to view details</div>
          ) : (
            <div className="stack">
              <div className="row between">
                <div className="panel-title mono" style={{ wordBreak: "break-all" }}>
                  {selected.request.method} {selected.request.url}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm" onClick={sendSelectedToRepeater}>
                    <IconSend size={12} /> Repeater
                  </button>
                  <button className="btn btn-sm" onClick={() => sendToComparer(selected)} title="Send to Comparer (fills whichever slot is empty, A first)">
                    <IconCompare size={12} /> Compare
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      sendToFuzzer({
                        method: selected.request.method,
                        url: selected.request.url,
                        headers: Object.entries(selected.request.headers).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) })),
                        body: base64ToUtf8(selected.request.body),
                      })
                    }
                    title="Send to Fuzzer"
                  >
                    <IconZap size={12} /> Fuzzer
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      sendToRace({
                        method: selected.request.method,
                        url: selected.request.url,
                        headers: Object.entries(selected.request.headers).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) })),
                        body: base64ToUtf8(selected.request.body),
                      })
                    }
                    title="Send to Race"
                  >
                    <IconRace size={12} /> Race
                  </button>
                  <div style={{ position: "relative" }}>
                    <button className="btn btn-sm" onClick={() => setReplayMenuOpen((v) => !v)} disabled={identities.length === 0} title={identities.length === 0 ? "Add an identity first (sidebar → Identities)" : "Replay this request with a different identity's auth headers"}>
                      <IconUsers size={12} /> Replay as…
                    </button>
                    {replayMenuOpen && identities.length > 0 && (
                      <div className="panel stack-sm" style={{ position: "absolute", top: "110%", right: 0, zIndex: 20, minWidth: 180, padding: 8 }}>
                        {identities.map((identity) => (
                          <button key={identity.id} className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start", borderLeft: `3px solid ${identity.color}` }} onClick={() => replayAs(identity)}>
                            {identity.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <AskClaudeButton context={() => exchangeContext(selected)} />
                  <ExportCodeButton exchange={selected} />
                </div>
              </div>
              <div className="tabs">
                <span className="tab-btn active">Request</span>
              </div>
              <RequestBody exchange={selected} />
              <hr className="divider" />
              <div className="panel-title">Response</div>
              <ResponseViewer response={selected.response} loading={!selected.response && !selected.dropped} />
              {findingsByExchange[selected.id]?.length > 0 && (
                <>
                  <hr className="divider" />
                  <div className="panel-title">Flagged on this request</div>
                  <div className="stack-sm">
                    {findingsByExchange[selected.id].map((f) => (
                      <div key={f.id} className="row" style={{ gap: 8 }}>
                        <span className={`badge sev-${f.severity}`}>{f.severity}</span>
                        <span>{f.title}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeHostnameForLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function exchangeContext(exchange: Exchange): string {
  const parts = [
    `${exchange.request.method} ${exchange.request.url}`,
    headersToText(exchange.request.headers),
    base64ToUtf8(exchange.request.body),
  ];
  if (exchange.response) {
    parts.push(
      "--- response ---",
      `HTTP ${exchange.response.statusCode} ${exchange.response.statusMessage}`,
      headersToText(exchange.response.headers),
      base64ToUtf8(exchange.response.body)
    );
  }
  return parts.filter(Boolean).join("\n");
}

function RequestBody({ exchange }: { exchange: Exchange }) {
  const text = base64ToUtf8(exchange.request.body);
  const bytes = base64ToBytes(exchange.request.body);
  const pretty = prettyPrintMaybeJson(text);
  return (
    <div className="stack-sm">
      <pre className="codebox">{headersToText(exchange.request.headers)}</pre>
      {bytes.length > 0 && (isLikelyBinary(bytes) ? <div className="muted">Binary body, {formatBytes(bytes.length)}</div> : <pre className="codebox">{pretty.pretty}</pre>)}
    </div>
  );
}
