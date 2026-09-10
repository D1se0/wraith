import { useEffect, useRef, useState } from "react";
import { RaceEvent, RaceResultRow } from "../../electron/types";
import { KeyValueEditor, KV } from "../components/KeyValueEditor";
import { IconPlay, IconRace } from "../lib/icons";
import { useApp } from "../context/AppContext";

const STATUS_COLOR = (code: number) => (code === 0 ? "badge-5xx" : code < 300 ? "badge-2xx" : code < 400 ? "badge-3xx" : code < 500 ? "badge-4xx" : "badge-5xx");

export function Race() {
  const { toast, raceSeed, clearRaceSeed } = useApp();
  const [method, setMethod] = useState(raceSeed?.method || "GET");
  const [url, setUrl] = useState(raceSeed?.url || "https://");
  const [headers, setHeaders] = useState<KV[]>(raceSeed?.headers?.length ? raceSeed.headers : [{ key: "User-Agent", value: "Wraith/1.0" }]);
  const [bodyText, setBodyText] = useState(raceSeed?.body || "");
  const [insecure, setInsecure] = useState(true);
  const [count, setCount] = useState(20);

  useEffect(() => {
    if (raceSeed) clearRaceSeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [jobId, setJobId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [rows, setRows] = useState<RaceResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    const off = window.wraith.race.onEvent((evt: RaceEvent) => {
      if (evt.jobId !== jobIdRef.current) return;
      if (evt.type === "result" && evt.row) {
        setRows((cur) => [...cur, evt.row!]);
        setCompleted(evt.completed || 0);
      } else if (evt.type === "done") {
        jobIdRef.current = null;
        setJobId(null);
      }
    });
    return off;
  }, []);

  const groups = rows.reduce<Record<number, number>>((acc, r) => {
    acc[r.statusCode] = (acc[r.statusCode] || 0) + 1;
    return acc;
  }, {});

  const fire = async () => {
    setRows([]);
    setCompleted(0);
    const handle = await window.wraith.race.start({ method, url, headers, bodyText, insecure, count });
    if (handle.error) {
      toast(handle.error, "error");
      return;
    }
    jobIdRef.current = handle.jobId;
    setJobId(handle.jobId);
    setTotal(count);
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Race</h1>
        <p className="page-sub">
          Fire the same request N times as close to simultaneously as possible — the classic way to catch a check-then-use flaw (coupon reused,
          balance spent twice, single-use token accepted more than once) that only shows up under real concurrency.
        </p>
      </div>

      <div className="panel stack">
        <div className="row wrap" style={{ gap: 10 }}>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: 100 }}>
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1 }} className="mono" />
        </div>
        <div className="field">
          <label>Headers</label>
          <KeyValueEditor rows={headers} onChange={setHeaders} />
        </div>
        <div className="field">
          <label>Body</label>
          <textarea rows={4} className="mono" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
        </div>
        <div className="row wrap" style={{ gap: 16 }}>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={insecure} onChange={(e) => setInsecure(e.target.checked)} />
            Ignore TLS errors
          </label>
          <div className="field" style={{ width: 140 }}>
            <label>Concurrent requests</label>
            <input type="number" min={2} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <button className="btn btn-primary" onClick={fire} disabled={!!jobId} style={{ alignSelf: "flex-end" }}>
            <IconPlay size={13} /> Fire
          </button>
          {(jobId || rows.length > 0) && (
            <span className="muted" style={{ alignSelf: "flex-end" }}>
              {completed} / {total}
            </span>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="panel">
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="panel-title">Results</div>
            <div className="row" style={{ gap: 8 }}>
              {Object.entries(groups)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([code, n]) => (
                  <span key={code} className={`badge ${STATUS_COLOR(Number(code))}`}>
                    {code} × {n}
                  </span>
                ))}
            </div>
          </div>
          {!jobId && rows.length === total && (groups[200] || 0) > 1 && (
            <div className="row" style={{ gap: 8, padding: 10, borderRadius: 10, background: "rgba(255,180,84,0.1)", border: "1px solid rgba(255,180,84,0.35)", marginBottom: 10 }}>
              <IconRace size={15} style={{ color: "var(--warn)" }} />
              <span>
                {groups[200]} of {total} requests got a 200 — if this endpoint should only allow one of these to succeed (a single-use coupon,
                a balance check, a limited-stock purchase), this is a strong signal of a race condition.
              </span>
            </div>
          )}
          <div className="table-scroll" style={{ maxHeight: 420 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .sort((a, b) => a.index - b.index)
                  .map((r) => (
                    <tr key={r.index}>
                      <td className="muted">{r.index}</td>
                      <td>{r.error ? <span className="badge badge-5xx">error</span> : <span className={`badge ${STATUS_COLOR(r.statusCode)}`}>{r.statusCode}</span>}</td>
                      <td className="muted">{r.sizeBytes} B</td>
                      <td className="muted">{r.timeMs} ms</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
