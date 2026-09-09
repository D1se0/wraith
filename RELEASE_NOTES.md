## Wraith v0.1.0 — first public build

Wraith is a dark, opinionated, all-in-one offensive web toolkit — the
"anti-Burp": an intercepting proxy, packet capture, hash cracking, a
button-driven cURL builder and an automatic crawler in one fast desktop
app, without the fifteen-year-old Java Swing feel.

This is the first published build. The core (proxy engine, cracker, curl
runner, capture, crawler) has been tested end-to-end on Linux against
real HTTP/HTTPS traffic, a real `.deb` install/uninstall cycle, real
`john`/`hashcat`/`tshark` runs. **Windows and macOS builds compile and
package correctly but have not been run on real Windows/macOS hardware
yet** — this release is the first real test of those.

### What's in

- **Intercepting HTTP(S) proxy** with an on-the-fly MITM root CA — hold,
  edit, forward or drop requests *and* responses, full traffic history
  with user-toggleable highlight rules (JSON, GraphQL, auth/cookies,
  4xx/5xx, …), a multi-tab **Repeater**, and a first-run **Setup** screen
  that shows your machine's IP, the proxy port, step-by-step
  FoxyProxy/browser configuration, and CA trust instructions per OS.
- **Decoder** — Base64, URL, hex, HTML entities, unicode escapes, gzip,
  JWT decode, MD5/SHA1/SHA256.
- **Packet capture** ("Wireshark-lite") backed by `tshark` — live packet
  list, click for full protocol detail, BPF filter support.
- **Hash cracking** — a real GUI over both **John the Ripper** and
  **hashcat**: wordlist/mask/bruteforce, format/mode pickers, live
  console, an authoritative cracked-results table.
- **cURL builder** — every flag is a button, live command preview, runs
  real `curl`, optional sandboxed HTML render of the response.
- **Automatic crawler** — depth/pages/concurrency/scope control, and
  toggleable discovery techniques (forms, JS files, HTML comments,
  sitemap.xml, robots.txt, common sensitive paths).

Everything Wraith writes lives under one centralized per-user data
folder — install and uninstall never leave junk behind.

### Known limitations

- WebSocket traffic passes through the proxy but is only logged, not yet
  interceptable/editable like HTTP(S) exchanges.
- The optional chained upstream proxy setting in Settings is not yet
  wired into the forwarding path.
- Windows/macOS: packaged and tested to install/launch under emulation
  (Wine), but not yet confirmed on real hardware — please report issues.

### Installing

- **Windows**: download `Wraith-Setup-0.1.0.exe`, run it.
- **Linux**: `sudo apt install ./Wraith-0.1.0-linux-amd64.deb` (or
  double-click it in a GUI package manager).
- **macOS**: open the `.dmg`, drag Wraith to Applications. It's
  unsigned, so the first launch needs right-click → Open to get past
  Gatekeeper.

Full details: [README](https://github.com/D1se0/wraith#readme).
