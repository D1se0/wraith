import { useState } from "react";
import { CodecOp } from "../../electron/types";
import { copyToClipboard } from "../lib/format";
import { IconCopy } from "../lib/icons";

const OPS: { group: string; ops: { op: CodecOp; label: string }[] }[] = [
  {
    group: "Base64",
    ops: [
      { op: "base64-encode", label: "Encode" },
      { op: "base64-decode", label: "Decode" },
    ],
  },
  {
    group: "URL",
    ops: [
      { op: "url-encode", label: "Encode" },
      { op: "url-decode", label: "Decode" },
    ],
  },
  {
    group: "Hex",
    ops: [
      { op: "hex-encode", label: "Encode" },
      { op: "hex-decode", label: "Decode" },
    ],
  },
  {
    group: "HTML entities",
    ops: [
      { op: "html-entities-encode", label: "Encode" },
      { op: "html-entities-decode", label: "Decode" },
    ],
  },
  {
    group: "Unicode",
    ops: [
      { op: "unicode-escape", label: "Escape" },
      { op: "unicode-unescape", label: "Unescape" },
    ],
  },
  {
    group: "Gzip (base64 in/out)",
    ops: [
      { op: "gzip-encode", label: "Encode" },
      { op: "gzip-decode", label: "Decode" },
    ],
  },
  { group: "JWT", ops: [{ op: "jwt-decode", label: "Decode" }] },
  {
    group: "Hash",
    ops: [
      { op: "md5", label: "MD5" },
      { op: "sha1", label: "SHA-1" },
      { op: "sha256", label: "SHA-256" },
    ],
  },
];

export function Decoder() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastOp, setLastOp] = useState<CodecOp | null>(null);

  const run = async (op: CodecOp) => {
    setLastOp(op);
    const res = await window.wraith.codec.run({ op, input });
    if (res.error) {
      setError(res.error);
      setOutput("");
    } else {
      setError(null);
      setOutput(res.output);
    }
  };

  const swap = () => {
    setInput(output);
    setOutput(input);
    setError(null);
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Decoder</h1>
        <p className="page-sub">Encode, decode and hash — Base64, URL, hex, HTML entities, Unicode, gzip, JWT, MD5/SHA1/SHA256.</p>
      </div>

      <div className="split">
        <div className="panel stack">
          <div className="row between">
            <div className="panel-title">Input</div>
            <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(input)}>
              <IconCopy size={12} /> Copy
            </button>
          </div>
          <textarea rows={12} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste text, a token, base64, hex…" />
        </div>
        <div className="panel stack">
          <div className="row between">
            <div className="panel-title">Output {lastOp && <span className="muted">({lastOp})</span>}</div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={swap}>
                Swap ⇄
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(output)}>
                <IconCopy size={12} /> Copy
              </button>
            </div>
          </div>
          {error ? <div className="badge badge-5xx">{error}</div> : <textarea rows={12} readOnly value={output} />}
        </div>
      </div>

      <div className="panel">
        <div className="stack">
          {OPS.map((group) => (
            <div key={group.group} className="row wrap" style={{ gap: 8 }}>
              <span className="muted" style={{ width: 170, flex: "0 0 170px" }}>
                {group.group}
              </span>
              {group.ops.map((o) => (
                <button key={o.op} className="chip" onClick={() => run(o.op)}>
                  {o.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
