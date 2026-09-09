import { Reveal } from "./Reveal";

export function Showcase() {
  return (
    <section id="showcase">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">Artist's impression</div>
          <h2>What each tool feels like</h2>
          <p>Real screenshots land here once the app UI ships — for now, here's the shape of it.</p>
        </div>
        <div className="showcase-grid">
          <Reveal>
            <div className="glass showcase-card">
              <div className="mockwin-bar">
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span>Intercept</span>
              </div>
              <div className="mock-terminal">
                <div>→ POST /api/checkout/confirm <span className="ok">HELD</span></div>
                <div>&nbsp;&nbsp;Authorization: Bearer eyJhbGciOi...</div>
                <div>&nbsp;&nbsp;Content-Type: application/json</div>
                <div>&nbsp;&nbsp;{"{ \"couponCode\": \"WRAITH20\", \"total\": 4200 }"}</div>
                <div style={{ marginTop: 10 }}>
                  <span className="warn">[edit body]</span> → total: 1 <span className="ok">[Forward]</span> <span>[Drop]</span>
                </div>
              </div>
              <div className="showcase-caption">
                <h4>Intercept, edit, forward</h4>
                <p>Hold any request or response, tweak it inline, release it — or drop it entirely.</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="glass showcase-card">
              <div className="mockwin-bar">
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span>Capture</span>
              </div>
              <div className="mock-terminal">
                <div>1  0.000000  10.0.0.14 → 10.0.0.1     TCP  74  SYN</div>
                <div>2  0.000210  10.0.0.1 → 10.0.0.14     TCP  74  SYN,ACK</div>
                <div>3  0.000340  10.0.0.14 → 10.0.0.1     TLS  312 <span className="ok">Client Hello</span></div>
                <div>4  0.041120  10.0.0.1 → 10.0.0.14     TLS  1450 Server Hello</div>
                <div className="warn" style={{ marginTop: 10 }}>frame.number == 3 → full dissection ↓</div>
              </div>
              <div className="showcase-caption">
                <h4>Wireshark-lite, built in</h4>
                <p>Live packet list backed by tshark — click any packet for the full protocol tree.</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="glass showcase-card">
              <div className="mockwin-bar">
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span>Cracker</span>
              </div>
              <div className="mock-terminal">
                <div>$ hashcat -m 0 -a 0 hashes.txt rockyou.txt</div>
                <div>Recovered.......: 1/1 (100.00%) Digests</div>
                <div>
                  <span className="mock-key">482c811d...e38</span> : <span className="ok">password123</span>
                </div>
                <div style={{ marginTop: 10 }}>cracked → results table, live</div>
              </div>
              <div className="showcase-caption">
                <h4>John & hashcat, one GUI</h4>
                <p>Wordlist, mask or brute-force — pick a tool, watch the console, get a results table.</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="glass showcase-card">
              <div className="mockwin-bar">
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span className="mockwin-dot" />
                <span>cURL</span>
              </div>
              <div className="mock-terminal">
                <div>
                  [<span className="ok">GET</span>] [<span className="ok">-L</span>] [-k] [-v] [Send]
                </div>
                <div style={{ marginTop: 6 }}>curl -s -L -H "Accept: application/json" \</div>
                <div>&nbsp;&nbsp;https://api.target.dev/v3/status</div>
                <div className="warn" style={{ marginTop: 10 }}>render as HTML: ⬜ off ✅ on</div>
              </div>
              <div className="showcase-caption">
                <h4>Buttons that build the command</h4>
                <p>Toggle flags visually, watch the real curl command update, run it, render the response.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
