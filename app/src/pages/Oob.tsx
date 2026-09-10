import { useEffect, useRef, useState } from "react";
import { OobEvent, OobInteraction } from "../../electron/types";
import { copyToClipboard } from "../lib/format";
import { IconCopy, IconPlay, IconStop, IconWifi, IconWarning } from "../lib/icons";
import { useApp } from "../context/AppContext";

export function Oob() {
  const { toast } = useApp();
  const [domain, setDomain] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [interactions, setInteractions] = useState<OobInteraction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const off = window.wraith.oob.onEvent((evt: OobEvent) => {
      if (evt.sessionId !== sessionIdRef.current) return;
      if (evt.type === "interaction" && evt.interaction) {
        setInteractions((cur) => [evt.interaction!, ...cur]);
        toast(`OOB interaction received: ${evt.interaction.protocol} from ${evt.interaction.remoteAddress}`);
      } else if (evt.type === "error") {
        setError(evt.message || "Unknown error");
      }
    });
    return off;
  }, [toast]);

  const start = async () => {
    setStarting(true);
    setError(null);
    const result = await window.wraith.oob.start();
    setStarting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    sessionIdRef.current = result.sessionId;
    setSessionId(result.sessionId);
    setDomain(result.domain);
    setInteractions([]);
  };

  const stop = async () => {
    if (sessionIdRef.current) await window.wraith.oob.stop(sessionIdRef.current);
    sessionIdRef.current = null;
    setSessionId(null);
    setDomain(null);
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">OOB Interactions</h1>
        <p className="page-sub">
          Generate a unique domain and watch for DNS/HTTP/SMTP hits against it — the way to confirm blind SSRF, XXE, blind command injection and
          similar issues that never return a visible response.
        </p>
      </div>

      <div className="panel row" style={{ gap: 8 }}>
        <IconWarning size={15} style={{ color: "var(--warn)", flex: "0 0 auto" }} />
        <span className="muted">
          Uses{" "}
          <a className="link" style={{ cursor: "pointer" }} onClick={() => window.wraith.app.openExternal("https://github.com/projectdiscovery/interactsh")}>
            interactsh
          </a>
          , a free third-party service — the domain you generate and any interaction it reports pass through interactsh's public infrastructure,
          not just this machine.
        </span>
      </div>

      <div className="panel stack">
        {!domain ? (
          <button className="btn btn-primary" onClick={start} disabled={starting} style={{ alignSelf: "flex-start" }}>
            <IconPlay size={13} /> {starting ? "Registering…" : "Start listener"}
          </button>
        ) : (
          <>
            <div className="row between">
              <div className="row" style={{ gap: 10 }}>
                <IconWifi size={16} style={{ color: "var(--accent-a)" }} />
                <code className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                  {domain}
                </code>
                <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(domain)}>
                  <IconCopy size={12} /> Copy
                </button>
              </div>
              <button className="btn btn-danger btn-sm" onClick={stop}>
                <IconStop size={13} /> Stop
              </button>
            </div>
            <span className="field-hint">
              Paste this domain (or a subdomain/path built on it, e.g. http://{domain}/x) anywhere you'd probe for blind interaction — a URL
              parameter, an XML entity, a header. Polling runs automatically every few seconds while this listener is active.
            </span>
          </>
        )}
        {error && <div className="badge badge-5xx">{error}</div>}
      </div>

      {sessionId && (
        <div className="panel">
          <div className="panel-title">Interactions ({interactions.length})</div>
          {interactions.length === 0 ? (
            <div className="empty-state muted">Waiting for the first interaction…</div>
          ) : (
            <div className="stack-sm" style={{ marginTop: 10 }}>
              {interactions.map((it) => (
                <div key={it.fullId} className="finding-card">
                  <div className="row between" onClick={() => setExpanded((cur) => (cur === it.fullId ? null : it.fullId))} style={{ cursor: "pointer" }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="badge">{it.protocol.toUpperCase()}</span>
                      <span className="mono">{it.remoteAddress}</span>
                    </div>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {new Date(it.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {expanded === it.fullId && (it.rawRequest || it.rawResponse) && (
                    <div className="stack-sm">
                      {it.rawRequest && <pre className="codebox">{it.rawRequest}</pre>}
                      {it.rawResponse && <pre className="codebox">{it.rawResponse}</pre>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
