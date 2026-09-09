import { KeyValueEditor, KV } from "./KeyValueEditor";

export interface EditableRequest {
  method: string;
  url: string;
  headers: KV[];
  bodyText: string;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function RequestEditor({
  value,
  onChange,
  compactMethod = false,
}: {
  value: EditableRequest;
  onChange: (v: EditableRequest) => void;
  compactMethod?: boolean;
}) {
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <select
          value={value.method}
          onChange={(e) => onChange({ ...value, method: e.target.value })}
          style={{ width: compactMethod ? 110 : 130, fontFamily: "var(--font-mono)", fontWeight: 700 }}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={value.url}
          placeholder="https://target.example.com/path?query=1"
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          style={{ fontFamily: "var(--font-mono)" }}
        />
      </div>
      <div className="field">
        <label>Headers</label>
        <KeyValueEditor rows={value.headers} onChange={(headers) => onChange({ ...value, headers })} />
      </div>
      <div className="field">
        <label>Body</label>
        <textarea
          value={value.bodyText}
          onChange={(e) => onChange({ ...value, bodyText: e.target.value })}
          placeholder="(no body)"
          rows={10}
        />
      </div>
    </div>
  );
}
