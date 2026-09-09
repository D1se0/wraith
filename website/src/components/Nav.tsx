import { useEffect, useState } from "react";
import { LogoMark, IconGithub, IconMenu, IconClose } from "./Icons";
import { GITHUB_URL_FALLBACK } from "../config";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#install", label: "Install" },
  { href: "#showcase", label: "Showcase" },
  { href: "#/docs", label: "Docs" },
];

export function Nav({ githubUrl }: { githubUrl?: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="nav-inner">
        <a href="#top" className="brand">
          <LogoMark />
          Wraith
        </a>
        <div className="nav-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="nav-actions">
          <a href={githubUrl || GITHUB_URL_FALLBACK} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <IconGithub size={15} /> GitHub
          </a>
          <a href="#install" className="btn btn-primary btn-sm">
            Download
          </a>
          <button className="btn btn-ghost btn-sm nav-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <IconClose size={18} /> : <IconMenu size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="glass" style={{ margin: "0 20px 16px", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
