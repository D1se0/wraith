import { useEffect, useMemo, useState } from "react";
import * as Diff from "diff";
import { Exchange } from "../../electron/types";
import { base64ToUtf8 } from "../lib/base64";
import { headersToText, prettyPrintMaybeJson } from "../lib/format";
import { IconCompare } from "../lib/icons";
import { useApp } from "../context/AppContext";

function requestText(ex: Exchange): string {
  const body = prettyPrintMaybeJson(base64ToUtf8(ex.request.body)).pretty;
  return [`${ex.request.method} ${ex.request.url}`, headersToText(ex.request.headers), body].filter(Boolean).join("\n\n");
}

function responseText(ex: Exchange): string {
  if (!ex.response) return "(no response)";
  const body = prettyPrintMaybeJson(base64ToUtf8(ex.response.body)).pretty;
  return [`HTTP ${ex.response.statusCode} ${ex.response.statusMessage}`, headersToText(ex.response.headers), body].filter(Boolean).join("\n\n");
}

function DiffBlock({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => Diff.diffLines(before, after), [before, after]);
  return (
    <pre className="codebox" style={{ maxHeight: 420, overflow: "auto" }}>
      {parts.map((part, i) => (
        <span
          key={i}
          style={{
            display: "block",
            background: part.added ? "rgba(55,230,196,0.12)" : part.removed ? "rgba(255,92,120,0.12)" : "transparent",
            color: part.added ? "var(--accent-a)" : part.removed ? "#ffb0be" : undefined,
          }}
        >
          {part.value
            .replace(/\n$/, "")
            .split("\n")
            .map((line, j) => (
              <span key={j} style={{ display: "block" }}>
                {part.added ? "+ " : part.removed ? "- " : "  "}
                {line}
              </span>
            ))}
        </span>
      ))}
    </pre>
  );
}

function SlotPicker({ label, history, value, onChange }: { label: string; history: Exchange[]; value: Exchange | null; onChange: (ex: Exchange | null) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select
        value={value?.id || ""}
        onChange={(e) => onChange(history.find((h) => h.id === e.target.value) || null)}
      >
        <option value="">(choose a request from History)</option>
        {history
          .slice()
          .reverse()
          .map((h) => (
            <option key={h.id} value={h.id}>
              {h.request.method} {h.request.url}
            </option>
          ))}
      </select>
    </div>
  );
}

export function Comparer() {
  const { comparerSlots, sendToComparer } = useApp();
  const [history, setHistory] = useState<Exchange[]>([]);

  useEffect(() => {
    window.wraith.history.list().then(setHistory);
  }, []);

  const [a, b] = comparerSlots;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Comparer</h1>
        <p className="page-sub">Line-by-line diff between two captured requests/responses — send a request here from History's "Compare" button, or pick from the list below.</p>
      </div>

      <div className="panel grid-2">
        <SlotPicker label="A" history={history} value={a} onChange={(ex) => sendToComparer(ex, 0)} />
        <SlotPicker label="B" history={history} value={b} onChange={(ex) => sendToComparer(ex, 1)} />
      </div>

      {!a || !b ? (
        <div className="panel empty-state">
          <IconCompare size={30} />
          <p>Pick two requests to compare.</p>
        </div>
      ) : (
        <>
          <div className="panel stack">
            <div className="row between">
              <div className="panel-title">Request</div>
              <div className="muted mono" style={{ fontSize: 11 }}>
                A: {a.request.method} {a.request.url} &nbsp;·&nbsp; B: {b.request.method} {b.request.url}
              </div>
            </div>
            <DiffBlock before={requestText(a)} after={requestText(b)} />
          </div>
          <div className="panel stack">
            <div className="panel-title">Response</div>
            <DiffBlock before={responseText(a)} after={responseText(b)} />
          </div>
        </>
      )}
    </div>
  );
}
