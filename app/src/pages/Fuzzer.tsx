import { useEffect, useRef, useState } from "react";
import { FuzzerEvent, FuzzerResultRow } from "../../electron/types";
import { KV } from "../components/KeyValueEditor";
import { IconPlay, IconStop, IconPlus, IconX, IconUpload, IconZap } from "../lib/icons";
import { useApp } from "../context/AppContext";

function wrapSelection(el: HTMLInputElement | HTMLTextAreaElement, setValue: (v: string) => void) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === end) return;
  const v = el.value;
  setValue(`${v.slice(0, start)}§${v.slice(start, end)}§${v.slice(end)}`);
}

const STATUS_COLOR = (code: number) => (code === 0 ? "badge-5xx" : code < 300 ? "badge-2xx" : code < 400 ? "badge-3xx" : code < 500 ? "badge-4xx" : "badge-5xx");

export function Fuzzer() {
  const { toast, fuzzerSeed, clearFuzzerSeed } = useApp();
  const [method, setMethod] = useState(fuzzerSeed?.method || "GET");
  const [url, setUrl] = useState(fuzzerSeed?.url || "https://");
  const [headers, setHeaders] = useState<KV[]>(fuzzerSeed?.headers?.length ? fuzzerSeed.headers : [{ key: "User-Agent", value: "Wraith/1.0" }]);
  const [bodyText, setBodyText] = useState(fuzzerSeed?.body || "");
  const [insecure, setInsecure] = useState(true);

  useEffect(() => {
    if (fuzzerSeed) clearFuzzerSeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [payloadsText, setPayloadsText] = useState("");
  const [concurrency, setConcurrency] = useState(5);

  const urlRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const headerRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const wordlistInputRef = useRef<HTMLInputElement | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [rows, setRows] = useState<FuzzerResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [sortBy, setSortBy] = useState<keyof FuzzerResultRow>("index");

  useEffect(() => {
    const off = window.wraith.fuzzer.onEvent((evt: FuzzerEvent) => {
      if (evt.jobId !== jobIdRef.current) return;
      if (evt.type === "result" && evt.row) {
        setRows((cur) => [...cur, evt.row!]);
        setCompleted(evt.completed || 0);
      } else if (evt.type === "done") {
        toast(`Fuzzing done — ${evt.completed} requests sent.`);
        jobIdRef.current = null;
        setJobId(null);
      } else if (evt.type === "stopped") {
        toast("Fuzzing stopped.");
        jobIdRef.current = null;
        setJobId(null);
      } else if (evt.type === "error") {
        toast(evt.message || "Fuzzer error", "error");
        jobIdRef.current = null;
        setJobId(null);
      }
    });
    return off;
  }, [toast]);

  const start = async () => {
    const payloads = payloadsText.split("\n").map((l) => l.trim()).filter(Boolean);
    setRows([]);
    setCompleted(0);
    const handle = await window.wraith.fuzzer.start({ method, url, headers, bodyText, insecure, payloads, concurrency });
    if (handle.error) {
      toast(handle.error, "error");
      return;
    }
    jobIdRef.current = handle.jobId;
    setJobId(handle.jobId);
    setTotal(handle.totalRequests);
  };

  const stop = async () => {
    if (jobIdRef.current) await window.wraith.fuzzer.stop(jobIdRef.current);
  };

  const loadWordlist = async (file: File) => {
    const text = await file.text();
    setPayloadsText(text.trim());
    toast(`Loaded ${text.trim().split("\n").filter(Boolean).length} payload(s)`);
  };

  const sortedRows = rows.slice().sort((a, b) => {
    const av = a[sortBy] as any;
    const bv = b[sortBy] as any;
    return typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
  });

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Fuzzer</h1>
        <p className="page-sub">
          Intruder-style Sniper attack: select text in the URL, a header, or the body and click "Mark §" to turn it into a payload position, then
          give it a wordlist. Each position is attacked in turn against every payload.
        </p>
      </div>

      <div className="panel stack">
        <div className="row wrap" style={{ gap: 10 }}>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: 100 }}>
            {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input ref={urlRef} type="text" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1 }} className="mono" />
          <button className="btn btn-sm" onClick={() => urlRef.current && wrapSelection(urlRef.current, setUrl)} title="Wrap the selected text in the URL with §…§">
            Mark §
          </button>
        </div>

        <div className="stack-sm">
          <label className="field-hint">Headers</label>
          {headers.map((h, i) => (
            <div className="kv-row" key={i}>
              <input type="text" value={h.key} onChange={(e) => setHeaders((cur) => cur.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)))} placeholder="Header" />
              <input
                ref={(el) => {
                  headerRefs.current[i] = el;
                }}
                type="text"
                value={h.value}
                onChange={(e) => setHeaders((cur) => cur.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))}
                placeholder="Value"
                className="mono"
              />
              <button
                className="btn btn-ghost btn-icon"
                title="Wrap the selected text with §…§"
                onClick={() => {
                  const el = headerRefs.current[i];
                  if (el) wrapSelection(el, (v) => setHeaders((cur) => cur.map((r, idx) => (idx === i ? { ...r, value: v } : r))));
                }}
              >
                §
              </button>
              <button className="btn btn-ghost btn-icon" onClick={() => setHeaders((cur) => cur.filter((_, idx) => idx !== i))}>
                <IconX size={13} />
              </button>
            </div>
          ))}
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setHeaders((cur) => [...cur, { key: "", value: "" }])}>
            <IconPlus size={12} /> Add header
          </button>
        </div>

        <div className="field">
          <div className="row between">
            <label>Body</label>
            <button className="btn btn-sm" onClick={() => bodyRef.current && wrapSelection(bodyRef.current, setBodyText)}>
              Mark §
            </button>
          </div>
          <textarea ref={bodyRef} rows={5} className="mono" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
        </div>

        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={insecure} onChange={(e) => setInsecure(e.target.checked)} />
          Ignore TLS errors
        </label>
      </div>

      <div className="panel stack">
        <div className="row between">
          <div className="panel-title">Payloads</div>
          <div className="row" style={{ gap: 8 }}>
            <input
              ref={wordlistInputRef}
              type="file"
              accept=".txt,.csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadWordlist(f);
                e.target.value = "";
              }}
            />
            <button className="btn btn-sm" onClick={() => wordlistInputRef.current?.click()}>
              <IconUpload size={12} /> Load wordlist
            </button>
            <div className="field" style={{ width: 120 }}>
              <input type="number" value={concurrency} min={1} max={20} onChange={(e) => setConcurrency(Number(e.target.value))} placeholder="Concurrency" />
            </div>
          </div>
        </div>
        <textarea rows={5} className="mono" value={payloadsText} onChange={(e) => setPayloadsText(e.target.value)} placeholder="one payload per line" />
        <div className="row" style={{ gap: 10 }}>
          {jobId ? (
            <button className="btn btn-danger" onClick={stop}>
              <IconStop size={13} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start} disabled={!url.includes("§") && !bodyText.includes("§") && !headers.some((h) => h.value.includes("§"))}>
              <IconPlay size={13} /> Start attack
            </button>
          )}
          {(jobId || rows.length > 0) && (
            <span className="muted">
              {completed} / {total}
            </span>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="panel">
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="panel-title">Results</div>
            <div className="field" style={{ width: 160 }}>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as keyof FuzzerResultRow)}>
                <option value="index">Sort: order sent</option>
                <option value="statusCode">Sort: status</option>
                <option value="sizeBytes">Sort: size</option>
                <option value="timeMs">Sort: time</option>
              </select>
            </div>
          </div>
          <div className="table-scroll" style={{ maxHeight: 420 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Position</th>
                  <th>Payload</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.index}>
                    <td className="muted">{r.index}</td>
                    <td className="muted">{r.position}</td>
                    <td className="mono" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.payload}>
                      {r.payload}
                    </td>
                    <td>{r.error ? <span className="badge badge-5xx">error</span> : <span className={`badge ${STATUS_COLOR(r.statusCode)}`}>{r.statusCode}</span>}</td>
                    <td className="muted">{r.sizeBytes} B</td>
                    <td className="muted">{r.timeMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="field-hint">
            <IconZap size={11} /> Tip: sort by size or status to spot the outlier response that reveals a bypass, injection, or valid credential.
          </span>
        </div>
      )}
    </div>
  );
}
