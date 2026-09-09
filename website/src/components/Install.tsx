import { useState } from "react";
import { LatestRelease } from "../hooks/useLatestRelease";
import { GITHUB_URL_FALLBACK } from "../config";
import { IconWindows, IconLinux, IconApple } from "./Icons";

type Tab = "windows" | "linux" | "mac";

const TABS: { id: Tab; label: string; icon: typeof IconWindows }[] = [
  { id: "windows", label: "Windows", icon: IconWindows },
  { id: "linux", label: "Linux", icon: IconLinux },
  { id: "mac", label: "macOS", icon: IconApple },
];

const COPY: Record<Tab, { file: string; steps: string[]; note: string }> = {
  windows: {
    file: "Wraith-Setup-x.y.z.exe",
    steps: [
      "Download Wraith-Setup-x.y.z.exe below.",
      "Run it — it's a standard NSIS installer, no admin rights required by default.",
      "Choose an install directory (or keep the default) and finish the wizard.",
      "Launch Wraith from the Start Menu or the desktop shortcut it creates.",
    ],
    note: "To uninstall: Settings → Apps → Wraith → Uninstall. Every file it created is removed cleanly, nothing left behind.",
  },
  linux: {
    file: "Wraith-x.y.z-linux-x64.deb",
    steps: [
      "Download the .deb package below.",
      "Install it: sudo apt install ./Wraith-*.deb",
      "(or double-click it in your distro's package manager / software center)",
      "Launch Wraith from your applications menu, or run: wraith",
    ],
    note: "To uninstall: sudo apt remove wraith — this removes the app itself; your own captured data stays under ~/.config/Wraith until you delete it (or use the in-app “Purge all data” button first).",
  },
  mac: {
    file: "Wraith-x.y.z.dmg",
    steps: [
      "Download the .dmg below and open it.",
      "Drag Wraith into your Applications folder.",
      "First launch: since builds aren't Apple-notarized yet, right-click Wraith → Open, then confirm — you'll only need to do this once.",
      "Launch Wraith normally from then on.",
    ],
    note: "To uninstall: drag Wraith from Applications to the Trash, like any other Mac app.",
  },
};

export function Install({ release }: { release: LatestRelease | null }) {
  const [tab, setTab] = useState<Tab>("windows");
  const info = COPY[tab];
  const asset = release?.assets ? release.assets[tab] : null;
  const releasesUrl = release?.releasesUrl || GITHUB_URL_FALLBACK + "/releases";

  return (
    <section id="install">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">Download</div>
          <h2>One installer, every OS</h2>
          <p>Native installers built with electron-builder — an .exe on Windows, a .deb on Linux, a .dmg on macOS. Everything installs and uninstalls cleanly.</p>
        </div>

        <div className="install-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`install-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        <div className="glass install-panel">
          <div className="pill">{asset ? asset.name : info.file}</div>
          <ol>
            {info.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="install-cta">
            {asset ? (
              <a className="btn btn-primary" href={asset.url}>
                Download {info.file.split("-")[0]} for {TABS.find((t) => t.id === tab)!.label}
              </a>
            ) : (
              <a className="btn btn-primary" href={releasesUrl} target="_blank" rel="noreferrer">
                See releases on GitHub
              </a>
            )}
            <a className="btn btn-ghost" href={releasesUrl} target="_blank" rel="noreferrer">
              All releases →
            </a>
          </div>
          {!asset && (
            <div className="install-note" style={{ marginTop: 14 }}>
              No installer has been published yet — the project hasn't been pushed to GitHub. Once a release goes
              out, this button links straight to the right file for your OS automatically.
            </div>
          )}
          <div className="install-note" style={{ marginTop: 14 }}>
            {info.note}
          </div>
        </div>
      </div>
    </section>
  );
}
