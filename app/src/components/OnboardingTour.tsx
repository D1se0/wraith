import { ReactElement, useEffect, useState } from "react";
import { IconWraith, IconShield, IconRepeat, IconAi, IconTerminal, IconCheck } from "../lib/icons";
import { useApp } from "../context/AppContext";

interface TourStep {
  title: string;
  text: string;
  icon: (props: { size?: number }) => ReactElement;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to Wraith",
    text: "An all-in-one offensive web toolkit: intercepting proxy, packet capture, hash cracking, JWT tooling, and more — all local, all in one app. This is a 30-second tour of where things live.",
    icon: IconWraith,
  },
  {
    title: "Intercept & History",
    text: "Point your browser at Wraith's proxy and everything gets captured in History — searchable, tagged, and exportable. Turn on Intercept to pause and edit requests/responses in flight before Wraith forwards them.",
    icon: IconShield,
  },
  {
    title: "Repeater, Comparer, Fuzzer, Race",
    text: "Send any captured request to Repeater to tweak and resend it, Comparer to diff two exchanges side by side, Fuzzer to run a wordlist through marked positions, or Race to fire many copies at once and catch race conditions.",
    icon: IconRepeat,
  },
  {
    title: "AI & Findings",
    text: "Add your own Anthropic API key in Settings, then \"Ask Claude\" buttons give you a one-shot analysis anywhere, or the AI page can drive the app itself — reading History, decoding data, and recording Findings as it goes. The passive scanner also flags common issues automatically, no setup needed.",
    icon: IconAi,
  },
  {
    title: "Command Palette",
    text: "Press Ctrl+K (or ⌘K on macOS) any time to jump to any page or run a quick action — it's the fastest way to get around once you know your way.",
    icon: IconTerminal,
  },
];

const TOUR_SEEN_KEY = "wraith:tourSeen";

export function OnboardingTour() {
  const { setPage } = useApp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const onStart = () => {
      setStep(0);
      setOpen(true);
    };
    document.addEventListener("wraith:start-tour", onStart);
    return () => document.removeEventListener("wraith:start-tour", onStart);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      /* private-window localStorage can throw; skipping the tour once is harmless */
    }
    setOpen(false);
  };

  const finish = () => {
    close();
    setPage("proxy");
  };

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,7,12,0.65)", backdropFilter: "blur(4px)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="panel stack" style={{ width: 460, maxWidth: "90vw" }}>
        <div className="row" style={{ gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--accent-grad)",
              color: "#041014",
              flex: "0 0 36px",
            }}
          >
            <current.icon size={18} />
          </div>
          <div className="panel-title">{current.title}</div>
        </div>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {current.text}
        </p>
        <div className="row between" style={{ marginTop: 6 }}>
          <div className="row" style={{ gap: 6 }}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: i === step ? "var(--accent-a)" : "var(--panel-border)",
                }}
              />
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={close}>
              Skip
            </button>
            {isLast ? (
              <button className="btn btn-primary btn-sm" onClick={finish}>
                <IconCheck size={13} /> Let's go
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setStep((s) => s + 1)}>
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true; // if localStorage is unavailable, don't force the tour every launch
  }
}
