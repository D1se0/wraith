import { useState } from "react";
import { ChainStep, applySubstitution, blankStep, extractValue } from "../lib/chain";
import { toPythonChain } from "../lib/codegen";
import { RequestEditor } from "../components/RequestEditor";
import { KeyValueEditor } from "../components/KeyValueEditor";
import { base64ToUtf8, utf8ToBase64 } from "../lib/base64";
import { copyToClipboard } from "../lib/format";
import { IconPlay, IconPlus, IconTrash, IconCode, IconCopy, IconLink } from "../lib/icons";
import { useApp } from "../context/AppContext";

export function Chain() {
  const { toast } = useApp();
  const [steps, setSteps] = useState<ChainStep[]>([blankStep(1)]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const updateStep = (id: string, patch: Partial<ChainStep>) => setSteps((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStep = (id: string) => setSteps((cur) => cur.filter((s) => s.id !== id));
  const addStep = () => setSteps((cur) => [...cur, blankStep(cur.length + 1)]);
  const move = (id: string, dir: -1 | 1) => {
    setSteps((cur) => {
      const idx = cur.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (target < 0 || target >= cur.length) return cur;
      const next = cur.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const runChain = async () => {
    setRunning(true);
    let runningVars: Record<string, string> = {};
    const nextSteps = steps.map((s) => ({ ...s }));
    for (let i = 0; i < nextSteps.length; i++) {
      const step = nextSteps[i];
      const substituted = applySubstitution(step.request, runningVars);
      try {
        const exchange = await window.wraith.repeater.send({
          method: substituted.method,
          url: substituted.url,
          headers: substituted.headers,
          bodyBase64: utf8ToBase64(substituted.bodyText),
          insecure: step.insecure,
        });
        const bodyText = base64ToUtf8(exchange.response?.body || "");
        const extracted: Record<string, string> = {};
        for (const ex of step.extracts) {
          if (!ex.varName.trim()) continue;
          const v = extractValue(bodyText, ex.source);
          if (v !== null) {
            extracted[ex.varName] = v;
            runningVars[ex.varName] = v;
          }
        }
        nextSteps[i] = { ...step, lastStatusCode: exchange.response?.statusCode ?? 0, lastBodyPreview: bodyText.slice(0, 1000), lastExtracted: extracted, lastError: undefined };
      } catch (err: any) {
        nextSteps[i] = { ...step, lastError: err?.message || String(err), lastStatusCode: undefined, lastBodyPreview: undefined, lastExtracted: undefined };
        toast(`Step "${step.label}" failed: ${err?.message || err}`, "error");
        break;
      }
      setSteps(nextSteps.slice());
      setVars({ ...runningVars });
    }
    setRunning(false);
  };

  const exportPython = () => {
    const code = toPythonChain(steps);
    copyToClipboard(code);
    toast("Python PoC copied to clipboard");
  };

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1 className="page-title">Attack Chain</h1>
          <p className="page-sub">
            Build a multi-step request sequence where a later step can use a value extracted from an earlier one — e.g. log in, extract a
            token, use it in the next request. Reference a variable anywhere in a URL, header or body with {"{{"}varName{"}}"}.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowExport((v) => !v)}>
            <IconCode size={13} /> Export PoC
          </button>
          <button className="btn btn-primary" onClick={runChain} disabled={running}>
            <IconPlay size={13} /> {running ? "Running…" : "Run chain"}
          </button>
        </div>
      </div>

      {showExport && (
        <div className="panel stack-sm">
          <div className="row between">
            <div className="panel-title">Python PoC</div>
            <button className="btn btn-ghost btn-sm" onClick={exportPython}>
              <IconCopy size={12} /> Copy
            </button>
          </div>
          <pre className="codebox" style={{ maxHeight: 320 }}>
            {toPythonChain(steps)}
          </pre>
        </div>
      )}

      {Object.keys(vars).length > 0 && (
        <div className="panel row wrap" style={{ gap: 10 }}>
          <span className="muted">Extracted variables:</span>
          {Object.entries(vars).map(([k, v]) => (
            <span key={k} className="badge">
              {k} = {v.length > 40 ? v.slice(0, 40) + "…" : v}
            </span>
          ))}
        </div>
      )}

      {steps.map((step, i) => (
        <div key={step.id} className="panel stack">
          <div className="row between">
            <div className="row" style={{ gap: 8 }}>
              <span className="step-num">{i + 1}</span>
              <input type="text" value={step.label} onChange={(e) => updateStep(step.id, { label: e.target.value })} style={{ fontWeight: 700 }} />
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => move(step.id, -1)} disabled={i === 0}>
                ↑
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => move(step.id, 1)} disabled={i === steps.length - 1}>
                ↓
              </button>
              <button className="btn btn-ghost btn-icon" onClick={() => removeStep(step.id)}>
                <IconTrash size={13} />
              </button>
            </div>
          </div>

          <RequestEditor value={step.request} onChange={(request) => updateStep(step.id, { request })} compactMethod />

          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={step.insecure} onChange={(e) => updateStep(step.id, { insecure: e.target.checked })} />
            Ignore TLS errors
          </label>

          <div className="field">
            <label className="row" style={{ gap: 6 }}>
              <IconLink size={12} /> Extract variables from this step's response
            </label>
            <KeyValueEditor
              rows={step.extracts.map((e) => ({ key: e.varName, value: e.source }))}
              onChange={(rows) => updateStep(step.id, { extracts: rows.map((r) => ({ varName: r.key, source: r.value })) })}
              keyPlaceholder="varName"
              valuePlaceholder="json:$.data.token or regex:token=(\w+)"
            />
          </div>

          {step.lastError && <div className="badge badge-5xx">{step.lastError}</div>}
          {step.lastStatusCode !== undefined && (
            <div className="stack-sm">
              <div className="row" style={{ gap: 8 }}>
                <span className={`badge ${step.lastStatusCode < 300 ? "badge-2xx" : step.lastStatusCode < 400 ? "badge-3xx" : step.lastStatusCode < 500 ? "badge-4xx" : "badge-5xx"}`}>
                  {step.lastStatusCode}
                </span>
                {step.lastExtracted && Object.keys(step.lastExtracted).length > 0 && (
                  <span className="muted">extracted: {Object.keys(step.lastExtracted).join(", ")}</span>
                )}
              </div>
              <pre className="codebox" style={{ maxHeight: 160 }}>
                {step.lastBodyPreview}
              </pre>
            </div>
          )}
        </div>
      ))}

      <button className="btn btn-sm" onClick={addStep} style={{ alignSelf: "flex-start" }}>
        <IconPlus size={13} /> Add step
      </button>
    </div>
  );
}
