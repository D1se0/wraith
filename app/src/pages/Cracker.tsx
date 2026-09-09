import { useEffect, useMemo, useState } from "react";
import { CrackerJobRequest, CrackerTool } from "../../electron/types";
import { IconKey, IconPlay, IconStop, IconExternal } from "../lib/icons";

interface JobHandle {
  jobId: string;
  tool: CrackerTool;
  potPath?: string;
  outPath?: string;
  hashFile: string;
}

export function Cracker() {
  const [availability, setAvailability] = useState<any>(null);
  const [tool, setTool] = useState<CrackerTool>("john");
  const [hashFile, setHashFile] = useState("");
  const [wordlistFile, setWordlistFile] = useState("");
  const [attackMode, setAttackMode] = useState<"wordlist" | "mask" | "bruteforce">("wordlist");
  const [mask, setMask] = useState("?a?a?a?a?a?a");
  const [rulesEnabled, setRulesEnabled] = useState(false);
  const [johnFormat, setJohnFormat] = useState("");
  const [johnFormats, setJohnFormats] = useState<string[]>([]);
  const [hashcatMode, setHashcatMode] = useState("0");
  const [hashcatModes, setHashcatModes] = useState<{ mode: string; name: string }[]>([]);
  const [extraArgs, setExtraArgs] = useState("");
  const [job, setJob] = useState<JobHandle | null>(null);
  const [console_, setConsole] = useState<{ line: string; kind: string }[]>([]);
  const [results, setResults] = useState<{ hash: string; plain: string }[]>([]);
  const [modeFilter, setModeFilter] = useState("");

  useEffect(() => {
    window.wraith.cracker.checkAvailable().then(setAvailability);
    window.wraith.cracker.listJohnFormats().then(setJohnFormats);
    window.wraith.cracker.listHashcatModes().then(setHashcatModes);
  }, []);

  useEffect(() => {
    const off = window.wraith.cracker.onEvent((evt) => {
      if (!job || evt.jobId !== job.jobId) return;
      if (evt.type === "stdout") setConsole((c) => [...c.slice(-500), { line: evt.data, kind: "out" }]);
      if (evt.type === "stderr") setConsole((c) => [...c.slice(-500), { line: evt.data, kind: "err" }]);
      if (evt.type === "cracked") setConsole((c) => [...c.slice(-500), { line: `✓ ${evt.data}`, kind: "cracked" }]);
      if (evt.type === "done") {
        window.wraith.cracker.readResults(job).then(setResults);
      }
    });
    return off;
  }, [job]);

  const filteredHashcatModes = useMemo(() => {
    const q = modeFilter.trim().toLowerCase();
    if (!q) return hashcatModes.slice(0, 200);
    return hashcatModes.filter((m) => m.name.toLowerCase().includes(q) || m.mode.includes(q)).slice(0, 200);
  }, [hashcatModes, modeFilter]);

  const pick = async (setter: (v: string) => void) => {
    const path = await window.wraith.app.chooseFile();
    if (path) setter(path);
  };

  const start = async () => {
    setConsole([]);
    setResults([]);
    const req: CrackerJobRequest = {
      tool,
      hashFile,
      wordlistFile: attackMode === "wordlist" ? wordlistFile : undefined,
      hashcatMode,
      johnFormat: johnFormat || undefined,
      rulesEnabled,
      attackMode,
      mask: attackMode === "mask" ? mask : undefined,
      extraArgs: extraArgs || undefined,
    };
    const handle = await window.wraith.cracker.start(req);
    setJob(handle);
  };

  const stop = async () => {
    if (job) await window.wraith.cracker.stop(job.jobId);
  };

  const toolAvailable = (t: CrackerTool) => availability?.[t]?.available !== false;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Cracker</h1>
        <p className="page-sub">John the Ripper and hashcat, wired up with a normal UI.</p>
      </div>

      {availability && (!availability.john.available || !availability.hashcat.available) && (
        <div className="panel">
          {!availability.john.available && (
            <div className="row" style={{ gap: 8 }}>
              <span className="badge badge-4xx">john missing</span>
              <code className="mono muted">{availability.installHint}</code>
            </div>
          )}
          {!availability.hashcat.available && (
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <span className="badge badge-4xx">hashcat missing</span>
              <code className="mono muted">{availability.installHint}</code>
            </div>
          )}
        </div>
      )}

      <div className="panel stack">
        <div className="row" style={{ gap: 8 }}>
          <button className={`chip ${tool === "john" ? "active" : ""}`} onClick={() => setTool("john")} disabled={!toolAvailable("john")}>
            John the Ripper
          </button>
          <button className={`chip ${tool === "hashcat" ? "active" : ""}`} onClick={() => setTool("hashcat")} disabled={!toolAvailable("hashcat")}>
            hashcat
          </button>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Hash file</label>
            <div className="row">
              <input type="text" readOnly value={hashFile} placeholder="Choose a file…" />
              <button className="btn btn-sm" onClick={() => pick(setHashFile)}>
                Browse
              </button>
            </div>
          </div>

          {tool === "john" ? (
            <div className="field">
              <label>Format</label>
              <select value={johnFormat} onChange={(e) => setJohnFormat(e.target.value)}>
                <option value="">(auto-detect)</option>
                {johnFormats.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Mode</label>
              <input type="text" placeholder="filter modes…" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} style={{ marginBottom: 4 }} />
              <select value={hashcatMode} onChange={(e) => setHashcatMode(e.target.value)}>
                {filteredHashcatModes.map((m) => (
                  <option key={m.mode} value={m.mode}>
                    {m.mode} — {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="field">
          <label>Attack mode</label>
          <div className="row" style={{ gap: 8 }}>
            <button className={`chip ${attackMode === "wordlist" ? "active" : ""}`} onClick={() => setAttackMode("wordlist")}>
              Wordlist
            </button>
            <button className={`chip ${attackMode === "mask" ? "active" : ""}`} onClick={() => setAttackMode("mask")}>
              Mask
            </button>
            {tool === "john" && (
              <button className={`chip ${attackMode === "bruteforce" ? "active" : ""}`} onClick={() => setAttackMode("bruteforce")}>
                Incremental brute-force
              </button>
            )}
          </div>
        </div>

        {attackMode === "wordlist" && (
          <div className="grid-2">
            <div className="field">
              <label>Wordlist</label>
              <div className="row">
                <input type="text" readOnly value={wordlistFile} placeholder="Choose a file…" />
                <button className="btn btn-sm" onClick={() => pick(setWordlistFile)}>
                  Browse
                </button>
              </div>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={rulesEnabled} onChange={(e) => setRulesEnabled(e.target.checked)} />
                Enable rules {tool === "john" ? "(--rules)" : "(best64.rule)"}
              </label>
            </div>
          </div>
        )}
        {attackMode === "mask" && (
          <div className="field">
            <label>Mask</label>
            <input type="text" value={mask} onChange={(e) => setMask(e.target.value)} placeholder="?a?a?a?a?a?a" />
            <span className="field-hint">?l lower, ?u upper, ?d digit, ?s symbol, ?a all</span>
          </div>
        )}

        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>
            Advanced: extra arguments
          </summary>
          <input type="text" value={extraArgs} onChange={(e) => setExtraArgs(e.target.value)} placeholder="--fork=4 …" style={{ marginTop: 8 }} />
        </details>

        <div className="row">
          {job ? (
            <button className="btn btn-danger" onClick={stop}>
              <IconStop size={13} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start} disabled={!hashFile || (attackMode === "wordlist" && !wordlistFile)}>
              <IconPlay size={13} /> Start cracking
            </button>
          )}
          {job && <span className="muted">job {job.jobId.slice(0, 8)}</span>}
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-title">Console</div>
          <div className="codebox" style={{ maxHeight: 320 }}>
            {console_.length === 0 && <span className="muted">No output yet.</span>}
            {console_.map((c, i) => (
              <div key={i} className={c.kind === "err" ? "muted" : c.kind === "cracked" ? "" : undefined} style={c.kind === "cracked" ? { color: "var(--accent-a)", fontWeight: 700 } : undefined}>
                {c.line}
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="row between">
            <div className="panel-title">
              <IconKey size={14} style={{ marginRight: 6 }} />
              Cracked ({results.length})
            </div>
            {job && (
              <button className="btn btn-sm" onClick={() => window.wraith.cracker.readResults(job).then(setResults)}>
                Refresh
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <div className="empty-state muted">Nothing cracked yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hash</th>
                  <th>Plaintext</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.hash}
                    </td>
                    <td className="mono" style={{ color: "var(--accent-a)", fontWeight: 700 }}>
                      {r.plain}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => window.wraith.app.openExternal("https://hashcat.net/wiki/doku.php?id=example_hashes")}>
          <IconExternal size={12} /> hashcat example hashes
        </button>
      </div>
    </div>
  );
}
