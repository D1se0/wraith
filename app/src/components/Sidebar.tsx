import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { Page, useApp } from "../context/AppContext";
import {
  IconHome,
  IconShield,
  IconList,
  IconRepeat,
  IconCode,
  IconWave,
  IconKey,
  IconTerminal,
  IconSpider,
  IconJwt,
  IconCompare,
  IconUsers,
  IconZap,
  IconRace,
  IconLink,
  IconWifi,
  IconAi,
  IconFlag,
  IconSettings,
} from "../lib/icons";

const NAV: { id: Page; label: string; icon: ComponentType<{ size?: number }>; section?: string }[] = [
  { id: "welcome", label: "Setup", icon: IconHome, section: "Wraith" },
  { id: "proxy", label: "Intercept", icon: IconShield, section: "Proxy" },
  { id: "history", label: "History", icon: IconList },
  { id: "repeater", label: "Repeater", icon: IconRepeat },
  { id: "decoder", label: "Decoder", icon: IconCode, section: "Tools" },
  { id: "capture", label: "Packet Capture", icon: IconWave },
  { id: "cracker", label: "Cracker", icon: IconKey },
  { id: "curl", label: "cURL Builder", icon: IconTerminal },
  { id: "crawler", label: "Crawler", icon: IconSpider },
  { id: "jwt", label: "JWT", icon: IconJwt },
  { id: "comparer", label: "Comparer", icon: IconCompare },
  { id: "identities", label: "Identities", icon: IconUsers },
  { id: "fuzzer", label: "Fuzzer", icon: IconZap },
  { id: "race", label: "Race", icon: IconRace },
  { id: "chain", label: "Attack Chain", icon: IconLink },
  { id: "oob", label: "OOB", icon: IconWifi },
  { id: "ai", label: "AI", icon: IconAi, section: "AI" },
  { id: "findings", label: "Findings", icon: IconFlag },
  { id: "settings", label: "Settings", icon: IconSettings, section: "" },
];

export function Sidebar() {
  const { page, setPage, proxyStatus, interceptQueue, interceptArrivalTick } = useApp();
  const [flashing, setFlashing] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [openFindings, setOpenFindings] = useState(0);
  const firstTick = useRef(true);

  useEffect(() => {
    window.wraith.settings.get().then((s) => setAlertEnabled(s.general.interceptAlertEnabled));
  }, []);

  // The Sidebar (unlike page components) stays mounted for the app's whole
  // lifetime, so it's a safe place for this badge count to live locally --
  // no navigation-unmount data loss risk like the Intercept queue/AI
  // transcript had before those were moved into AppContext.
  useEffect(() => {
    const refresh = () => window.wraith.findings.list().then((f) => setOpenFindings(f.filter((x) => x.status !== "reported").length));
    refresh();
    const off = window.wraith.findings.onNew(() => refresh());
    const id = setInterval(refresh, 10000);
    return () => {
      off();
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false;
      return;
    }
    if (!alertEnabled) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interceptArrivalTick]);

  return (
    <div className="sidebar">
      {NAV.map((item) => {
        const isIntercept = item.id === "proxy";
        return (
          <div key={item.id}>
            {item.section !== undefined && item.section !== "" && <div className="nav-section-label">{item.section}</div>}
            <button
              className={`nav-item ${page === item.id ? "active" : ""} ${isIntercept && flashing ? "nav-item-flash" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={16} />
              {item.label}
              {isIntercept && interceptQueue.length > 0 && <span className="intercept-badge">{interceptQueue.length}</span>}
              {item.id === "findings" && openFindings > 0 && (
                <span className="intercept-badge" style={{ background: "var(--warn)" }}>
                  {openFindings}
                </span>
              )}
            </button>
          </div>
        );
      })}

      <div className="sidebar-footer">
        <button
          className="status-pill"
          onClick={() => document.dispatchEvent(new CustomEvent("wraith:open-command-palette"))}
          style={{ width: "100%", marginBottom: 8, justifyContent: "space-between" }}
          title="Command palette"
        >
          <span className="muted">Quick actions</span>
          <span className="mono faint" style={{ fontSize: 10.5 }}>
            {window.wraith.app.platform === "darwin" ? "⌘K" : "Ctrl+K"}
          </span>
        </button>
        <button className="status-pill" onClick={() => setPage("proxy")} style={{ width: "100%" }}>
          <span className={`status-dot ${proxyStatus.running ? "on" : ""}`} />
          {proxyStatus.running ? `Running :${proxyStatus.port}` : "Proxy stopped"}
        </button>
      </div>
    </div>
  );
}
