import { useMemo } from "react";

const COLORS = ["#37e6c4", "#7c5cff", "#ff8a3d", "#ff5c8a", "#4fb0ff", "#ffd166"];

/** A one-shot celebratory burst -- CSS-animated, no library. Mount with a fresh `key` each time to replay it. */
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.25,
        duration: 0.9 + Math.random() * 0.7,
        color: COLORS[i % COLORS.length],
        rotate: Math.round(Math.random() * 360),
        drift: Math.round((Math.random() - 0.5) * 120),
      })),
    []
  );

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1200 }}>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ["--confetti-rot" as any]: `${p.rotate}deg`,
            ["--confetti-drift" as any]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
