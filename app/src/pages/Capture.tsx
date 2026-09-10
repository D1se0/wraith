import { useEffect, useMemo, useRef, useState } from "react";
import { CapturedPacketSummary, CaptureExportFormat } from "../../electron/types";
import { IconPlay, IconStop, IconWave, IconExternal, IconDownload } from "../lib/icons";

const PROTO_COLOR: Record<string, string> = {
  TCP: "var(--info)",
  UDP: "var(--warn)",
  TLS: "#c792ff",
  HTTP: "var(--accent-a)",
  DNS: "#4fd1c5",
  ICMP: "var(--danger)",
};

const FILTER_EXAMPLES: { filter: string; desc: string }[] = [
  { filter: "http", desc: "only HTTP traffic" },
  { filter: "http.request", desc: "only HTTP requests" },
  { filter: "http.response.code == 200", desc: "HTTP 200 responses" },
  { filter: "tcp.port == 443", desc: "traffic on port 443 (either direction)" },
  { filter: "tcp.port == 80 || tcp.port == 443", desc: "HTTP or HTTPS" },
  { filter: "ip.addr == 192.168.1.10", desc: "traffic to/from a specific host" },
  { filter: "ip.src == 10.0.0.5", desc: "traffic FROM a host" },
  { filter: "dns", desc: "DNS traffic" },
  { filter: "tls.handshake.type == 1", desc: "TLS ClientHello" },
  { filter: "tcp.flags.syn == 1 && tcp.flags.ack == 0", desc: "SYN packets (new connections)" },
  { filter: "tcp.analysis.retransmission", desc: "retransmitted TCP segments" },
  { filter: 'http.request.method == "POST"', desc: "POST requests only" },
  { filter: 'frame contains "password"', desc: "raw bytes contain a string" },
  { filter: "websocket", desc: "WebSocket traffic" },
];

const EXPORT_FORMATS: CaptureExportFormat[] = ["pcap", "pcapng", "json", "csv"];

