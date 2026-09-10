import { useState } from "react";
import { Exchange } from "../../electron/types";
import { toPythonRequests, toJsFetch, toGoNetHttp } from "../lib/codegen";
import { copyToClipboard } from "../lib/format";
import { IconCode, IconCopy } from "../lib/icons";

type Lang = "python" | "js" | "go";
const LANGS: { id: Lang; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "js", label: "JavaScript" },
  { id: "go", label: "Go" },
];

function generate(lang: Lang, exchange: Exchange): string {
  if (lang === "python") return toPythonRequests(exchange);
  if (lang === "js") return toJsFetch(exchange);
  return toGoNetHttp(exchange);
}

export function ExportCodeButton({ exchange }: { exchange: Exchange }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("python");

  return (
    <div className="stack-sm">
      <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
        <IconCode size={12} /> {open ? "Hide" : "Export code"}
      </button>
      {open && (
        <div className="stack-sm">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {LANGS.map((l) => (
              <button key={l.id} className={`tab-btn ${lang === l.id ? "active" : ""}`} onClick={() => setLang(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="row between">
            <span className="field-hint">Assumes a plain-text body; binary bodies are omitted.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(generate(lang, exchange))}>
              <IconCopy size={12} /> Copy
            </button>
          </div>
          <pre className="codebox" style={{ maxHeight: 320 }}>
            {generate(lang, exchange)}
          </pre>
        </div>
      )}
    </div>
  );
}
