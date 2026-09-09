// The full Wraith manual, as data.
//
// HOW TO UPDATE THIS WHEN THE APP CHANGES: find the DocsSection for the
// tool you changed (sections are listed in sidebar order, matching the
// app) and edit its `body` array. Each block is one of the types in
// ./types.ts (`p` for a paragraph, `fields` for a parameter table,
// `example` for a numbered walkthrough, `code` for a command/snippet
// block, `note` for a callout, `list` for a bullet list). Nothing here
// touches layout or styling -- DocsPage.tsx renders whatever you put in
// `body` in order. Add a new DocsSection to the exported array for a
// whole new tool; keep `id` URL-safe (used as the #/docs/<id> anchor).

import { DocsSection } from "./types";

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: "setup",
    title: "Setup (Welcome)",
    summary: "First screen you see — get your browser and the CA certificate talking to Wraith's proxy.",
    icon: "proxy",
    body: [
      {
        type: "p",
        text: "Shown automatically the first time you launch Wraith, and reachable afterward any time from the sidebar. Its job is to get you from a fresh install to intercepting real traffic in under a minute.",
      },
      {
        type: "fields",
        items: [
          { name: "Local IP chips", description: "Every real IP address on this machine, as clickable/copyable chips. Use the non-internal one (not 127.0.0.1) if you want another device on your network to proxy through Wraith too." },
          { name: "Port", description: "The proxy's listening port.", default: "8081" },
          { name: "Start proxy / Stop proxy", description: "Toggles the MITM proxy engine. Nothing is intercepted, logged, or capturable until this is on." },
        ],
      },
      {
        type: "p",
        text: "Three tabs walk through pointing a browser at the proxy:",
      },
      {
        type: "list",
        items: [
          "Firefox + FoxyProxy — install the FoxyProxy extension from addons.mozilla.org, Options → Add → New Proxy, set the shown IP and port, tick \"Also use this proxy for HTTPS\", set the pattern to * (all URLs), then select the profile from FoxyProxy's toolbar icon.",
          "Chrome/Chromium — launch with --proxy-server=<ip>:<port>, or use a proxy-switch extension like Proxy SwitchyOmega.",
          "System-wide — Windows: Settings → Network & Internet → Proxy → Manual setup. macOS: System Settings → Network → Details → Proxies. Linux (GNOME): Settings → Network → Network Proxy → Manual.",
        ],
      },
      {
        type: "p",
        text: "Below that, a Certificate Authority card shows the SHA-256 fingerprint of Wraith's generated root CA (it only exists after the proxy has started at least once — the card says so until then), with Export cert to Desktop and Open certificate folder buttons, plus per-browser trust steps:",
      },
      {
        type: "list",
        items: [
          "Firefox has its own certificate store, separate from the OS: Settings → Privacy & Security → Certificates → View Certificates → Authorities tab → Import → pick the exported .pem → tick \"Trust this CA to identify websites\".",
          "Chrome / system on Linux: sudo cp ~/.config/Wraith/ca/certs/ca.pem /usr/local/share/ca-certificates/wraith-ca.crt && sudo update-ca-certificates",
          "Windows: double-click the exported certificate → Install Certificate → Local Machine → place it in \"Trusted Root Certification Authorities\".",
          "macOS: open the certificate in Keychain Access → System keychain → double-click it → Trust → \"Always Trust\".",
        ],
      },
      {
        type: "note",
        kind: "warn",
        text: "Skip the CA trust step and every HTTPS site will show a certificate warning when browsed through Wraith. That's expected — it's exactly how Burp, mitmproxy, or any MITM proxy behaves, not a bug.",
      },
      {
        type: "p",
        text: "\"Got it, let's go\" marks first-run complete and jumps to Intercept. You can come back to Setup any time from the sidebar — it's not a one-shot wizard.",
      },
    ],
  },

  {
    id: "intercept",
    title: "Intercept",
    summary: "Pause live traffic, edit it in flight, then forward or drop it.",
    icon: "intercept",
    body: [
      {
        type: "p",
        text: "This is the core MITM feature. The first time you visit an HTTPS host through the proxy, Wraith mints a leaf certificate for that host on the fly, signed by its own root CA (the one from Setup) — every subsequent visit to that host reuses the cached cert.",
      },
      {
        type: "fields",
        items: [
          { name: "Intercept requests", description: "Pauses matching requests before they reach the real server, so you can inspect/edit them.", default: "off" },
          { name: "Intercept responses", description: "Pauses matching responses before they reach your browser.", default: "off" },
          { name: "Scope", description: "A list of patterns matched against the URL/host. An empty list means intercept everything. Prefix a pattern with re: for a full regular expression instead of a plain substring match." },
        ],
      },
      {
        type: "note",
        text: "With both toggles off, traffic flows straight through unpaused and is still logged to History — it's just not interactively held for editing. Turn a toggle on when you actually want to stop and touch something.",
      },
      {
        type: "p",
        text: "When something is held, a card appears with the full request (method, URL, headers, body) or response (status, headers, body), every field editable. Two actions:",
      },
      {
        type: "fields",
        items: [
          { name: "Forward", description: "Sends your edited version onward — to the real server (for a held request) or on to your browser (for a held response)." },
          { name: "Drop", description: "Kills it. The client gets a 502 instead of ever reaching the real destination. If Settings → General → \"Confirm before dropping\" is on, this asks first." },
          { name: "Forward all", description: "Appears once more than one item is queued — releases everything at once without editing each individually." },
          { name: "Send to Repeater", description: "Sends the current (edited or original) request into a new Repeater tab, without affecting what you do with the held item itself — you can still Forward or Drop it separately." },
        ],
      },
      {
        type: "note",
        text: "The sidebar's Intercept item and the held-item card both flash red the moment something new is captured, even if you're on a completely different page — so you never miss a held request just because Intercept wasn't the active tab. Turn this off in Settings → General → \"Flash red when Intercept captures something\".",
      },
      {
        type: "example",
        title: "Editing a login request on the fly",
        steps: [
          "Turn on \"Intercept requests\" and add a scope pattern like /login so only that endpoint pauses.",
          "Submit the login form in your browser — it hangs, waiting on Wraith.",
          "The held request card shows the POST body with your username/password. Change a parameter, add a header, whatever you're testing.",
          "Click Forward — your edited version is what actually reaches the server.",
        ],
      },
    ],
  },

  {
    id: "history",
    title: "History",
    summary: "Everything that passed through the proxy — searchable, tagged, exportable.",
    icon: "history",
    body: [
      {
        type: "p",
        text: "A live table of every exchange the proxy has seen: method, host + path, status code, size, time taken. Wraith auto-tags each one (json, graphql, html, xml, js, css, image, auth, cookie, form, error, websocket), and the highlight rules you configure in Settings color-tint matching rows so, say, every GraphQL call jumps out while you scroll past everything else.",
      },
      {
        type: "fields",
        items: [
          { name: "Search box", description: "Filters by method, URL, status, or tag — instantly, client-side, no round trip." },
          { name: "Row click", description: "Opens a detail panel: full request and response, pretty-printed JSON, binary bodies shown as a size with a \"show raw base64\" toggle instead of dumping garbage text." },
          { name: "Star", description: "Bookmarks an entry so it's easy to find again later." },
          { name: "Send to Repeater", description: "Opens the selected exchange's request in a new Repeater tab." },
          { name: "Export CSV / Export JSON", description: "Saves the currently-filtered list — id, method, url, host, port, isSSL, status, size, time, tags, timestamps, starred, source tool — to a file you choose. Bodies/headers aren't included (this is a \"what happened\" summary, not a full traffic dump — use Packet Capture's .pcap export or the raw history.jsonl on disk for that)." },
          { name: "Clear", description: "Wipes history (asks for confirmation first)." },
        ],
      },
    ],
  },

  {
    id: "repeater",
    title: "Repeater",
    summary: "Resend and tweak one request as many times as you like.",
    icon: "repeater",
    body: [
      {
        type: "p",
        text: "Burp's Repeater, basically. Multiple independent tabs, each holding one editable request (method, URL, headers, body) and its most recent response. Change one thing, hit Send, look at the result, change another thing, Send again — the standard loop for manually probing a single endpoint.",
      },
      {
        type: "fields",
        items: [
          { name: "Send", description: "Fires the request for real (bypasses the proxy engine entirely — this is a direct outbound call from the app, so it works whether or not the proxy is running)." },
          { name: "Render HTML tab", description: "Appears on the response side when the content-type looks like HTML. Renders inside a fully sandboxed iframe with script execution disabled, so viewing markup can never run its JavaScript." },
          { name: "Ignore TLS errors", description: "Per-tab checkbox — lets this specific request through even against a self-signed/misconfigured target." },
          { name: "+ (new tab)", description: "Opens a blank tab. Tabs also open pre-filled automatically via \"Send to Repeater\" from History, Intercept, or Crawler." },
        ],
      },
    ],
  },

  {
    id: "decoder",
    title: "Decoder",
    summary: "Encode, decode, and hash — pick an operation, hit Convert.",
    icon: "decoder",
    body: [
      {
        type: "p",
        text: "Paste text into the Input panel, click an operation to select it (it stays highlighted so it's clear what's about to happen), then click the Convert button to run it. Output lands in the right panel with Copy and Swap (moves output back into input, so you can chain operations — e.g. base64-decode, then url-decode the result).",
      },
      {
        type: "fields",
        items: [
          { name: "Base64", description: "Encode / Decode." },
          { name: "URL", description: "Encode / Decode (percent-encoding)." },
          { name: "Hex", description: "Encode / Decode." },
          { name: "HTML entities", description: "Encode / Decode (&lt;, &amp;, etc.)." },
          { name: "Unicode", description: "Escape / Unescape (\\uXXXX form)." },
          { name: "Gzip", description: "Encode / Decode — operates on base64 of the compressed bytes, since gzip output is binary." },
          { name: "JWT", description: "Quick decode shortcut. For anything beyond read-only decoding (signing, verifying, cracking a secret), use the dedicated JWT tool." },
          { name: "Hash", description: "MD5, SHA-1, SHA-256 of the input text." },
        ],
      },
    ],
  },

  {
    id: "capture",
    title: "Packet Capture",
    summary: "A live packet list backed by tshark — capture, filter, and export.",
    icon: "capture",
    body: [
      {
        type: "p",
        text: "Needs tshark installed. Wraith tells you if it's missing, with the right install command for your OS (sudo apt install tshark on Debian/Kali, brew install wireshark on macOS, or download Wireshark for Windows — its installer includes tshark.exe).",
      },
      {
        type: "fields",
        items: [
          { name: "Interface", description: "Which network interface to capture on, auto-listed from the system. Set a default in Settings → General so this pre-selects." },
          { name: "Capture filter", description: "BPF syntax, applied at capture start — e.g. tcp port 443. Narrows what actually gets written to disk." },
          { name: "Start / Stop", description: "Packets stream in live: time, source, destination, protocol, length, info. Click any packet for a full protocol-dissection detail view — the same depth as Wireshark's own packet detail pane." },
        ],
      },
      {
        type: "p",
        text: "Separately from the capture filter, a display filter bar lets you filter what's shown AFTER the fact — re-reading the already-captured file, changeable and clearable any time without recapturing anything.",
      },
      {
        type: "example",
        title: "Common display filters (built into the cheat sheet — click one to fill the box)",
        steps: [
          "http — only HTTP traffic",
          "http.request — only HTTP requests (not responses)",
          "http.response.code == 200 — successful HTTP responses",
          "tcp.port == 443 — traffic on port 443, either direction",
          "tcp.port == 80 || tcp.port == 443 — plain HTTP or HTTPS",
          "ip.addr == 192.168.1.10 — everything to/from a specific host",
          "ip.src == 10.0.0.5 — traffic FROM a host",
          "dns — DNS queries and responses",
          "tls.handshake.type == 1 — TLS ClientHello, i.e. the start of every HTTPS connection",
          "tcp.flags.syn == 1 && tcp.flags.ack == 0 — new connection attempts (SYN, no ACK)",
          "tcp.analysis.retransmission — retransmitted TCP segments, a sign of network trouble",
          "http.request.method == \"POST\" — POST requests only",
          "frame contains \"password\" — raw packet bytes contain a literal string, e.g. spotting cleartext credentials",
          "websocket — WebSocket traffic",
        ],
      },
      {
        type: "fields",
        items: [
          { name: "Export", description: "Saves the capture as .pcap, .pcapng, .json, or .csv — for opening in Wireshark itself, or feeding into any other tool. A checkbox controls whether only the currently-filtered packets are exported, or the full capture regardless of the active display filter." },
        ],
      },
    ],
  },

  {
    id: "cracker",
    title: "Cracker",
    summary: "John the Ripper and hashcat, with a normal UI and rockyou.txt ready to go.",
    icon: "cracker",
    body: [
      {
        type: "p",
        text: "A GUI over both John the Ripper and hashcat — each detected independently, so the page tells you if only one is installed rather than blocking entirely. Pick a hash file, pick a format (John: searchable dropdown of every format it supports, or leave on auto-detect; hashcat: searchable dropdown of every numbered mode, e.g. mode 0 = MD5, 1000 = NTLM, 1800 = sha512crypt).",
      },
      {
        type: "note",
        text: "Wraith auto-detects Kali's bundled /usr/share/wordlists/rockyou.txt and defaults to it, so wordlist attacks work out of the box with zero setup. If it's only present gzipped, an \"Extract now\" button unpacks it into Wraith's own data folder — no root needed. Override with your own wordlist any time via Browse, or set a permanent custom default in Settings → General → \"Default wordlist\".",
      },
      {
        type: "fields",
        items: [
          { name: "Wordlist attack", description: "Tries every line of the chosen wordlist as a candidate password." },
          { name: "Mask attack", description: "Brute-forces a pattern — ?l lowercase, ?u uppercase, ?d digit, ?s symbol, ?a all four. Example: ?u?l?l?l?l?d?d brute-forces one capital letter, four lowercase letters, then two digits (e.g. \"Pluto42\")." },
          { name: "Incremental brute-force", description: "John only — tries everything, unguided, slowest but exhaustive." },
          { name: "Enable rules", description: "Applies mutation rules to the wordlist (leetspeak substitutions, appended digits, capitalization variants, etc). John uses its bundled default ruleset automatically. hashcat has no built-in default — you must supply your own .rule file via the picker that appears once this is checked." },
          { name: "Extra arguments", description: "Passed straight through to the underlying tool's command line, for anything the UI doesn't expose." },
        ],
      },
      {
        type: "p",
        text: "Live console output streams as the job runs. The results table is backed by the tool's own authoritative --show / outfile mechanism (not just parsed off the live console, which is only a best-effort indicator) — so what you see there is trustworthy even if you check back long after the job finishes.",
      },
    ],
  },

  {
    id: "curl",
    title: "cURL Builder",
    summary: "Every flag is a button — build, preview, and run a real curl request.",
    icon: "curl",
    body: [
      {
        type: "p",
        text: "URL field, a method selector, and toggle chips for -L (follow redirects), -k (skip TLS verification), and -v (verbose) that light up when active. A headers editor, a body textarea with Content-Type presets (JSON/form/text) and a \"format JSON\" pretty-printer, and a collapsible More options section for User-Agent, Cookie, Basic auth, Proxy, Timeout, and a raw extra-arguments field for anything else curl supports.",
      },
      {
        type: "note",
        text: "A live command preview shows the literal curl … invocation as you toggle things, before you run anything. Execute runs the real curl binary directly — never through a shell — so nothing you type can break out into shell metacharacters, though curl itself will still honor whatever legitimate flags you pass it.",
      },
      {
        type: "fields",
        items: [
          { name: "Proxy field", description: "Route this specific curl call through Wraith's own proxy (host:port) so it also gets captured in History alongside your browser traffic." },
          { name: "Render if HTML", description: "When the response content-type looks like HTML, shows a rendered preview in a fully sandboxed iframe with no script execution, alongside the raw headers and body tabs." },
        ],
      },
    ],
  },

  {
    id: "crawler",
    title: "Crawler",
    summary: "Fast, JavaScript-free attack-surface mapping.",
    icon: "crawler",
    body: [
      {
        type: "p",
        text: "No headless browser involved — this crawls static HTML/links only, which makes it fast and dependency-free, but means it won't discover routes that only appear after client-side JavaScript runs (for a fully-rendered SPA, you'll get more mileage manually clicking through the app with Intercept on and letting History capture everything).",
      },
      {
        type: "fields",
        items: [
          { name: "Start URL / max depth / max pages / concurrency", description: "Standard crawl bounds." },
          { name: "Scope", description: "Stay on this exact host, or also follow subdomains." },
          { name: "forms", description: "Follows <form action> targets." },
          { name: "JS files", description: "Follows <script src> — useful for finding endpoints referenced only inside bundled JavaScript." },
          { name: "HTML comments", description: "Extracts URLs mentioned inside <!-- --> comments." },
          { name: "sitemap.xml / robots.txt", description: "Fetches and follows these directly." },
          { name: "common sensitive paths", description: "Probes a fixed list: .git/HEAD, .env, /admin, /login, /api, /graphql, /api/swagger.json, wp-login.php, .well-known/security.txt, backup.zip. A quick, noisy first pass — not a substitute for a dedicated content-discovery wordlist tool." },
        ],
      },
      {
        type: "p",
        text: "Results stream in live with status/content-type/depth, plus running visited/discovered counters. Each result offers \"Open externally\" and \"Send to Repeater\".",
      },
    ],
  },

  {
    id: "jwt",
    title: "JWT",
    summary: "Decode, sign, verify, and brute-force JSON Web Tokens.",
    icon: "jwt",
    body: [
      {
        type: "p",
        text: "A full JWT editor and attack tool, entirely local — nothing you paste in here ever leaves the machine. Paste a token and it live-decodes the header, payload, detected algorithm, and raw signature, tolerating malformed/partial input while you're still typing.",
      },
      {
        type: "p",
        text: "The Sign / reconstruct section lets you edit the header and payload JSON freely and produce a new signed token under any algorithm — none, HS256/384/512 (HMAC, needs a shared secret), RS256/384/512 (RSA, needs a PEM private key), ES256/384/512 (ECDSA, needs a PEM private key). The algorithm you sign with is deliberately independent from whatever \"alg\" the header JSON says — that's what lets you test alg-confusion attacks by hand.",
      },
      {
        type: "example",
        title: "alg:none attack, step by step",
        steps: [
          "Paste a token you intercepted (e.g. from History or Intercept) into the decode field.",
          "Click \"Strip signature (alg:none attack)\" — this sets the algorithm to none and immediately re-signs, producing header.payload. with an empty signature segment.",
          "Copy the resulting token and replay the request with it (e.g. via Repeater) in place of the original Authorization header.",
          "If the server accepts it, its JWT library trusts the client-supplied alg field instead of enforcing its own expected algorithm — a real, still-seen vulnerability class.",
        ],
      },
      {
        type: "example",
        title: "Alg-confusion (RS256 → HS256)",
        steps: [
          "If you can obtain the server's RSA public key (sometimes published, sometimes recoverable), paste it as the \"secret\" while selecting HS256 in the Sign section instead of RS256.",
          "A server that naively uses one \"verify\" function keyed only by whatever alg the token claims — without checking that alg matches what it actually expected — will treat your HMAC-signed token as validly signed, because it ends up HMAC-verifying against its own public key, which you supplied as the secret and therefore know.",
          "Use the Verify section afterward to confirm from the other side what a naive verifier would see as \"valid\".",
        ],
      },
      {
        type: "fields",
        items: [
          { name: "Verify", description: "Checks a token's signature against a secret or public key you supply. An optional algorithm override lets you deliberately force verification under a different algorithm than the header claims — for testing alg-confusion, not normal use." },
          { name: "Crack secret", description: "Brute-forces a weak HMAC secret (HS256/384/512 tokens only) against a wordlist — same rockyou.txt auto-detection as Cracker. Streams live progress (attempts tried, rate/sec) and shows the recovered secret the moment it's found, or a clear \"not found in this wordlist\" once it's exhausted." },
        ],
      },
      {
        type: "note",
        text: "Secret-cracking only applies to HS256/384/512 tokens — RS/ES tokens are asymmetric (public/private key pairs), so there's no shared \"secret\" to brute-force; the equivalent attack there is obtaining or confusing the key material instead, per the alg-confusion example above.",
      },
    ],
  },

  {
    id: "settings",
    title: "Settings",
    summary: "Proxy behavior, general preferences, highlight rules, CA management, and the danger zone.",
    icon: "settings",
    body: [
      {
        type: "fields",
        items: [
          { name: "Proxy → Port / Host", description: "Where the proxy listens.", default: "8081 / 0.0.0.0" },
          { name: "Proxy → Max body capture (MB)", description: "Bodies larger than this are still delivered to the client in full — only the first N MB is kept for the History/Repeater preview, so a huge download doesn't bloat memory." },
          { name: "Proxy → Allow self-signed upstream TLS", description: "Whether Wraith tolerates bad certificates on the REAL target server it's proxying to — independent from the browser-facing MITM cert, which is always Wraith's own." },
          { name: "General → History limit", description: "How many exchanges History keeps in memory before dropping the oldest." },
          { name: "General → Confirm before dropping", description: "Adds a confirmation prompt before Drop in Intercept." },
          { name: "General → Flash red on capture", description: "Toggles the Intercept arrival animation described in the Intercept section." },
          { name: "General → Default capture interface", description: "Pre-selects an interface on the Packet Capture page." },
          { name: "General → Default wordlist", description: "Overrides the auto-detected rockyou.txt for both Cracker and the JWT tool's secret-cracking." },
          { name: "General → Accent colors", description: "Two color pickers driving the app's signature teal → violet gradient — changes apply live across the whole interface." },
          { name: "General → Open DevTools on launch", description: "Developer convenience; takes effect on the next launch." },
          { name: "Highlight rules", description: "User-defined {enabled, color, label, matches a tag} rules controlling History's row color-tinting. Ships with sensible defaults (JSON, GraphQL, Auth/Cookies, 4xx/5xx) — add, edit, or remove freely." },
          { name: "Certificate Authority → Regenerate", description: "Wipes the current root CA and every certificate signed off it. The next proxy start mints a brand new one — every browser that trusted the old cert needs to trust the new one again. Asks for confirmation." },
          { name: "Danger zone → Purge all Wraith data", description: "Deletes settings, history, and the CA. Requires typing DELETE to confirm." },
        ],
      },
    ],
  },
];
