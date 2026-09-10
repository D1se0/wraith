import { useEffect, useState } from "react";
import { Finding, FindingStatus, FindingSeverity } from "../../electron/types";
import { IconTrash, IconFlag } from "../lib/icons";
import { Confetti } from "../components/Confetti";

const COLUMNS: { id: FindingStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "testing", label: "Testing" },
  { id: "confirmed", label: "Confirmed" },
  { id: "reported", label: "Reported" },
];

const SEVERITY_ORDER: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

function sevRank(s: FindingSeverity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export function Findings() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = () => window.wraith.findings.list().then((f) => setFindings(f));

  useEffect(() => {
    refresh().finally(() => setLoaded(true));
    // Live updates from the passive scanner / AI agent, with a slow poll as
    // a fallback in case an event is ever missed (e.g. mid-navigation).
    const off = window.wraith.findings.onNew((f) => setFindings((cur) => (cur.some((x) => x.id === f.id) ? cur : [...cur, f])));
    const id = setInterval(refresh, 8000);
    return () => {
      off();
      clearInterval(id);
    };
  }, []);

  const [celebration, setCelebration] = useState<number | null>(null);
  useEffect(() => {
    if (celebration === null) return;
    const t = setTimeout(() => setCelebration(null), 1900);
    return () => clearTimeout(t);
  }, [celebration]);

  const setStatus = async (id: string, status: FindingStatus) => {
    const wasConfirmed = findings.find((f) => f.id === id)?.status === "confirmed";
    setFindings((cur) => cur.map((f) => (f.id === id ? { ...f, status } : f)));
    await window.wraith.findings.update(id, { status });
    if (status === "confirmed" && !wasConfirmed) setCelebration(Date.now());
  };

  const remove = async (id: string) => {
    setFindings((cur) => cur.filter((f) => f.id !== id));
    await window.wraith.findings.delete(id);
  };

  if (!loaded) return null;

  return (
    <div className="stack">
      {celebration !== null && <Confetti key={celebration} />}
      <div>
        <h1 className="page-title">Findings</h1>
        <p className="page-sub">Everything you or the AI agent have flagged as worth reporting, tracked on a board.</p>
      </div>

      {findings.length === 0 ? (
        <div className="panel empty-state">
          <IconFlag size={30} />
          <p>No findings yet. Add them manually, or ask the AI agent to look for issues — anything it confirms lands here.</p>
        </div>
      ) : (
        <div className="findings-board">
          {COLUMNS.map((col) => {
            const items = findings.filter((f) => f.status === col.id).sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
            return (
              <div className="findings-col" key={col.id}>
                <div className="findings-col-title">
                  {col.label} · <span className="count-pop" key={items.length}>{items.length}</span>
                </div>
                {items.map((f) => (
                  <div className="finding-card" key={f.id}>
                    <div className="row between">
                      <span className={`badge sev-${f.severity}`}>{f.severity}</span>
                      <div className="row" style={{ gap: 4 }}>
                        {f.source === "ai" && <span className="badge">AI</span>}
                        <button className="btn btn-ghost btn-icon" onClick={() => remove(f.id)}>
                          <IconTrash size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="finding-card-title">{f.title}</div>
                    {f.url && (
                      <div className="mono faint" style={{ fontSize: 10.5, wordBreak: "break-all" }}>
                        {f.url}
                      </div>
                    )}
                    <div className="finding-card-desc">{f.description}</div>
                    <select value={f.status} onChange={(e) => setStatus(f.id, e.target.value as FindingStatus)} style={{ fontSize: 11 }}>
                      {COLUMNS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
