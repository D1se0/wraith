import { useEffect, useState } from "react";
import { IconWraith, IconMinus, IconSquare, IconX } from "../lib/icons";
import { useApp } from "../context/AppContext";

export function TitleBar() {
  const { proxyStatus } = useApp();
  const [isMac, setIsMac] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    setIsMac(window.wraith.app.platform === "darwin");
    window.wraith.windowControls.isMaximized().then(setMaximized).catch(() => undefined);
    const off = window.wraith.windowControls.onMaximizedChange(setMaximized);
    return off;
  }, []);

  return (
    <div className="titlebar">
      <div style={{ width: isMac ? 70 : 0 }} />
      <div className="titlebar-brand">
        <IconWraith size={16} />
        <span className="grad-text">WRAITH</span>
      </div>
      <div className="titlebar-spacer" />
      <div className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--text-faint)" }}>
        <span className={`status-dot ${proxyStatus.running ? "on" : ""}`} />
        Proxy {proxyStatus.running ? `listening :${proxyStatus.port}` : "stopped"}
      </div>
      {!isMac && (
        <div className="titlebar-controls">
          <button className="win-btn" onClick={() => window.wraith.windowControls.minimize()} title="Minimize">
            <IconMinus size={13} />
          </button>
          <button className="win-btn" onClick={() => window.wraith.windowControls.toggleMaximize()} title={maximized ? "Restore" : "Maximize"}>
            <IconSquare size={maximized ? 10 : 12} />
          </button>
          <button className="win-btn close" onClick={() => window.wraith.windowControls.close()} title="Close">
            <IconX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
