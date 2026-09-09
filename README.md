# Wraith

Wraith is a from-scratch, dark-themed, all-in-one offensive web toolkit for
ethical hacking — the "anti-Burp": the same core power (intercepting
proxy, repeater, packet capture, hash cracking, cURL, crawler, encode/decode)
without Burp Suite's cluttered, dated interface, and without the license
prompts.

It's an Electron + React/TypeScript desktop app. Everything it needs to run
(besides itself) is a handful of already-installed CLI tools it shells out
to for the heavier jobs (`tshark`, `john`, `hashcat`, `curl`) — the app tells
you exactly what's missing and how to install it if something isn't found.

> Built for authorized security testing, bug bounty work, CTFs, and
> education against systems you own or are explicitly permitted to test.

## What's inside

Sidebar order, top to bottom:

- **Setup** — first-run screen: your machine's IP + the proxy port, tabbed
  browser-configuration instructions (Firefox+FoxyProxy / Chrome / system-wide),
  and CA certificate export + per-browser trust steps.
- **Intercept** — a real on-the-fly MITM root CA (like Burp/mitmproxy),
  request AND response interception (hold, edit, forward, drop), a
  configurable scope, "send to Repeater" straight from a held item, and a
  red flash on capture (sidebar + card) so you never miss one while
  working another tab.
- **History** — full traffic log with **highlight rules** you control
  (JSON, GraphQL, auth/cookies, 4xx/5xx, HTML, …), client-side search, and
  **CSV/JSON export** of the current view.
- **Repeater** — multi-tab, resend and tweak any request, sandboxed HTML
  render of responses.
- **Decoder** — Base64, URL, hex, HTML entities, unicode escapes, gzip, JWT
  decode, MD5/SHA1/SHA256 — pick an operation, hit Convert.
- **Packet Capture ("Wireshark-lite")** — a live packet list backed by
  `tshark`, full protocol detail per packet, a BPF capture filter plus a
  separate post-capture **display filter with a built-in cheat sheet**,
  and **export to .pcap/.pcapng/.json/.csv**.
- **Cracker** — a GUI front end for both **John the Ripper** and
  **hashcat**: wordlist / mask / bruteforce attacks, format & mode
  pickers, live console, an authoritative results table, and **Kali's
  `rockyou.txt` auto-detected as the default wordlist** (auto-extracted
  from `.gz` if needed, overridable in Settings or per-run).
- **cURL Builder** — build a request with buttons/toggles (method, `-L`,
  `-k`, `-v`, headers, body, auth, cookies, proxy, timeout), see the
  equivalent command update live, run real `curl`, and optionally render
  the response as HTML in a sandboxed preview.
- **Crawler** — depth/pages/concurrency, scope control, and toggleable
  techniques (forms, JS files, HTML comments, sitemap.xml, robots.txt,
  common sensitive paths).
