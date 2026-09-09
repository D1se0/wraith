## Wraith v0.2.0

A big feature/fix batch on top of the first build: a real bug in
"Send to Repeater" is fixed, Intercept no longer loses a held request
when you switch tabs, and there's a full new JWT attack tool.

### New

- **JWT tool** — decode, sign/reconstruct (independent of the header's
  own `alg`, for alg-confusion testing), a one-click "strip signature
  (alg:none attack)" shortcut, verify against a secret/public key, and
  a wordlist-based HS256/384/512 secret cracker with live progress.
- **Packet Capture**: a post-capture display filter (separate from the
  BPF capture filter) with a built-in cheat sheet of common examples,
  and export to `.pcap` / `.pcapng` / `.json` / `.csv`.
- **History**: export the current view to CSV or JSON.
- **Cracker**: Kali's `rockyou.txt` is now auto-detected (and
  auto-extracted if only the `.gz` is present) as the default wordlist.
- **Settings**, significantly expanded: history limit, confirm-before-drop,
  the Intercept alert toggle, a default capture interface, a default
  wordlist override, live accent-color theming, devtools-on-launch, and
  a Certificate Authority section (export, open folder, **regenerate**).
- **Intercept**: a red flash on the sidebar and the held-item card when
  something new is captured (toggleable in Settings), and a
  "Send to Repeater" button right on a held item.
- **Decoder**: redesigned around picking an operation, then hitting a
  clear "Convert →" button, instead of every button firing immediately.

### Fixed

- **"Send to Repeater" did nothing** — a React state-update ordering bug
  in the app's shared context meant the pending request was always
  discarded before Repeater could read it.
- **A request held in Intercept could vanish from the UI** if you
  switched to another tab while the proxy still had it paused in the
  background — the queue now lives in shared app state instead of the
  Intercept page's own local state, so it survives navigation.
- **hashcat's "enable rules" always failed** on a stock install — it
  pointed at a rules file (`best64.rule`) that Kali's hashcat package
  doesn't ship. It's now a real file picker instead of a hardcoded path.
- Closed a class of race condition in the JWT cracker, Cracker, Packet
  Capture and Crawler pages where a very fast job could have its first
  result event silently dropped before the UI finished subscribing to
  it.

### Known limitations

- WebSocket traffic passes through the proxy but is only logged, not yet
  interceptable/editable like HTTP(S) exchanges.
- The optional chained upstream proxy setting in Settings is not yet
  wired into the forwarding path.
- Windows and macOS installers build successfully on GitHub's native
  Windows/macOS runners, but their end-to-end runtime behavior hasn't
  been confirmed on real hardware yet — please report issues.

### Installing

- **Windows**: download `Wraith-Setup-0.2.0.exe`, run it.
- **Linux**: `sudo apt install ./Wraith-0.2.0-linux-amd64.deb` (or
  double-click it in a GUI package manager).
- **macOS**: open the `.dmg`, drag Wraith to Applications. It's
  unsigned, so the first launch needs right-click → Open to get past
  Gatekeeper.

Full manual: [docs](https://d1se0.github.io/wraith/#/docs) · [README](https://github.com/D1se0/wraith#readme).
