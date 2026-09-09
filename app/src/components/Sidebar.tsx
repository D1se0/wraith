import type { ComponentType } from "react";
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
  { id: "settings", label: "Settings", icon: IconSettings, section: "" },
];

export function Sidebar() {
  const { page, setPage, proxyStatus } = useApp();

  return (
    <div className="sidebar">
      {NAV.map((item) => (
        <div key={item.id}>
          {item.section !== undefined && item.section !== "" && <div className="nav-section-label">{item.section}</div>}
          <button className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
            <item.icon size={16} />
            {item.label}
          </button>
        </div>
      ))}

      <div className="sidebar-footer">
        <button className="status-pill" onClick={() => setPage("proxy")} style={{ width: "100%" }}>
          <span className={`status-dot ${proxyStatus.running ? "on" : ""}`} />
          {proxyStatus.running ? `Running :${proxyStatus.port}` : "Proxy stopped"}
        </button>
      </div>
    </div>
  );
}