- **JWT** — decode, sign/reconstruct (none, HS/RS/ES-family, deliberately
  independent of the header's own `alg` for alg-confusion testing), a
  one-click alg:none stripper, verify, and a wordlist-based secret cracker
  for HS256/384/512 tokens.
- **Settings** — proxy (port/host/body-capture cap/insecure-upstream),
  general preferences (history limit, drop confirmation, intercept alert,
  default capture interface, default wordlist, live accent-color
  theming, devtools-on-launch), highlight rules, CA management (export,
  regenerate), and a purge-everything danger zone.

Everything Wraith writes to disk — settings, traffic history, the
generated CA — lives under one centralized per-user data folder (the OS's
standard app-data directory), so install/uninstall never leaves junk
scattered around.

**Full parameter-by-parameter manual, with examples:** see the
[Docs section of the website](https://d1se0.github.io/wraith/#/docs) (also
buildable/runnable locally — see [The website](#the-website) below).

## Repository layout

```
AppProxyTool/
├── app/                  Electron desktop app (the tool itself)
│   ├── electron/         main process: proxy engine, capture, cracker, curl, crawler, IPC
│   └── src/              React renderer (the UI)
├── website/              Node.js + Express + React marketing/download site
└── .github/workflows/    CI that builds the Windows/Linux/macOS installers
```

## Running it from source

```bash
cd app
npm install
npm run dev        # Vite dev server + Electron, hot reload
```

Production build (no installer, just the compiled app):

```bash
cd app
npm run build       # renderer (Vite) + main process (tsc)
npx electron .       # run the built app
```

## Building installers

```bash
cd app
npm run dist:linux   # -> ../release/*.deb
npm run dist:win     # -> ../release/*.exe   (NSIS; build on/for Windows)
npm run dist:mac     # -> ../release/*.dmg   (build on/for macOS)
```

Cross-building a real NSIS `.exe` or a `.dmg` from Linux isn't reliable, so
the recommended path is the included GitHub Actions workflow
(`.github/workflows/build.yml`), which builds all three installers on
their native OS runners and attaches them to a GitHub Release whenever you
push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release body is pulled from [RELEASE_NOTES.md](RELEASE_NOTES.md) —
update that file (and the version in `app/package.json`) before tagging
each new release.

### Install / uninstall

- **Windows**: run the `.exe` (NSIS installer) — choose the install
  directory, get Start Menu + Desktop shortcuts. Uninstall from "Add or
  Remove Programs"; app data is removed with it.
- **Linux**: `sudo apt install ./Wraith-*.deb` (or double-click it in a
  GUI package manager). Uninstall with `sudo apt remove wraith`.
- **macOS**: open the `.dmg`, drag Wraith to Applications. It's unsigned
  (no Apple Developer certificate), so the first launch needs a
  right-click → Open to get past Gatekeeper.

## The website

`website/` is a separate Node.js + Express + React (Vite) site: what Wraith
is, per-OS install instructions, and a download button that reads the
**latest GitHub Release** straight from the GitHub API on the client (repo
slug lives in one place, `website/src/config.ts`'s `GITHUB_REPO_FALLBACK`).
Because that call happens in the browser, the exact same build works both
self-hosted via Node and as static files with no backend at all — which is
what makes GitHub Pages deployment below possible.

Self-hosted with Node:

```bash
cd website
npm install
npm run build
npm start        # -> http://localhost:4173
```

### Deploying to GitHub Pages

`.github/workflows/deploy-pages.yml` builds `website/` and publishes it to
GitHub Pages automatically on every push to `main` that touches `website/`
(or via "Run workflow" in the Actions tab). One-time setup, in the GitHub
UI, after the repo exists:

1. **Settings → Pages → Build and deployment → Source → "GitHub Actions"**
   (not "Deploy from a branch" — that's a different, older mechanism).
2. Push to `main` (or run the workflow manually) — it'll appear at
   `https://d1se0.github.io/wraith/`.

No other configuration needed — Vite's `base: "./"` in
`website/vite.config.mts` makes the build work correctly at that subpath.

### Keeping the docs in sync

The full manual lives at `website/src/docs/content.ts` — a plain data
array (`DOCS_SECTIONS`), one entry per sidebar tool, each with typed
content blocks (paragraphs, parameter tables, examples, notes). When you
change a tool's behavior or add a parameter, update that tool's section
there and, if the change is significant, the "What's inside" list above.
`website/src/docs/DocsPage.tsx` is pure rendering and shouldn't need
touching for a content-only change.

## Security notes

- The generated root CA lives in your centralized Wraith data folder and
  is only ever used locally to terminate TLS for traffic you deliberately
  proxy through the app — trust it in one browser profile, not your whole
  OS, unless you specifically want that.
- `curl`/cracker "extra arguments" fields are passed straight to the
  underlying tool's argv (never through a shell), so nothing you type can
  break out into shell metacharacters — but the tool itself will honor
  whatever flags you give it, by design.
- The rendered-HTML preview in the cURL tool is a fully sandboxed iframe
  with no script execution, so viewing a fetched page's HTML can't run
  its JavaScript.

## License

MIT — see [LICENSE](LICENSE).
