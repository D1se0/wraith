import { Reveal } from "./Reveal";

const STEPS = [
  { n: "01", title: "Install & open", desc: "Grab the installer for your OS below and launch Wraith — no config files, no setup wizard walls." },
  { n: "02", title: "Point your browser at it", desc: "The Welcome screen shows your machine's IP and the proxy port, ready to paste into FoxyProxy.", code: "127.0.0.1 : 8081" },
  { n: "03", title: "Trust the CA, once", desc: "One button exports Wraith's generated root certificate; a short per-browser guide walks you through trusting it." },
  { n: "04", title: "Start hacking", desc: "Intercept, repeat, crawl, capture, crack — everything shares one history and one dark, fast interface." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">From zero to intercepting</div>
          <h2>Wraith explains itself on first launch</h2>
          <p>The app's own Welcome screen walks you through proxy setup with your real IP and port — this is that same flow, in four steps.</p>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 70}>
              <div className="glass step-card">
                <div className="step-num">{s.n}</div>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
                {s.code && <code>{s.code}</code>}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
