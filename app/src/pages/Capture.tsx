import { useEffect, useMemo, useState } from "react";
import { CapturedPacketSummary } from "../../electron/types";
import { IconPlay, IconStop, IconWave, IconExternal } from "../lib/icons";

const PROTO_COLOR: Record<string, string> = {
  TCP: "var(--info)",
  UDP: "var(--warn)",
  TLS: "#c792ff",
  HTTP: "var(--accent-a)",
  DNS: "#4fd1c5",
  ICMP: "var(--danger)",
};

export function Capture() {
  const [available, setAvailable] = useState<{ available: boolean; installHint: string } | null>(null);
  const [interfaces, setInterfaces] = useState<{ id: string; description: string }[]>([]);
  const [iface, setIface] = useState("");
  const [filter, setFilter] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [pcapPath, setPcapPath] = useState<string | null>(null);
  const [packets, setPackets] = useState<CapturedPacketSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState("");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    window.wraith.capture.checkAvailable().then(setAvailable);
    window.wraith.capture.listInterfaces().then((list) => {
      setInterfaces(list);
      if (list.length > 0) setIface(list[0].id);
    });
  }, []);

  useEffect(() => {
    const offPacket = window.wraith.capture.onPacket((p) => {
      if (p.jobId !== jobId) return;
      setPackets((cur) => [...cur, p]);
    });
    const offLog = window.wraith.capture.onLog((l) => {
      if (l.jobId !== jobId) return;
      setLogs((cur) => [...cur.slice(-100), l.line]);
    });
    const offClosed = window.wraith.capture.onClosed((c) => {
      if (c.jobId !== jobId) return;
      setJobId(null);
    });
    return () => {
      offPacket();
      offLog();
      offClosed();
    };
  }, [jobId]);

  const start = async () => {
    setPackets([]);
    setSelected(null);
    const res = await window.wraith.capture.start({ interfaceName: iface, bpfFilter: filter });
    setJobId(res.jobId);
    setPcapPath(res.pcapPath);
  };

  const stop = async () => {
    if (jobId) await window.wraith.capture.stop(jobId);
    setJobId(null);
  };

  const openDetail = async (id: number) => {
    setSelected(id);
    if (!pcapPath) return;
    setDetail("Loading…");
    const text = await window.wraith.capture.packetDetail(pcapPath, id);
    setDetail(text);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return packets;
    return packets.filter((p) => [p.source, p.destination, p.protocol, p.info].join(" ").toLowerCase().includes(q));
  }, [packets, search]);

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
            placeholder="BPF filter, e.g. tcp port 443"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
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
          <input type="search" placeholder="Filter list…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200, marginLeft: "auto" }} />
        </div>
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
                    <span className="tag-pill" style={{ color: PROTO_COLOR[p.protocol] || "var(--text-dim)", background: "rgba(255,255,255,0.06)" }}>
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
