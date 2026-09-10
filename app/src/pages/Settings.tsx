import { useEffect, useRef, useState } from "react";
import { HighlightRule, ExchangeTag, WraithSettings, DiscoveredCertInfo, NetworkInterfaceInfo, MatchReplaceRule, MatchReplaceScope, MatchReplaceTarget } from "../../electron/types";
import { IconPlus, IconTrash, IconExternal, IconShield, IconAi, IconCheck, IconWarning, IconDownload, IconUpload } from "../lib/icons";
import { GITHUB_REPO_URL } from "../lib/constants";
import { useApp } from "../context/AppContext";
import { buildSession, applySession, WraithSession } from "../lib/session";

const TAGS: ExchangeTag[] = ["json", "graphql", "html", "xml", "js", "css", "image", "auth", "cookie", "form", "error", "websocket"];

const AI_MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (most capable, slower)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (recommended)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest, cheapest)" },
];

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
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const sessionInputRef = useRef<HTMLInputElement | null>(null);

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
  const saveAi = (patch: Partial<WraithSettings["ai"]>) => save({ ai: { ...settings.ai, ...patch } });

  const testAiConnection = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await window.wraith.ai.testConnection();
      setAiTestResult(res.ok ? { ok: true, message: `Connected (${res.model}).` } : { ok: false, message: res.error || "Connection failed." });
    } finally {
      setTestingAi(false);
    }
  };

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

  const saveMatchReplaceRules = (rules: MatchReplaceRule[]) => save({ proxy: { ...settings.proxy, matchReplaceRules: rules } });
  const updateMrRule = (id: string, patch: Partial<MatchReplaceRule>) =>
    saveMatchReplaceRules(settings.proxy.matchReplaceRules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeMrRule = (id: string) => saveMatchReplaceRules(settings.proxy.matchReplaceRules.filter((r) => r.id !== id));
  const addMrRule = () => {
    const rule: MatchReplaceRule = {
      id: `mr-${Date.now()}`,
      enabled: true,
      label: "New rule",
      scope: "request",
      target: "header",
      headerName: "User-Agent",
      matchType: "text",
      match: "",
      replace: "",
    };
    saveMatchReplaceRules([...settings.proxy.matchReplaceRules, rule]);
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

  const exportSession = async () => {
    const session = await buildSession();
    const path = await window.wraith.app.chooseSaveFile("session.wraith");
    if (!path) return;
    try {
      await window.wraith.app.writeFile({ path, content: JSON.stringify(session, null, 2), encoding: "utf-8" });
      toast(`Exported session (${session.history.length} history, ${session.findings.length} findings, ${session.identities.length} identities) to ${path}`);
    } catch (err: any) {
      toast(`Export failed: ${err?.message || err}`, "error");
    }
  };

  const importSession = async (file: File) => {
    try {
      const text = await file.text();
      const session = JSON.parse(text) as WraithSession;
      const result = await applySession(session);
      toast(`Imported session: ${result.historyCount} history, ${result.findingsCount} findings, ${result.identitiesCount} identities.`);
      window.wraith.settings.get().then(setSettings);
    } catch (err: any) {
      toast(`Import failed: ${err?.message || err}`, "error");
    }
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
        <div className="panel-header">
          <IconAi size={18} style={{ color: "var(--accent-a)" }} />
          <div>
            <div className="panel-title">AI</div>
            <div className="panel-sub">Powers the "Ask Claude" buttons and the agentic AI page. Uses your own Anthropic API key.</div>
          </div>
        </div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Anthropic API key</label>
            <input
              type="password"
              value={settings.ai.apiKey}
              onChange={(e) => saveAi({ apiKey: e.target.value })}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
            <span className="field-hint">
              From{" "}
              <a className="link" style={{ cursor: "pointer" }} onClick={() => window.wraith.app.openExternal("https://console.anthropic.com/settings/keys")}>
                console.anthropic.com
              </a>
              . This is a developer API key, not your claude.ai login — there's no supported way for a desktop app to use a Pro/Max
              subscription directly. Stored locally, never sent anywhere except Anthropic's API.
            </span>
          </div>
          <div className="field">
            <label>Model</label>
            <select value={settings.ai.model} onChange={(e) => saveAi({ model: e.target.value })}>
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 10 }}>
          <button className="btn btn-sm" disabled={!settings.ai.apiKey || testingAi} onClick={testAiConnection}>
            {testingAi ? "Testing…" : "Test connection"}
          </button>
          {aiTestResult && (
            <div className={`row badge ${aiTestResult.ok ? "badge-2xx" : "badge-5xx"}`} style={{ gap: 6, width: "fit-content" }}>
              {aiTestResult.ok ? <IconCheck size={12} /> : <IconWarning size={12} />}
              {aiTestResult.message}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">General</div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Theme</label>
            <div className="row" style={{ gap: 8 }}>
              <button
                className={`chip ${settings.theme === "wraith-dark" ? "active" : ""}`}
                onClick={() => {
                  document.documentElement.setAttribute("data-theme", "dark");
                  save({ theme: "wraith-dark" });
                }}
              >
                Dark
              </button>
              <button
                className={`chip ${settings.theme === "wraith-light" ? "active" : ""}`}
                onClick={() => {
                  document.documentElement.setAttribute("data-theme", "light");
                  save({ theme: "wraith-light" });
                }}
              >
                Light
              </button>
            </div>
          </div>
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
        <div className="row between">
          <div>
            <div className="panel-title">Match &amp; Replace</div>
            <div className="panel-sub">Global find/replace rules applied to every request/response through the proxy — rewrite headers, URLs or body text on the fly.</div>
          </div>
          <button className="btn btn-sm" onClick={addMrRule}>
            <IconPlus size={12} /> Add rule
          </button>
        </div>
        <div className="stack-sm" style={{ marginTop: 10 }}>
          {settings.proxy.matchReplaceRules.length === 0 && <div className="muted">No rules yet.</div>}
          {settings.proxy.matchReplaceRules.map((r) => (
            <div key={r.id} className="row wrap" style={{ gap: 8 }}>
              <input type="checkbox" checked={r.enabled} onChange={(e) => updateMrRule(r.id, { enabled: e.target.checked })} />
              <input type="text" value={r.label} onChange={(e) => updateMrRule(r.id, { label: e.target.value })} style={{ width: 120 }} />
              <select value={r.scope} onChange={(e) => updateMrRule(r.id, { scope: e.target.value as MatchReplaceScope })} style={{ width: 100 }}>
                <option value="request">Request</option>
                <option value="response">Response</option>
              </select>
              <select value={r.target} onChange={(e) => updateMrRule(r.id, { target: e.target.value as MatchReplaceTarget })} style={{ width: 100 }}>
                <option value="header">Header</option>
                <option value="url">URL</option>
                <option value="body">Body</option>
              </select>
              {r.target === "header" && (
                <input
                  type="text"
                  value={r.headerName || ""}
                  onChange={(e) => updateMrRule(r.id, { headerName: e.target.value })}
                  placeholder="Header name"
                  style={{ width: 130 }}
                />
              )}
              <select value={r.matchType} onChange={(e) => updateMrRule(r.id, { matchType: e.target.value as "text" | "regex" })} style={{ width: 80 }}>
                <option value="text">Text</option>
                <option value="regex">Regex</option>
              </select>
              <input type="text" value={r.match} onChange={(e) => updateMrRule(r.id, { match: e.target.value })} placeholder="Match" style={{ width: 130 }} />
              <span className="muted">→</span>
              <input type="text" value={r.replace} onChange={(e) => updateMrRule(r.id, { replace: e.target.value })} placeholder="Replace" style={{ width: 130 }} />
              <button className="btn btn-ghost btn-icon" onClick={() => removeMrRule(r.id)}>
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
        <span className="field-hint">
          Response body rewriting only applies while "Intercept Responses" is on (the body has to be fully buffered first) — header and URL rewrites always apply. Takes effect immediately, no proxy restart needed.
        </span>
      </div>

      <div className="panel">
        <div className="panel-title">Session</div>
        <p className="muted" style={{ marginTop: 6 }}>
          Save History, Findings, Identities and proxy config (incl. Match &amp; Replace rules) to a single portable <code className="mono">.wraith</code> file — hand
          it to a teammate or archive an engagement. Doesn't include the AI API key.
        </p>
        <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
          <button className="btn btn-sm" onClick={exportSession}>
            <IconDownload size={13} /> Export session
          </button>
          <input
            ref={sessionInputRef}
            type="file"
            accept=".wraith,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importSession(f);
              e.target.value = "";
            }}
          />
          <button className="btn btn-sm" onClick={() => sessionInputRef.current?.click()}>
            <IconUpload size={13} /> Import session
          </button>
        </div>
        <span className="field-hint">Importing adds to your current History/Findings/Identities, and overwrites your proxy settings, highlight rules and general prefs.</span>
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
