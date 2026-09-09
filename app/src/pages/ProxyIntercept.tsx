import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { InterceptPending, ScopeRule, WraithSettings } from "../../electron/types";
import { base64ToUtf8, utf8ToBase64 } from "../lib/base64";
import { IconPlus, IconX, IconShield } from "../lib/icons";
import { KV } from "../components/KeyValueEditor";
import { RequestEditor } from "../components/RequestEditor";
import { ResponseViewer, kvToHeadersRecord } from "../components/ResponseViewer";

interface EditableHeld {
  method: string;
  url: string;
  headers: KV[];
  bodyText: string;
  statusCode?: number;
  statusMessage?: string;
}

function headersRecordToKv(headers: Record<string, any>): KV[] {
  return Object.entries(headers || {}).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) }));
}

export function ProxyIntercept() {
  const { proxyStatus, toast } = useApp();
  const [settings, setSettings] = useState<WraithSettings | null>(null);
  const [queue, setQueue] = useState<InterceptPending[]>([]);
  const [edits, setEdits] = useState<Record<string, EditableHeld>>({});
  const [newScope, setNewScope] = useState("");

  useEffect(() => {
    window.wraith.settings.get().then(setSettings);
    const off = window.wraith.proxy.onInterceptPending((pending) => {
      setQueue((q) => [...q, pending]);
      setEdits((e) => ({
        ...e,
        [pending.id]:
          pending.direction === "request"
            ? {
                method: pending.request.method,
                url: pending.request.url,
                headers: headersRecordToKv(pending.request.headers),
                bodyText: base64ToUtf8(pending.request.body),
              }
            : {
                method: pending.request.method,
                url: pending.request.url,
                headers: headersRecordToKv(pending.response?.headers || {}),
                bodyText: base64ToUtf8(pending.response?.body || ""),
                statusCode: pending.response?.statusCode,
                statusMessage: pending.response?.statusMessage,
              },
      }));
    });
    return off;
  }, []);

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

  const resolve = (pending: InterceptPending, action: "forward" | "drop") => {
    const edit = edits[pending.id];
    const edited =
      action === "forward" && edit
        ? pending.direction === "request"
          ? { request: { method: edit.method, url: edit.url, headers: kvToHeadersRecord(edit.headers), body: utf8ToBase64(edit.bodyText) } }
          : {
              response: {
                statusCode: edit.statusCode ?? 200,
                statusMessage: edit.statusMessage ?? "OK",
                headers: kvToHeadersRecord(edit.headers),
                body: utf8ToBase64(edit.bodyText),
              },
            }
        : undefined;
    window.wraith.proxy.resolveIntercept({ id: pending.id, action, edited }).then(() => {
      setQueue((q) => q.filter((p) => p.id !== pending.id));
    });
  };

  const forwardAll = async () => {
    const n = await window.wraith.proxy.forwardAll();
    setQueue([]);
    toast(`Forwarded ${n} held item(s)`);
  };

  if (!settings) return null;
  const active = queue[0];
  const activeEdit = active ? edits[active.id] : null;

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
          {queue.length > 1 && (
            <button className="btn btn-sm" onClick={forwardAll}>
              Forward all ({queue.length})
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
        <div className="panel pulse-card">
          <div className="panel-header row between">
            <div className="panel-title">
              Held {active.direction === "request" ? "request" : "response"} — {active.host}
              {queue.length > 1 && <span className="muted"> (+{queue.length - 1} more queued)</span>}
            </div>
          </div>
          {active.direction === "request" ? (
            <RequestEditor
              value={activeEdit}
              onChange={(v) => setEdits((e) => ({ ...e, [active.id]: { ...e[active.id], ...v } }))}
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
              onChange={(v) =>
                setEdits((e) => ({
                  ...e,
                  [active.id]: { ...e[active.id], statusCode: v.statusCode, statusMessage: v.statusMessage, headers: v.headers, bodyText: v.bodyText },
                }))
              }
            />
          )}
          <hr className="divider" />
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-primary" onClick={() => resolve(active, "forward")}>
              Forward
            </button>
            <button className="btn btn-danger" onClick={() => resolve(active, "drop")}>
              Drop
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
