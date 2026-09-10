import { Reveal } from "./Reveal";
import { IconProxy, IconCapture, IconCracker, IconCurl, IconCrawler, IconDecoder, IconAi, IconFlag, IconZap } from "./Icons";

const FEATURES = [
  {
    icon: IconProxy,
    title: "Intercepting proxy",
    desc: "A real on-the-fly MITM CA like Burp — hold, edit and forward or drop any request and response. Full history with one-click JSON/GraphQL/auth highlighting and a multi-tab Repeater.",
  },
  {
    icon: IconAi,
    title: "AI assistant",
    desc: "Backed by your own Anthropic API key: one-shot \"Ask Claude\" analysis anywhere, or a dedicated AI page that reads History, decodes data, records Findings and drives the app — flagging clearly the one tool that ever sends live traffic.",
  },
  {
    icon: IconFlag,
    title: "Passive scanner & Findings",
    desc: "Every response is checked automatically for missing security headers, bad cookie flags, dangerous CORS, leaked secrets and open GraphQL introspection — no extra traffic. Findings land on a Kanban board you (or the AI) work through.",
  },
  {
    icon: IconZap,
    title: "Fuzzer, Race & OOB",
    desc: "An Intruder-style Sniper fuzzer, a race-condition tool that fires requests simultaneously and flags the outlier, and out-of-band interaction detection for the blind bugs that never show up in a response.",
  },
  {
    icon: IconCapture,
    title: "Packet capture",
    desc: "A Wireshark-lite built right in. Live packet list backed by tshark, BPF filters, and full protocol-dissection detail one click away.",
  },
  {
    icon: IconCracker,
    title: "Hash cracking",
    desc: "A clean GUI over John the Ripper and hashcat — wordlist, mask or brute-force attacks, format/mode pickers, a live console and a results table.",
  },
  {
    icon: IconCurl,
    title: "cURL builder",
    desc: "Build real curl requests with buttons instead of flags: method, redirects, TLS, headers, auth, cookies, proxy — with a live command preview and sandboxed HTML rendering of the response.",
  },
  {
    icon: IconCrawler,
    title: "Automatic crawler",
    desc: "Map the static attack surface fast: configurable depth/scope, plus forms, JS files, HTML comments, sitemap.xml, robots.txt and common sensitive-path probing.",
  },
  {
    icon: IconDecoder,
    title: "Encoder / decoder",
    desc: "Base64, URL, hex, HTML entities, unicode escapes, gzip, JWT decoding and MD5/SHA1/SHA256 hashing, with a Magic auto-detect button — always one keystroke away.",
  },
];

export function Features() {
  return (
    <section id="features">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">Everything, in one app</div>
          <h2>One dark window. Every tool you actually use.</h2>
          <p>No plugin marketplace, no license tiers, no fifteen-year-old Java Swing panels. Just the tools a web pentest actually needs, wired together.</p>
        </div>
        <div className="grid-features">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <div className="glass feature-card">
                <div className="feature-icon">
                  <f.icon size={22} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
