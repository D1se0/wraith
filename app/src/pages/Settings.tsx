import { useEffect, useState } from "react";
import { HighlightRule, ExchangeTag, WraithSettings, DiscoveredCertInfo, NetworkInterfaceInfo } from "../../electron/types";
import { IconPlus, IconTrash, IconExternal, IconShield } from "../lib/icons";
import { GITHUB_REPO_URL } from "../lib/constants";
import { useApp } from "../context/AppContext";

const TAGS: ExchangeTag[] = ["json", "graphql", "html", "xml", "js", "css", "image", "auth", "cookie", "form", "error", "websocket"];

function toHexColor(hexNoHash: string): string {
  return hexNoHash.startsWith("#") ? hexNoHash : `#${hexNoHash}`;
}
function stripHash(hex: string): string {
  return hex.replace(/^#/, "");
}

export function Settings() {
  const { toast } = useApp();
  const [settings, setSettings] = useState<WraithSettings | null>(null);
  const [version, setVersion] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [cert, setCert] = useState<DiscoveredCertInfo | null>(null);
  const [interfaces, setInterfaces] = useState<NetworkInterfaceInfo["name"][]>([]);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    window.wraith.settings.get().then(setSettings);
    window.wraith.app.getVersion().then(setVersion);
    window.wraith.ca.info().then(setCert).catch(() => undefined);
    window.wraith.capture.listInterfaces().then((ifaces: any[]) => setInterfaces(ifaces.map((i) => i.id)));
  }, []);

  if (!settings) return null;

  const save = async (patch: Partial<WraithSettings>) => {
    const next = await window.wraith.settings.update(patch);
    setSettings(next);
  };

  const saveProxy = (patch: Partial<WraithSettings["proxy"]>) => save({ proxy: { ...settings.proxy, ...patch } });
  const saveGeneral = (patch: Partial<WraithSettings["general"]>) => save({ general: { ...settings.general, ...patch } });

  const setAccent = (which: "accentFrom" | "accentTo", hex: string) => {
    const clean = stripHash(hex);
    document.documentElement.style.setProperty(which === "accentFrom" ? "--accent-a" : "--accent-b", toHexColor(clean));
    saveGeneral({ [which]: clean } as Partial<WraithSettings["general"]>);
  };

  const updateRule = (id: string, patch: Partial<HighlightRule>) => {
    save({ highlightRules: settings.highlightRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  };
  const removeRule = (id: string) => save({ highlightRules: settings.highlightRules.filter((r) => r.id !== id) });
  const addRule = () => {
    const rule: HighlightRule = { id: `hl-${Date.now()}`, label: "New rule", enabled: true, color: "#4fb0ff", matchTag: "json", matchScope: "any" };
    save({ highlightRules: [...settings.highlightRules, rule] });
  };

  const regenerateCa = async () => {
    if (!confirm("This invalidates the old certificate everywhere it's currently trusted — you'll need to re-trust the new one. Continue?")) return;
    setRegenerating(true);
    try {
      const info = await window.wraith.ca.regenerate();
      setCert(info);
      toast(info ? "New CA generated." : "CA cleared — a new one will be generated next time you start the proxy.");
    } finally {
      setRegenerating(false);
    }
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
        <div className="panel-header">
          <IconShield size={18} style={{ color: "var(--accent-a)" }} />
          <div>
            <div className="panel-title">Certificate Authority</div>
            <div className="panel-sub">The self-signed root CA the proxy uses to terminate HTTPS.</div>
          </div>
        </div>
        {!cert ? (
          <div className="muted">No certificate yet — start the proxy once to generate one.</div>
        ) : (
          <div className="stack-sm">
            <div className="mono faint" style={{ wordBreak: "break-all" }}>
              SHA-256 {cert.fingerprintSha256}
            </div>
          </div>
        )}
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button
            className="btn btn-sm"
            disabled={!cert}
            onClick={async () => {
              const dest = await window.wraith.ca.exportToDesktop();
              toast(`Exported to ${dest}`);
            }}
          >
            Export cert to Desktop
          </button>
          <button className="btn btn-sm" disabled={!cert} onClick={() => window.wraith.ca.openFolder()}>
            Open certificate folder
          </button>
          <button className="btn btn-danger btn-sm" disabled={regenerating} onClick={regenerateCa}>
            {regenerating ? "Regenerating…" : "Regenerate CA certificate"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">General</div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>History limit</label>
            <input type="number" value={settings.general.historyLimit} onChange={(e) => saveGeneral({ historyLimit: Number(e.target.value) })} />
            <span className="field-hint">How many exchanges History keeps in memory before dropping the oldest.</span>
          </div>
          <div className="field">
            <label>Default capture interface</label>
            <select value={settings.general.defaultCaptureInterface} onChange={(e) => saveGeneral({ defaultCaptureInterface: e.target.value })}>
              <option value="">(none — ask each time)</option>
              {interfaces.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Default wordlist</label>
            <div className="row">
              <input type="text" value={settings.general.defaultWordlist} placeholder="(auto-detect rockyou.txt)" onChange={(e) => saveGeneral({ defaultWordlist: e.target.value })} />
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const p = await window.wraith.app.chooseFile();
                  if (p) saveGeneral({ defaultWordlist: p });
                }}
              >
                Browse
              </button>
            </div>
            <span className="field-hint">Manual override for the Cracker/JWT default wordlist — leave empty to auto-detect rockyou.txt.</span>
          </div>
          <div className="field">
            <label>Accent color</label>
            <div className="row" style={{ gap: 10 }}>
              <input type="color" value={toHexColor(settings.general.accentFrom)} onChange={(e) => setAccent("accentFrom", e.target.value)} />
              <input type="color" value={toHexColor(settings.general.accentTo)} onChange={(e) => setAccent("accentTo", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={settings.general.confirmBeforeDrop} onChange={(e) => saveGeneral({ confirmBeforeDrop: e.target.checked })} />
              Confirm before dropping a held request/response
            </label>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={settings.general.interceptAlertEnabled} onChange={(e) => saveGeneral({ interceptAlertEnabled: e.target.checked })} />
              Flash red when Intercept captures something
            </label>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={settings.general.openDevToolsOnStart} onChange={(e) => saveGeneral({ openDevToolsOnStart: e.target.checked })} />
              Open DevTools automatically on launch
            </label>
            <span className="field-hint">Takes effect next launch.</span>
          </div>
        </div>
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
