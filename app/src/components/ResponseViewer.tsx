import { useMemo, useState } from "react";
import { CapturedResponse } from "../../electron/types";
import { base64ToUtf8, base64ToBytes, isLikelyBinary, formatBytes, utf8ToBase64 } from "../lib/base64";
import { prettyPrintMaybeJson, headerValue, headersToText, copyToClipboard } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
import { IconCopy } from "../lib/icons";
import { KeyValueEditor, KV } from "./KeyValueEditor";

export function headersRecordToKv(headers: Record<string, any>): KV[] {
  return Object.entries(headers || {}).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) }));
}

export function kvToHeadersRecord(rows: KV[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) if (r.key.trim()) out[r.key] = r.value;
  return out;
}

interface EditableResponseValue {
  statusCode: number;
  statusMessage: string;
  headers: KV[];
  bodyText: string;
}

export function ResponseViewer({
  response,
  loading,
  editable,
  onChange,
}: {
  response: CapturedResponse | null;
  loading?: boolean;
  editable?: boolean;
  onChange?: (v: EditableResponseValue) => void;
}) {
  const [tab, setTab] = useState<"body" | "headers" | "render">("body");
  const [showRawBase64, setShowRawBase64] = useState(false);

  const bytes = useMemo(() => (response ? base64ToBytes(response.body) : new Uint8Array()), [response]);
  const binary = useMemo(() => isLikelyBinary(bytes), [bytes]);
  const text = useMemo(() => (response ? base64ToUtf8(response.body) : ""), [response]);
  const pretty = useMemo(() => prettyPrintMaybeJson(text), [text]);
  const contentType = response ? headerValue(response.headers, "content-type") : "";
  const looksHtml = contentType.includes("html");

  if (loading) {
    return (
      <div className="empty-state">
        <div className="mono muted">Waiting for response…</div>
      </div>
    );
  }
  if (!response) {
    return <div className="empty-state muted">No response yet</div>;
  }

  const editValue = (patch: Partial<EditableResponseValue>) => {
    if (!onChange) return;
    onChange({
      statusCode: response.statusCode,
      statusMessage: response.statusMessage,
      headers: headersRecordToKv(response.headers),
      bodyText: text,
      ...patch,
    });
  };

  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 10 }}>
        {editable ? (
          <>
            <input
              type="number"
              style={{ width: 90, fontFamily: "var(--font-mono)" }}
              value={response.statusCode}
              onChange={(e) => editValue({ statusCode: Number(e.target.value) })}
            />
            <input
              type="text"
              style={{ width: 160 }}
              value={response.statusMessage}
              onChange={(e) => editValue({ statusMessage: e.target.value })}
            />
          </>
        ) : (
          <>
            <StatusBadge code={response.statusCode} />
            <span className="muted">{response.statusMessage}</span>
          </>
        )}
        <span className="faint">·</span>
        <span className="muted">{response.timeMs} ms</span>
        <span className="faint">·</span>
        <span className="muted">{formatBytes(bytes.length)}</span>
        {response.bodyTruncated && <span className="badge badge-4xx">truncated preview</span>}
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === "body" ? "active" : ""}`} onClick={() => setTab("body")}>
          Body
        </button>
        <button className={`tab-btn ${tab === "headers" ? "active" : ""}`} onClick={() => setTab("headers")}>
          Headers
        </button>
        {looksHtml && !editable && (
          <button className={`tab-btn ${tab === "render" ? "active" : ""}`} onClick={() => setTab("render")}>
            Render HTML
          </button>
        )}
      </div>

      {tab === "headers" &&
        (editable ? (
          <KeyValueEditor rows={headersRecordToKv(response.headers)} onChange={(headers) => editValue({ headers })} />
        ) : (
          <pre className="codebox">{headersToText(response.headers) || "(no headers)"}</pre>
        ))}

      {tab === "body" &&
        (editable ? (
          <textarea rows={12} value={text} onChange={(e) => editValue({ bodyText: e.target.value })} />
        ) : binary && !showRawBase64 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            <div className="muted">Binary content, {formatBytes(bytes.length)}</div>
            <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setShowRawBase64(true)}>
              Show raw base64
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            <div className="row between">
              <span className="faint">{pretty.isJson ? "JSON" : "raw"}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(showRawBase64 ? response.body : pretty.pretty)}>
                <IconCopy size={12} /> Copy
              </button>
            </div>
            <pre className="codebox">{showRawBase64 ? response.body : pretty.pretty || "(empty body)"}</pre>
          </div>
        ))}

      {tab === "render" && looksHtml && (
        <iframe title="rendered-response" sandbox="" srcDoc={text} style={{ width: "100%", height: 420, border: "none", borderRadius: 12, background: "#fff" }} />
      )}
    </div>
  );
}

export function encodeEditedBody(bodyText: string): string {
  return utf8ToBase64(bodyText);
}
