## Wraith v0.4.0

The biggest release yet: an agentic AI assistant, a passive vulnerability
scanner, and eleven other new tools (Comparer, Identities, Fuzzer, Race,
Attack Chain, OOB Interactions, Findings, HAR import/export, session
save/load, a command palette, and a light theme) — plus five real bugs
found and fixed along the way.

### New

- **AI** — backed by your own Anthropic API key (Settings → AI). Two
  related features: contextual **"Ask Claude"** buttons (History, JWT,
  …) for a one-shot analysis of whatever's in front of you, and a
  dedicated **AI page** where an agentic tool-use loop can read History,
  run Decoder operations, decode JWTs, record/update Findings, navigate
  the app's own UI, and — only when it decides it's clearly useful, and
  always visibly flagged in the transcript — fire one live request
  through Repeater to test a hypothesis.
- **Findings** — a Kanban board (To do/Testing/Confirmed/Reported) fed by
  a **passive scanner** that checks every completed exchange for missing
  security headers, cookie flags, dangerous/wildcard CORS, likely leaked
  secrets (AWS/Google/Slack/Stripe key patterns), and open GraphQL
  introspection — no extra traffic, nothing to turn on.
- **Comparer** — line-by-line diff between any two captured
  requests/responses.
- **Identities** — save named sets of auth headers and **"Replay
  as…"** any of them straight from History, for fast broken access
  control / IDOR checks.
- **Fuzzer** — Intruder-style Sniper attack: mark payload positions with
  `§…§`, run a wordlist through each, sortable results grid.
- **Race** — fires many copies of a request essentially simultaneously to
  catch check-then-use race conditions, with an automatic "this looks
  like a race" flag when more requests succeed than should be possible.
- **Attack Chain** — a multi-step request sequence where a later step
  reuses a value extracted (JSON path or regex) from an earlier one's
  response — log in, extract a token, use it next — exportable as a
  standalone Python PoC script.
- **OOB Interactions** — generates a unique domain via the third-party
  [interactsh](https://github.com/projectdiscovery/interactsh) service
  and polls for DNS/HTTP/SMTP hits against it, to confirm blind SSRF,
  XXE and similar vulnerabilities that never return a visible response.
- **HAR import/export** in History, alongside the existing CSV/JSON
  export.
- **Export any request as a Python/JavaScript/Go snippet**, from History.
- **Session save/load**: bundle History, Findings, Identities and proxy
  config (incl. Match & Replace rules) into a portable `.wraith` file —
  never includes the AI API key.
- **Match & Replace** (Settings): global find/replace rules applied to
  every request/response through the proxy, by text or regex.
- **Command palette** (Ctrl/Cmd+K): jump to any page or run a quick
  action from anywhere.
- **Dark/Light theme** toggle (Settings → General), applied instantly.
- **Decoder "Magic" auto-detect**: guesses the encoding (JWT, Base64,
  hex, URL, HTML entities, gzip) from the input and converts it.
- A guided onboarding tour on first run (also replayable from Setup).
- Compact-row toggle and a resizable detail pane in History.

### Fixed

- **Repeater sends never showed up live in History** — they were saved
  to disk but the running UI only saw them after a full remount (i.e.
  navigating away and back). Now pushed in real time, same as proxy
  traffic.
- **HAR export mis-detected `Content-Type`** when a response used any
  capitalization other than exactly `content-type` (the overwhelming
  common case is `Content-Type`) — header lookups are case-insensitive
  now, as HTTP requires.
- **A validation error in the Fuzzer could get permanently stuck** on
  "Stop" with no way to restart — the error was emitted as an event
  faster than the UI had finished registering the job id that made it
  listen for that event. Validation now happens synchronously before any
  job starts, so it can never be missed.
- **A crash could take down the entire Settings page** — a hook was
  declared after an early return, violating React's Hook rules; harmless
  most of the time, but the first render after adding the new Session
  section hit it and blanked the whole page. Audited every other page in
  the app for the same pattern; none found.
- Various smaller inconsistencies caught while building the above (an
  `AskClaudeButton` that could re-fire a paid API call on every reopen
  after an error, an `Export code` Go snippet variable-naming slip).

### Known limitations

- WebSocket traffic passes through the proxy but is only logged, not yet
  interceptable/editable like HTTP(S) exchanges.
- The optional chained upstream proxy setting in Settings is not yet
  wired into the forwarding path.
- Match & Replace body rewriting only applies while Intercept Responses
  is on (the body has to be fully buffered first) — header/URL rewrites
  always apply.
- Windows and macOS installers build successfully on GitHub's native
  Windows/macOS runners, but their end-to-end runtime behavior hasn't
  been confirmed on real hardware yet — please report issues.

### Installing

- **Windows**: download `Wraith-Setup-0.4.0.exe`, run it.
- **Linux**: `sudo apt install ./Wraith-0.4.0-linux-amd64.deb` (or
  double-click it in a GUI package manager).
- **macOS**: open the `.dmg`, drag Wraith to Applications. It's
  unsigned, so the first launch needs right-click → Open to get past
  Gatekeeper.

Full manual: [docs](https://d1se0.github.io/wraith/#/docs) · [README](https://github.com/D1se0/wraith#readme).
