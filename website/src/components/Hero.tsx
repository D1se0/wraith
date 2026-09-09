import { ComponentType } from "react";
import { DetectedOS } from "../hooks/useLatestRelease";
import { LatestRelease } from "../hooks/useLatestRelease";
import { GITHUB_URL_FALLBACK } from "../config";
import { IconWindows, IconLinux, IconApple, IconGithub } from "./Icons";

const OS_LABEL: Record<DetectedOS, string> = {
  windows: "Windows",
  linux: "Linux",
  mac: "macOS",
  unknown: "your OS",
};
const OS_ICON: Record<DetectedOS, ComponentType<{ size?: number }>> = {
  windows: IconWindows,
  linux: IconLinux,
  mac: IconApple,
  unknown: IconWindows,
};

export function Hero({ os, release }: { os: DetectedOS; release: LatestRelease | null }) {
  const key = os === "mac" ? "mac" : os === "linux" ? "linux" : "windows";
  const asset = release?.assets ? release.assets[key] : null;
  const Icon = OS_ICON[os];

  return (
    <section id="top" className="hero">
      <div className="wrap">
        <div className="eyebrow" style={{ justifyContent: "center" }}>
          Now in active development · MIT licensed
        </div>
        <h1>
          Web hacking, <span className="gradient-text">without the clutter.</span>
        </h1>
        <p className="lede">
          Wraith bundles an intercepting proxy, packet capture, hash cracking, a cURL builder and an automatic
          crawler into one fast, dark, intuitive desktop app — everything Burp does for web testing, none of the
          weight.
        </p>
        <div className="hero-actions">
          <a
            className="btn btn-primary"
            href={asset ? asset.url : "#install"}
          >
            <Icon size={17} /> Download for {OS_LABEL[os]}
          </a>
          <a className="btn btn-ghost" href={release?.htmlUrl || GITHUB_URL_FALLBACK} target="_blank" rel="noreferrer">
            <IconGithub size={16} /> View on GitHub
          </a>
        </div>
        <div className="hero-meta">
          {release?.available
            ? `Latest release ${release.version} · free & open source`
            : "Free & open source · installers for Windows, Linux and macOS"}
        </div>

        <div className="hero-stage reveal in">
          <div className="mockwin">
            <div className="mockwin-bar">
              <span className="mockwin-dot" />
              <span className="mockwin-dot" />
              <span className="mockwin-dot" />
            </div>
            <div className="mockwin-body">
              <div className="mockwin-rail">
                <i className="active" />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="mockwin-main">
                <div className="mockrow">
                  <b>GET</b>
                  <span>/api/v2/session/refresh</span>
                  <span className="mock-status-2">200</span>
                  <span>1.1s</span>
                </div>
                <div className="mockrow json">
                  <b>POST</b>
                  <span>/graphql</span>
                  <span className="mock-status-2">200</span>
                  <span>212ms</span>
                </div>
                <div className="mockrow graphql">
                  <b>POST</b>
                  <span>/graphql?op=viewer</span>
                  <span className="mock-status-2">200</span>
                  <span>98ms</span>
                </div>
                <div className="mockrow">
                  <b>GET</b>
                  <span>/static/app.bundle.js</span>
                  <span className="mock-status-3">304</span>
                  <span>4ms</span>
                </div>
                <div className="mockrow err">
                  <b>POST</b>
                  <span>/api/v1/admin/users/442</span>
                  <span className="mock-status-4">403</span>
                  <span>61ms</span>
                </div>
                <div className="mockrow">
                  <b>GET</b>
                  <span>/assets/logo.svg</span>
                  <span className="mock-status-2">200</span>
                  <span>3ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
