import { useEffect, useState } from "react";
import { HighlightRule, ExchangeTag, WraithSettings } from "../../electron/types";
import { IconPlus, IconTrash, IconExternal } from "../lib/icons";
import { GITHUB_REPO_URL } from "../lib/constants";
import { useApp } from "../context/AppContext";

const TAGS: ExchangeTag[] = ["json", "graphql", "html", "xml", "js", "css", "image", "auth", "cookie", "form", "error", "websocket"];

export function Settings() {
  const { toast } = useApp();
  const [settings, setSettings] = useState<WraithSettings | null>(null);
  const [version, setVersion] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");

  useEffect(() => {
    window.wraith.settings.get().then(setSettings);
    window.wraith.app.getVersion().then(setVersion);
  }, []);

  if (!settings) return null;

  const save = async (patch: Partial<WraithSettings>) => {
    const next = await window.wraith.settings.update(patch);
    setSettings(next);
  };

  const saveProxy = (patch: Partial<WraithSettings["proxy"]>) => save({ proxy: { ...settings.proxy, ...patch } });

  const updateRule = (id: string, patch: Partial<HighlightRule>) => {
    save({ highlightRules: settings.highlightRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  };
  const removeRule = (id: string) => save({ highlightRules: settings.highlightRules.filter((r) => r.id !== id) });
  const addRule = () => {
    const rule: HighlightRule = { id: `hl-${Date.now()}`, label: "New rule", enabled: true, color: "#4fb0ff", matchTag: "json", matchScope: "any" };
    save({ highlightRules: [...settings.highlightRules, rule] });
  };

  const purge = async () => {
    if (purgeConfirm !== "DELETE") return;
    await window.wraith.app.purgeAllData();
    toast("All Wraith data purged. Restart the app.", "error");
    setPurgeConfirm("");
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Everything lives under one data folder — nothing scattered, nothing left behind.</p>
      </div>

      <div className="panel">
        <div className="panel-title">Proxy</div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Port</label>
            <input type="number" value={settings.proxy.port} onChange={(e) => saveProxy({ port: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Host</label>
            <input type="text" value={settings.proxy.host} onChange={(e) => saveProxy({ host: e.target.value })} />
            <span className="field-hint">0.0.0.0 listens on every interface (needed for other devices to use it as a proxy).</span>
          </div>
          <div className="field">
            <label>Max body capture (MB)</label>
            <input
              type="number"
              value={Math.round(settings.proxy.maxBodyCaptureBytes / 1024 / 1024)}
              onChange={(e) => saveProxy({ maxBodyCaptureBytes: Number(e.target.value) * 1024 * 1024 })}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={settings.proxy.allowInsecureUpstream} onChange={(e) => saveProxy({ allowInsecureUpstream: e.target.checked })} />
              Allow self-signed upstream TLS
            </label>
          </div>
        </div>
        <span className="field-hint">Changing port/host takes effect the next time you start the proxy.</span>
      </div>

      <div className="panel">
        <div className="row between">
          <div className="panel-title">Highlight rules</div>
          <button className="btn btn-sm" onClick={addRule}>
            <IconPlus size={12} /> Add rule
          </button>
        </div>
        <div className="stack-sm" style={{ marginTop: 10 }}>
          {settings.highlightRules.map((r) => (
            <div key={r.id} className="row wrap" style={{ gap: 8 }}>
              <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} />
              <input type="color" value={r.color} onChange={(e) => updateRule(r.id, { color: e.target.value })} />
              <input type="text" value={r.label} onChange={(e) => updateRule(r.id, { label: e.target.value })} style={{ width: 140 }} />
              <select value={r.matchTag || ""} onChange={(e) => updateRule(r.id, { matchTag: (e.target.value || undefined) as ExchangeTag | undefined })} style={{ width: 140 }}>
                <option value="">(any tag)</option>
                {TAGS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost btn-icon" onClick={() => removeRule(r.id)}>
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title" style={{ color: "var(--danger)" }}>
          Danger zone
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Deletes settings, history and the CA certificate. The proxy will generate a fresh CA next time it starts, so your browser will need to
          trust it again.
        </p>
        <div className="row">
          <input type="text" placeholder='type "DELETE" to confirm' value={purgeConfirm} onChange={(e) => setPurgeConfirm(e.target.value)} style={{ width: 220 }} />
          <button className="btn btn-danger" disabled={purgeConfirm !== "DELETE"} onClick={purge}>
            Purge all Wraith data
          </button>
        </div>
      </div>

      <div className="panel row between">
        <div className="muted">
          Wraith v{version} · {window.wraith.app.platform}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.wraith.app.openExternal(GITHUB_REPO_URL)}>
          <IconExternal size={12} /> GitHub
        </button>
      </div>
    </div>
  );
}
