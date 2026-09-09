import { useEffect, useRef, useState } from "react";
import { useApp, EditableHeld } from "../context/AppContext";
import { InterceptPending, ScopeRule, WraithSettings } from "../../electron/types";
import { base64ToUtf8, utf8ToBase64 } from "../lib/base64";
import { IconPlus, IconX, IconShield, IconRepeat } from "../lib/icons";
import { RequestEditor } from "../components/RequestEditor";
import { ResponseViewer, kvToHeadersRecord } from "../components/ResponseViewer";

export function ProxyIntercept() {
  const {
    proxyStatus,
    toast,
    interceptQueue,
    interceptEdits,
    setInterceptEdit,
    resolveIntercept,
    forwardAllIntercepts,
    interceptArrivalTick,
    sendToRepeater,
  } = useApp();
  const [settings, setSettings] = useState<WraithSettings | null>(null);
  const [newScope, setNewScope] = useState("");
  const [flashing, setFlashing] = useState(false);
  const firstTick = useRef(true);

  useEffect(() => {
    window.wraith.settings.get().then(setSettings);
  }, []);

  // Flash red for ~1.8s whenever a new item lands, then settle back to the
  // steady amber "something is waiting" glow. Skip the very first render
  // (arrival tick starts at 0, nothing has actually "just arrived" yet).
  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false;
      return;
    }
    if (settings && !settings.general.interceptAlertEnabled) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interceptArrivalTick]);

  const updateSetting = async (patch: Partial<WraithSettings["proxy"]>) => {
    if (!settings) return;
    const next = await window.wraith.settings.update({ proxy: { ...settings.proxy, ...patch } });
    setSettings(next);
  };

  const addScope = () => {
    if (!newScope.trim() || !settings) return;
    const rule: ScopeRule = { id: `scope-${Date.now()}`, pattern: newScope.trim(), enabled: true };
    updateSetting({ interceptScope: [...settings.proxy.interceptScope, rule] });
    setNewScope("");
  };

  const drop = (pending: InterceptPending) => {
    if (settings?.general.confirmBeforeDrop && !confirm("Drop this request/response?")) return;
    resolveIntercept(pending, "drop");
  };

  const forwardAll = async () => {
    const n = await forwardAllIntercepts();
    toast(`Forwarded ${n} held item(s)`);
  };

  const sendActiveToRepeater = (pending: InterceptPending, edit: EditableHeld | null) => {
    if (pending.direction === "request" && edit) {
      sendToRepeater({ method: edit.method, url: edit.url, headers: edit.headers, body: edit.bodyText });
    } else {
      sendToRepeater({
        method: pending.request.method,
        url: pending.request.url,
        headers: Object.entries(pending.request.headers).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) })),
        body: base64ToUtf8(pending.request.body),
      });
    }
    toast("Sent to Repeater");
  };

  if (!settings) return null;
  const active = interceptQueue[0];
  const activeEdit = active ? interceptEdits[active.id] : null;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Intercept</h1>
        <p className="page-sub">Hold traffic in flight, edit it, then forward or drop it — like Burp's Proxy tab, without the clutter.</p>
      </div>

      <div className="panel">
        <div className="row wrap" style={{ gap: 20 }}>
          <Toggle label="Intercept requests" checked={settings.proxy.interceptRequests} onChange={(v) => updateSetting({ interceptRequests: v })} />
          <Toggle label="Intercept responses" checked={settings.proxy.interceptResponses} onChange={(v) => updateSetting({ interceptResponses: v })} />
          {interceptQueue.length > 1 && (
            <button className="btn btn-sm" onClick={forwardAll}>
              Forward all ({interceptQueue.length})
            </button>
          )}
        </div>
        <hr className="divider" />
        <div className="field">
          <label>Scope (empty = intercept everything). Prefix a pattern with re: for regex.</label>
          <div className="row wrap" style={{ gap: 8 }}>
            {settings.proxy.interceptScope.map((rule) => (
              <span key={rule.id} className="chip active" style={{ opacity: rule.enabled ? 1 : 0.5, cursor: "default" }}>
                {rule.pattern}
                <button
                  className="btn-ghost"
                  style={{ background: "none", border: "none", padding: 0, display: "flex", color: "inherit", cursor: "pointer" }}
                  onClick={() => updateSetting({ interceptScope: settings.proxy.interceptScope.filter((r) => r.id !== rule.id) })}
                >
                  <IconX size={11} />
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="e.g. api.target.com or re:/graphql$"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addScope()}
              style={{ width: 220 }}
            />
            <button className="btn btn-sm" onClick={addScope}>
              <IconPlus size={12} /> Add
            </button>
          </div>
        </div>
      </div>

      {!settings.proxy.interceptRequests && !settings.proxy.interceptResponses && (
        <div className="panel empty-state">
          <IconShield size={28} />
          <div>Intercept is off — traffic is flowing straight through. Check the History tab, or enable a toggle above.</div>
        </div>
      )}

      {!proxyStatus.running && (
        <div className="panel">
          <span className="muted">Proxy isn't running — start it from Setup or the sidebar status pill.</span>
        </div>
      )}

      {active && activeEdit && (
        <div className={`panel pulse-card ${flashing ? "pulse-card-flash" : ""}`}>
          <div className="panel-header row between">
            <div className="panel-title">
              Held {active.direction === "request" ? "request" : "response"} — {active.host}
              {interceptQueue.length > 1 && <span className="muted"> (+{interceptQueue.length - 1} more queued)</span>}
            </div>
          </div>
          {active.direction === "request" ? (
            <RequestEditor
              value={activeEdit}
              onChange={(v) => setInterceptEdit(active.id, v)}
            />
          ) : (
            <ResponseViewer
              editable
              response={{
                statusCode: activeEdit.statusCode ?? 200,
                statusMessage: activeEdit.statusMessage ?? "OK",
                headers: kvToHeadersRecord(activeEdit.headers),
                body: utf8ToBase64(activeEdit.bodyText),
                bodyTruncated: false,
                timeMs: 0,
              }}
              onChange={(v) => setInterceptEdit(active.id, { statusCode: v.statusCode, statusMessage: v.statusMessage, headers: v.headers, bodyText: v.bodyText })}
            />
          )}
          <hr className="divider" />
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-primary" onClick={() => resolveIntercept(active, "forward")}>
              Forward
            </button>
            <button className="btn btn-danger" onClick={() => drop(active)}>
              Drop
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => sendActiveToRepeater(active, activeEdit)}>
              <IconRepeat size={13} /> Send to Repeater
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row" style={{ gap: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
