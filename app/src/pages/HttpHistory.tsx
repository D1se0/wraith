import { useEffect, useMemo, useState } from "react";
import { Exchange, HighlightRule } from "../../electron/types";
import { StatusBadge, MethodBadge } from "../components/StatusBadge";
import { TagPills, firstMatchColor } from "../components/TagPills";
import { ResponseViewer } from "../components/ResponseViewer";
import { base64ToUtf8, base64ToBytes, formatBytes, isLikelyBinary } from "../lib/base64";
import { prettyPrintMaybeJson, headersToText } from "../lib/format";
import { IconStar, IconSend, IconTrash, IconDownload } from "../lib/icons";
import { useApp } from "../context/AppContext";

export function HttpHistory() {
  const { sendToRepeater, toast } = useApp();
  const [items, setItems] = useState<Exchange[]>([]);
  const [rules, setRules] = useState<HighlightRule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
          <button className="btn btn-danger btn-sm" onClick={clear}>
            <IconTrash size={13} /> Clear
          </button>
        </div>
      </div>

      <div className="split" style={{ flex: 1, minHeight: 0 }}>
        <div className="table-scroll">
          <table className="data-table">
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
                        <TagPills tags={e.tags} rules={rules} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ overflow: "auto" }}>
          {!selected ? (
            <div className="empty-state muted">Select a request to view details</div>
          ) : (
            <div className="stack">
              <div className="row between">
                <div className="panel-title mono" style={{ wordBreak: "break-all" }}>
                  {selected.request.method} {selected.request.url}
                </div>
                <button className="btn btn-sm" onClick={sendSelectedToRepeater}>
                  <IconSend size={12} /> Repeater
                </button>
              </div>
              <div className="tabs">
                <span className="tab-btn active">Request</span>
              </div>
              <RequestBody exchange={selected} />
              <hr className="divider" />
              <div className="panel-title">Response</div>
              <ResponseViewer response={selected.response} loading={!selected.response && !selected.dropped} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
