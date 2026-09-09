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
  { id: "settings", label: "Settings", icon: IconSettings, section: "" },
];

export function Sidebar() {
  const { page, setPage, proxyStatus, interceptQueue, interceptArrivalTick } = useApp();
  const [flashing, setFlashing] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const firstTick = useRef(true);

  useEffect(() => {
    window.wraith.settings.get().then((s) => setAlertEnabled(s.general.interceptAlertEnabled));
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
            </button>
          </div>
        );
      })}

      <div className="sidebar-footer">
        <button className="status-pill" onClick={() => setPage("proxy")} style={{ width: "100%" }}>
          <span className={`status-dot ${proxyStatus.running ? "on" : ""}`} />
          {proxyStatus.running ? `Running :${proxyStatus.port}` : "Proxy stopped"}
        </button>
      </div>
    </div>
  );
}
