import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
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
  IconPlay,
  IconStop,
  IconTrash,
} from "../lib/icons";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: (props: { size?: number }) => ReactElement;
  run: () => void;
}

const NAV_COMMANDS: { page: Page; label: string; icon: Command["icon"] }[] = [
  { page: "welcome", label: "Go to Setup", icon: IconHome },
  { page: "proxy", label: "Go to Intercept", icon: IconShield },
  { page: "history", label: "Go to History", icon: IconList },
  { page: "repeater", label: "Go to Repeater", icon: IconRepeat },
  { page: "decoder", label: "Go to Decoder", icon: IconCode },
  { page: "capture", label: "Go to Packet Capture", icon: IconWave },
  { page: "cracker", label: "Go to Cracker", icon: IconKey },
  { page: "curl", label: "Go to cURL Builder", icon: IconTerminal },
  { page: "crawler", label: "Go to Crawler", icon: IconSpider },
  { page: "jwt", label: "Go to JWT", icon: IconJwt },
  { page: "comparer", label: "Go to Comparer", icon: IconCompare },
  { page: "identities", label: "Go to Identities", icon: IconUsers },
  { page: "fuzzer", label: "Go to Fuzzer", icon: IconZap },
  { page: "race", label: "Go to Race", icon: IconRace },
  { page: "chain", label: "Go to Attack Chain", icon: IconLink },
  { page: "oob", label: "Go to OOB Interactions", icon: IconWifi },
  { page: "ai", label: "Go to AI", icon: IconAi },
  { page: "findings", label: "Go to Findings", icon: IconFlag },
  { page: "settings", label: "Go to Settings", icon: IconSettings },
];

export function CommandPalette() {
  const { setPage, proxyStatus, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const nav = NAV_COMMANDS.map((n) => ({ id: `nav-${n.page}`, label: n.label, icon: n.icon, run: () => setPage(n.page) }));
    const actions: Command[] = [
      proxyStatus.running
        ? { id: "proxy-stop", label: "Stop proxy", icon: IconStop, run: () => window.wraith.proxy.stop() }
        : { id: "proxy-start", label: "Start proxy", icon: IconPlay, run: () => window.wraith.proxy.start() },
      {
        id: "history-clear",
        label: "Clear History",
        icon: IconTrash,
        run: () => {
          if (confirm("Clear all HTTP history?")) window.wraith.history.clear();
        },
      },
    ];
    return [...nav, ...actions];
  }, [proxyStatus.running, setPage]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    // Also openable from a plain button click elsewhere (e.g. the sidebar
    // hint) for anyone who hasn't discovered the shortcut yet.
    const onOpenEvent = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wraith:open-command-palette", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("wraith:open-command-palette", onOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runActive = (cmd: Command) => {
    setOpen(false);
    cmd.run();
    toast(cmd.label);
  };

  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(5,7,12,0.6)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="panel"
        style={{ width: 520, maxWidth: "90vw", padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command or page…"
          style={{ width: "100%", border: "none", borderBottom: "1px solid var(--panel-border)", borderRadius: 0, padding: "14px 16px", fontSize: 14 }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && filtered[activeIndex]) {
              runActive(filtered[activeIndex]);
            }
          }}
        />
        <div style={{ maxHeight: "50vh", overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 && <div className="muted" style={{ padding: 12 }}>No matching commands.</div>}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => runActive(cmd)}
              onMouseEnter={() => setActiveIndex(i)}
              className="row"
              style={{
                width: "100%",
                textAlign: "left",
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: i === activeIndex ? "rgba(var(--overlay-rgb),0.08)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                gap: 10,
              }}
            >
              <cmd.icon size={15} />
              {cmd.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
