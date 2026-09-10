import { useState } from "react";
import { CodecOp } from "../../electron/types";
import { copyToClipboard } from "../lib/format";
import { IconCopy, IconPlay, IconAi } from "../lib/icons";

/**
 * Best-effort "what is this" guess for the Magic Wand button -- cheap
 * heuristics only, no false confidence: each check requires a fairly
 * specific signal (charset, length, magic bytes) before it claims a match,
 * and falls through to null rather than guessing wildly.
 */
function guessOp(raw: string): CodecOp | null {
  const s = raw.trim();
  if (!s) return null;

  // JWT: three base64url segments, first one decodes to JSON with "alg"
  const jwtParts = s.split(".");
  if (jwtParts.length === 3 && jwtParts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
    try {
      const header = JSON.parse(atob(jwtParts[0].replace(/-/g, "+").replace(/_/g, "/")));
      if (header && typeof header === "object" && "alg" in header) return "jwt-decode";
    } catch {
      /* not a JWT after all */
    }
  }

  // gzip: base64 whose decoded bytes start with the gzip magic number 1f 8b
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0) {
    try {
      const bin = atob(s);
      if (bin.charCodeAt(0) === 0x1f && bin.charCodeAt(1) === 0x8b) return "gzip-decode";
    } catch {
      /* not valid base64 */
    }
  }

  // URL-encoded: contains %XX escapes
  if (/%[0-9a-fA-F]{2}/.test(s)) return "url-decode";

  // HTML entities
  if (/&(amp|lt|gt|quot|#39);/.test(s)) return "html-entities-decode";

  // Hex: even-length, only hex chars/whitespace, and long enough that it's
  // unlikely to just be a short number someone typed
  const hexOnly = s.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]+$/.test(hexOnly) && hexOnly.length % 2 === 0 && hexOnly.length >= 8) {
    // MD5/SHA1/SHA256 hex digests are common paste targets too, but there's
    // no "decode" for a hash -- only offer hex-decode when it doesn't look
    // like a bare digest length (32/40/64), where decoding would just
    // produce binary noise nobody wants.
    if (![32, 40, 64].includes(hexOnly.length)) return "hex-decode";
  }

  // Base64: valid charset/padding and not just a plain word
  if (/^[A-Za-z0-9+/]{8,}={0,2}$/.test(s) && s.length % 4 === 0 && /[+/A-Z]/.test(s)) {
    try {
      atob(s);
      return "base64-decode";
    } catch {
      /* not valid base64 */
    }
  }

  return null;
}

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

const OP_LABELS: Record<CodecOp, string> = OPS.reduce((acc, g) => {
  for (const o of g.ops) acc[o.op] = `${g.group} → ${o.label}`;
  return acc;
}, {} as Record<CodecOp, string>);

export function Decoder() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastOp, setLastOp] = useState<CodecOp | null>(null);
  const [selectedOp, setSelectedOp] = useState<CodecOp | null>(null);
  const [guessFailed, setGuessFailed] = useState(false);

  const runOp = async (op: CodecOp) => {
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

  const convert = async () => {
    if (!selectedOp) return;
    await runOp(selectedOp);
  };

  const magic = async () => {
    setGuessFailed(false);
    const guess = guessOp(input);
    if (!guess) {
      setGuessFailed(true);
      return;
    }
    setSelectedOp(guess);
    await runOp(guess);
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
        <p className="page-sub">Pick an operation below, then hit Convert — Base64, URL, hex, HTML entities, Unicode, gzip, JWT, MD5/SHA1/SHA256.</p>
      </div>

      <div className="panel">
        <div className="stack">
          {OPS.map((group) => (
            <div key={group.group} className="row wrap" style={{ gap: 8 }}>
              <span className="muted" style={{ width: 170, flex: "0 0 170px" }}>
                {group.group}
              </span>
              {group.ops.map((o) => (
                <button key={o.op} className={`chip ${selectedOp === o.op ? "active" : ""}`} onClick={() => setSelectedOp(o.op)}>
                  {o.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <hr className="divider" />
        <div className="row between" style={{ gap: 12 }}>
          <span className="muted">
            {selectedOp ? (
              <>
                Ready to run: <b style={{ color: "var(--text)" }}>{OP_LABELS[selectedOp]}</b>
              </>
            ) : (
              "Select an operation above, or let Magic guess it from the input"
            )}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={magic} disabled={!input.trim()} title="Guess the encoding from the input and convert it">
              <IconAi size={13} /> Magic
            </button>
            <button className="btn btn-primary" onClick={convert} disabled={!selectedOp}>
              <IconPlay size={13} /> Convert →
            </button>
          </div>
        </div>
        {guessFailed && <div className="field-hint" style={{ marginTop: 8 }}>Couldn't confidently guess the encoding — pick one manually above.</div>}
      </div>

      <div className="split">
        <div className="panel stack">
          <div className="row between">
            <div className="panel-title">Input</div>
            <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(input)}>
              <IconCopy size={12} /> Copy
            </button>
          </div>
          <textarea
            rows={12}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") convert();
            }}
            placeholder="Paste text, a token, base64, hex… (Ctrl/Cmd+Enter to convert)"
          />
        </div>
        <div className="panel stack">
          <div className="row between">
            <div className="panel-title">Output {lastOp && <span className="muted">({OP_LABELS[lastOp]})</span>}</div>
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
    </div>
  );
}