export function Capture() {
  const [available, setAvailable] = useState<{ available: boolean; installHint: string } | null>(null);
  const [interfaces, setInterfaces] = useState<{ id: string; description: string }[]>([]);
  const [iface, setIface] = useState("");
  const [capFilter, setCapFilter] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [pcapPath, setPcapPath] = useState<string | null>(null);
  const [packets, setPackets] = useState<CapturedPacketSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState("");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const [displayFilterText, setDisplayFilterText] = useState("");
  const [filteredPackets, setFilteredPackets] = useState<CapturedPacketSummary[] | null>(null);
  const [applyingFilter, setApplyingFilter] = useState(false);
  const [exportOnlyFiltered, setExportOnlyFiltered] = useState(true);
  const [exporting, setExporting] = useState<CaptureExportFormat | null>(null);
  // See JwtTool.tsx's crackJobIdRef for why this is a ref: an event can in
  // principle arrive before React re-renders and re-subscribes a listener
  // that depends on `jobId` state, silently dropping it.
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    window.wraith.capture.checkAvailable().then(setAvailable);
    (async () => {
      const list: { id: string; description: string }[] = await window.wraith.capture.listInterfaces();
      setInterfaces(list);
      const settings = await window.wraith.settings.get();
      const preferred = settings.general.defaultCaptureInterface;
      if (preferred && list.some((i) => i.id === preferred)) setIface(preferred);
      else if (list.length > 0) setIface(list[0].id);
    })();
  }, []);

  useEffect(() => {
    const offPacket = window.wraith.capture.onPacket((p) => {
      if (p.jobId !== jobIdRef.current) return;
      setPackets((cur) => [...cur, p]);
    });
    const offLog = window.wraith.capture.onLog((l) => {
      if (l.jobId !== jobIdRef.current) return;
      setLogs((cur) => [...cur.slice(-100), l.line]);
    });
    const offClosed = window.wraith.capture.onClosed((c) => {
      if (c.jobId !== jobIdRef.current) return;
      jobIdRef.current = null;
      setJobId(null);
    });
    return () => {
      offPacket();
      offLog();
      offClosed();
    };
  }, []);

  const start = async () => {
    setPackets([]);
    setSelected(null);
    setFilteredPackets(null);
    setDisplayFilterText("");
    const res = await window.wraith.capture.start({ interfaceName: iface, bpfFilter: capFilter });
    jobIdRef.current = res.jobId;
    setJobId(res.jobId);
    setPcapPath(res.pcapPath);
  };

  const stop = async () => {
    if (jobId) await window.wraith.capture.stop(jobId);
    jobIdRef.current = null;
    setJobId(null);
  };

  const openDetail = async (id: number) => {
    setSelected(id);
    if (!pcapPath) return;
    setDetail("Loading…");
    const text = await window.wraith.capture.packetDetail(pcapPath, id);
    setDetail(text);
  };

  const applyDisplayFilter = async () => {
    if (!pcapPath) return;
    if (!displayFilterText.trim()) {
      setFilteredPackets(null);
      return;
    }
    setApplyingFilter(true);
    try {
      const result = await window.wraith.capture.applyFilter(pcapPath, displayFilterText);
      setFilteredPackets(result);
    } catch (err: any) {
      alert(`Filter error: ${err?.message || err}`);
    } finally {
      setApplyingFilter(false);
    }
  };

  const clearDisplayFilter = () => {
    setDisplayFilterText("");
    setFilteredPackets(null);
  };

  const doExport = async (format: CaptureExportFormat) => {
    if (!pcapPath) return;
    const destPath = await window.wraith.app.chooseSaveFile(`capture.${format}`);
    if (!destPath) return;
    setExporting(format);
    try {
      await window.wraith.capture.export({
        pcapPath,
        format,
        destPath,
        displayFilter: exportOnlyFiltered && displayFilterText.trim() ? displayFilterText : undefined,
      });
    } catch (err: any) {
      alert(`Export failed: ${err?.message || err}`);
    } finally {
      setExporting(null);
    }
  };

  const basePackets = filteredPackets ?? packets;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return basePackets;
    return basePackets.filter((p) => [p.source, p.destination, p.protocol, p.info].join(" ").toLowerCase().includes(q));
  }, [basePackets, search]);

  if (available && !available.available) {
    return (
      <div className="stack">
        <h1 className="page-title">Packet Capture</h1>
        <div className="panel empty-state">
          <IconWave size={28} />
          <div style={{ marginBottom: 10 }}>tshark isn't installed — Wraith uses it for live packet capture.</div>
          <pre className="codebox" style={{ display: "inline-block", textAlign: "left" }}>
            {available.installHint}
          </pre>
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => window.wraith.app.openExternal("https://www.wireshark.org/download.html")}>
              <IconExternal size={12} /> wireshark.org
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ height: "100%" }}>
      <div>
        <h1 className="page-title">Packet Capture</h1>
        <p className="page-sub">A focused, Wireshark-powered live packet view — without Wireshark's overwhelming default UI.</p>
      </div>

      <div className="panel">
        <div className="row wrap" style={{ gap: 10 }}>
          <select value={iface} onChange={(e) => setIface(e.target.value)} style={{ width: 220 }} disabled={!!jobId}>
            {interfaces.map((i) => (
              <option key={i.id} value={i.id}>
                {i.description}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Capture filter (BPF), e.g. tcp port 443"
            value={capFilter}
            onChange={(e) => setCapFilter(e.target.value)}
            disabled={!!jobId}
            style={{ width: 240 }}
          />
          {jobId ? (
            <button className="btn btn-danger" onClick={stop}>
              <IconStop size={13} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start} disabled={!iface}>
              <IconPlay size={13} /> Start capture
            </button>
          )}
          <input type="search" placeholder="Filter list…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 180, marginLeft: "auto" }} />
        </div>

        {pcapPath && (
          <>
            <hr className="divider" />
            <div className="row wrap" style={{ gap: 8 }}>
              <input
                type="text"
                placeholder='Display filter, e.g. tcp.port == 443 && http'
                value={displayFilterText}
                onChange={(e) => setDisplayFilterText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyDisplayFilter()}
                style={{ width: 300, fontFamily: "var(--font-mono)" }}
              />
              <button className="btn btn-sm" onClick={applyDisplayFilter} disabled={applyingFilter}>
                {applyingFilter ? "Applying…" : "Apply"}
              </button>
              {filteredPackets !== null && (
                <button className="btn btn-ghost btn-sm" onClick={clearDisplayFilter}>
                  Clear
                </button>
              )}
              {filteredPackets !== null && <span className="muted">{filteredPackets.length} match(es)</span>}

              <details style={{ marginLeft: 4 }}>
                <summary className="muted" style={{ cursor: "pointer" }}>
                  Filter cheat sheet
                </summary>
                <div className="stack-sm" style={{ marginTop: 8, maxWidth: 560 }}>
                  {FILTER_EXAMPLES.map((f) => (
                    <div key={f.filter} className="row wrap" style={{ gap: 8, cursor: "pointer" }} onClick={() => setDisplayFilterText(f.filter)}>
                      <code className="mono" style={{ color: "var(--accent-a)", flex: "0 0 260px" }}>
                        {f.filter}
                      </code>
                      <span className="muted">{f.desc}</span>
                    </div>
                  ))}
                </div>
              </details>

              <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={exportOnlyFiltered} onChange={(e) => setExportOnlyFiltered(e.target.checked)} />
                  <span className="muted">only filtered</span>
                </label>
                {EXPORT_FORMATS.map((f) => (
                  <button key={f} className="btn btn-sm" onClick={() => doExport(f)} disabled={exporting !== null}>
                    <IconDownload size={12} /> {exporting === f ? "…" : f}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="split" style={{ flex: 1, minHeight: 0 }}>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Source</th>
                <th>Destination</th>
                <th>Protocol</th>
                <th>Len</th>
                <th>Info</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    {jobId ? "Listening…" : "Start a capture to see packets."}
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className={selected === p.id ? "selected" : ""} onClick={() => openDetail(p.id)}>
                  <td className="muted">{p.id}</td>
                  <td className="mono">{Number(p.time).toFixed(4)}</td>
                  <td className="mono">{p.source}</td>
                  <td className="mono">{p.destination}</td>
                  <td>
                    <span className="tag-pill" style={{ color: PROTO_COLOR[p.protocol] || "var(--text-dim)", background: "rgba(var(--overlay-rgb),0.06)" }}>
                      {p.protocol}
                    </span>
                  </td>
                  <td className="muted">{p.length}</td>
                  <td className="mono" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.info}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel" style={{ overflow: "auto" }}>
          {selected === null ? <div className="empty-state muted">Select a packet to see the full dissection</div> : <pre className="codebox">{detail}</pre>}
        </div>
      </div>

      {logs.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>
            tshark log ({logs.length})
          </summary>
          <pre className="codebox">{logs.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
