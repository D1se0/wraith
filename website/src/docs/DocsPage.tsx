import { useEffect, useState, ReactElement } from "react";
import { DOCS_SECTIONS } from "./content";
import { DocsBlock, DocsSection } from "./types";
import {
  IconProxy,
  IconShield,
  IconHistory,
  IconRepeat,
  IconDecoder,
  IconCapture,
  IconCracker,
  IconCurl,
  IconCrawler,
  IconJwt,
  IconSettingsGear,
} from "../components/Icons";

const ICONS: Record<string, (props: { size?: number }) => ReactElement> = {
  proxy: IconProxy,
  intercept: IconShield,
  history: IconHistory,
  repeater: IconRepeat,
  decoder: IconDecoder,
  capture: IconCapture,
  cracker: IconCracker,
  curl: IconCurl,
  crawler: IconCrawler,
  jwt: IconJwt,
  settings: IconSettingsGear,
};

function Block({ block }: { block: DocsBlock }) {
  switch (block.type) {
    case "p":
      return <p className="docs-p">{block.text}</p>;
    case "list":
      return (
        <ul className="docs-list">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "fields":
      return (
        <div className="docs-fields">
          {block.items.map((f, i) => (
            <div className="docs-field-row" key={i}>
              <div className="docs-field-name">
                {f.name}
                {f.default && <span className="docs-field-default">default: {f.default}</span>}
              </div>
              <div className="docs-field-desc">{f.description}</div>
            </div>
          ))}
        </div>
      );
    case "code":
      return (
        <div className="docs-code">
          {block.caption && <div className="docs-code-caption">{block.caption}</div>}
          <pre>
            <code>{block.lines.join("\n")}</code>
          </pre>
        </div>
      );
    case "example":
      return (
        <div className="docs-example">
          <div className="docs-example-title">{block.title}</div>
          <ol>
            {block.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      );
    case "note":
      return <div className={`docs-note ${block.kind === "warn" ? "warn" : ""}`}>{block.text}</div>;
    default:
      return null;
  }
}

function Section({ section }: { section: DocsSection }) {
  const Icon = ICONS[section.icon] || IconShield;
  return (
    <section id={`docs-${section.id}`} className="docs-section">
      <div className="docs-section-head">
        <div className="docs-section-icon">
          <Icon size={20} />
        </div>
        <div>
          <h2>{section.title}</h2>
          <p>{section.summary}</p>
        </div>
      </div>
      <div className="docs-section-body">
        {section.body.map((b, i) => (
          <Block block={b} key={i} />
        ))}
      </div>
    </section>
  );
}

export function DocsPage({ sectionId }: { sectionId?: string }) {
  const [active, setActive] = useState(sectionId || DOCS_SECTIONS[0].id);

  // Deep link support: /#/docs/<id> scrolls straight to that section once
  // the page (and its fonts/layout) has settled.
  useEffect(() => {
    if (!sectionId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`docs-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [sectionId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id.replace("docs-", ""));
            break;
          }
        }
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    for (const s of DOCS_SECTIONS) {
      const el = document.getElementById(`docs-${s.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="docs-page">
      <div className="wrap docs-wrap">
        <header className="docs-header">
          <div className="eyebrow">Documentation</div>
          <h1 className="gradient-text">The Wraith manual</h1>
          <p className="docs-header-lede">
            Every tool, every parameter, every button — with real examples. This is the reference you reach for after
            you've installed Wraith; see the <a href="#features">feature overview</a> for the pitch.
          </p>
        </header>

        <div className="docs-layout">
          <nav className="docs-toc">
            {DOCS_SECTIONS.map((s) => {
              const Icon = ICONS[s.icon] || IconShield;
              return (
                <a key={s.id} href={`#/docs/${s.id}`} className={`docs-toc-link ${active === s.id ? "active" : ""}`}>
                  <Icon size={15} />
                  {s.title}
                </a>
              );
            })}
          </nav>

          <div className="docs-content">
            {DOCS_SECTIONS.map((s) => (
              <Section section={s} key={s.id} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
