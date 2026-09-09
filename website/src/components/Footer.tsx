import { LogoMark, IconGithub } from "./Icons";
import { GITHUB_URL_FALLBACK } from "../config";

export function Footer({ githubUrl }: { githubUrl?: string }) {
  const gh = githubUrl || GITHUB_URL_FALLBACK;
  return (
    <footer>
      <div className="wrap">
        <div className="footer-top">
          <div style={{ maxWidth: 420 }}>
            <div className="brand" style={{ marginBottom: 10 }}>
              <LogoMark />
              Wraith
            </div>
            <p className="footer-note">
              Wraith is a security testing tool. Use it only against systems you own or are explicitly authorized to
              test. It bundles an intercepting proxy, packet capture, hash cracking, cURL builder and crawler for
              ethical hacking and authorized penetration testing — not for anything else.
            </p>
          </div>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#install">Install</a>
            <a href={gh} target="_blank" rel="noreferrer">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconGithub size={15} /> GitHub
              </span>
            </a>
          </div>
        </div>
        <div className="footer-inner">
          <span className="footer-note">© {new Date().getFullYear()} Wraith Project · MIT License</span>
          <span className="footer-note">Built with Electron, React &amp; TypeScript</span>
        </div>
      </div>
    </footer>
  );
}
