import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { DiscoveredCertInfo, NetworkInterfaceInfo, WraithSettings } from "../../electron/types";
import { IconShield, IconCopy, IconPlay, IconStop, IconExternal, IconCheck } from "../lib/icons";
import { copyToClipboard } from "../lib/format";
import { GITHUB_REPO_URL } from "../lib/constants";

type BrowserTab = "firefox" | "chrome" | "system";

export function Welcome() {
  const { proxyStatus, refreshProxyStatus, toast, setPage } = useApp();
  const [ips, setIps] = useState<NetworkInterfaceInfo[]>([]);
  const [settings, setSettings] = useState<WraithSettings | null>(null);
  const [cert, setCert] = useState<DiscoveredCertInfo | null>(null);
  const [tab, setTab] = useState<BrowserTab>("firefox");
  const [busy, setBusy] = useState(false);

  const load = () => {
    window.wraith.network.list().then(setIps).catch(() => undefined);
    window.wraith.settings.get().then(setSettings).catch(() => undefined);
    window.wraith.ca.info().then(setCert).catch(() => undefined);
  };

  useEffect(load, []);

  const primaryIp = ips.find((i) => !i.internal && i.family === "IPv4")?.address || "127.0.0.1";
  const port = settings?.proxy.port ?? 8081;

  const toggleProxy = async () => {
    setBusy(true);
    try {
      if (proxyStatus.running) {
        await window.wraith.proxy.stop();
        toast("Proxy stopped");
      } else {
        const res = await window.wraith.proxy.start();
        if (!res.ok) {
          toast(res.error || "Failed to start proxy", "error");
        } else {
          toast(`Proxy listening on ${primaryIp}:${port}`);
        }
      }
    } finally {
      refreshProxyStatus();
      load();
      setBusy(false);
    }
  };

  const finish = async () => {
    await window.wraith.settings.update({ firstRunComplete: true });
    setPage("proxy");
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">
          Welcome to <span className="grad-text">Wraith</span>
        </h1>
        <p className="page-sub">Point a browser at Wraith's proxy and every request/response becomes inspectable, editable, and replayable.</p>
      </div>

      <div className="panel">
        <div className="panel-header row between">
          <div>
            <div className="panel-title">1. Start the proxy</div>
            <div className="panel-sub">Wraith listens locally and MITMs traffic your browser sends through it.</div>
          </div>
          <button className={`btn ${proxyStatus.running ? "btn-danger" : "btn-primary"}`} onClick={toggleProxy} disabled={busy}>
            {proxyStatus.running ? <IconStop size={14} /> : <IconPlay size={14} />}
            {proxyStatus.running ? "Stop proxy" : "Start proxy"}
          </button>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          {ips
            .filter((i) => i.family === "IPv4")
            .map((i) => (
              <button
                key={i.name + i.address}
                className="chip"
                onClick={() => {
                  copyToClipboard(i.address);
                  toast(`Copied ${i.address}`);
                }}
                title={`${i.name}${i.internal ? " (loopback)" : ""} — click to copy`}
              >
                {i.address}
                <IconCopy size={11} />
              </button>
            ))}
          <span className="chip" style={{ cursor: "default" }}>
            port <b style={{ marginLeft: 4 }}>{port}</b>
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">2. Configure your browser</div>
            <div className="panel-sub">Use {primaryIp} and port {port} as the proxy address. "*" as the pattern proxies everything.</div>
          </div>
        </div>
        <div className="tabs">
          <button className={`tab-btn ${tab === "firefox" ? "active" : ""}`} onClick={() => setTab("firefox")}>
            Firefox + FoxyProxy
          </button>
          <button className={`tab-btn ${tab === "chrome" ? "active" : ""}`} onClick={() => setTab("chrome")}>
            Chrome / Chromium
          </button>
          <button className={`tab-btn ${tab === "system" ? "active" : ""}`} onClick={() => setTab("system")}>
            System-wide
          </button>
        </div>

        {tab === "firefox" && (
          <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Step n={1}>Install the FoxyProxy extension from addons.mozilla.org.</Step>
            <Step n={2}>Open FoxyProxy → Options → Add → New Proxy.</Step>
            <Step n={3}>
              Proxy IP: <code className="mono">{primaryIp}</code>, Port: <code className="mono">{port}</code>. Tick "Also use this proxy for HTTPS".
            </Step>
            <Step n={4}>Set the pattern to <code className="mono">*</code> (all URLs), save, then select this proxy from the FoxyProxy toolbar icon.</Step>
            <Step n={5}>Trust Wraith's CA certificate below, or HTTPS sites will show a warning.</Step>
          </ol>
        )}
        {tab === "chrome" && (
          <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Step n={1}>
              Easiest: launch Chrome with <code className="mono">--proxy-server={primaryIp}:{port}</code>.
            </Step>
            <Step n={2}>Or install a proxy-switch extension (e.g. Proxy SwitchyOmega) and configure the same host/port.</Step>
            <Step n={3}>Trust Wraith's CA certificate below (Chrome uses the system/NSS trust store).</Step>
          </ol>
        )}
        {tab === "system" && (
          <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <Step n={1}>
              Windows: Settings → Network &amp; Internet → Proxy → Manual setup → address <code className="mono">{primaryIp}</code>, port{" "}
              <code className="mono">{port}</code>.
            </Step>
            <Step n={2}>
              macOS: System Settings → Network → Details → Proxies → Web/Secure Web Proxy → <code className="mono">{primaryIp}</code>:
              <code className="mono">{port}</code>.
            </Step>
            <Step n={3}>
              Linux (GNOME): Settings → Network → Network Proxy → Manual → HTTP/HTTPS host <code className="mono">{primaryIp}</code>, port{" "}
              <code className="mono">{port}</code>.
            </Step>
          </ol>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <IconShield size={18} style={{ color: "var(--accent-a)" }} />
          <div>
            <div className="panel-title">3. Trust the Wraith CA certificate</div>
            <div className="panel-sub">Needed once, so HTTPS sites don't show a warning when Wraith re-signs their certificate.</div>
          </div>
        </div>
        {!cert ? (
          <div className="muted">Start the proxy once first — the certificate is generated on first start.</div>
        ) : (
          <div className="stack-sm">
            <div className="mono faint" style={{ wordBreak: "break-all" }}>
              SHA-256 {cert.fingerprintSha256}
            </div>
            <div className="row wrap">
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const dest = await window.wraith.ca.exportToDesktop();
                  toast(`Exported to ${dest}`);
                }}
              >
                Export cert to Desktop
              </button>
              <button className="btn btn-sm" onClick={() => window.wraith.ca.openFolder()}>
                Open certificate folder
              </button>
            </div>
            <details>
              <summary className="muted" style={{ cursor: "pointer" }}>
                Per-OS / per-browser trust steps
              </summary>
              <div className="stack-sm" style={{ marginTop: 10 }}>
                <div>
                  <b>Firefox</b> — Settings → Privacy &amp; Security → Certificates → View Certificates → Authorities → Import → select the exported
                  file → tick "Trust this CA to identify websites".
                </div>
                <div>
                  <b>Linux (system/Chrome)</b> —{" "}
                  <code className="mono">sudo cp wraith-ca.pem /usr/local/share/ca-certificates/wraith-ca.crt &amp;&amp; sudo update-ca-certificates</code>
                </div>
                <div>
                  <b>Windows</b> — double-click the exported <code className="mono">.pem</code>/<code className="mono">.crt</code> → Install
                  Certificate → Local Machine → "Place all certificates in the following store" → Trusted Root Certification Authorities.
                </div>
                <div>
                  <b>macOS</b> — open the file in Keychain Access, drag into the "System" keychain, double-click it, expand Trust, set
                  "When using this certificate" to Always Trust.
                </div>
              </div>
            </details>
          </div>
        )}
      </div>

      <div className="row between">
        <button className="btn btn-ghost" onClick={() => window.wraith.app.openExternal(GITHUB_REPO_URL)}>
          <IconExternal size={13} /> Project on GitHub
        </button>
        <button className="btn btn-primary" onClick={finish}>
          <IconCheck size={14} /> Got it, let's go
        </button>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="row" style={{ alignItems: "flex-start", gap: 12 }}>
      <span className="step-num">{n}</span>
      <div style={{ paddingTop: 2 }}>{children}</div>
    </li>
  );
}
