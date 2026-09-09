## Wraith v0.3.0

Fixes a real Repeater bug the moment you'd actually hit it, adds tab
groups/renaming, and makes the default cracking wordlist work on every
OS — not just Kali.

### Fixed

- **Sending two different requests to Repeater could overwrite/lose a
  previous tab.** Repeater's tabs lived in the page's own component
  state, which resets every time you navigate away and back (the same
  class of bug already fixed for Intercept in v0.2.0). Tabs now live in
  shared app state and survive navigation — verified by sending three
  different same-domain requests with a full navigation between each;
  all three keep their own tab and data.
- **`window.prompt()` doesn't exist in Electron's renderer** (it throws
  outright) — the first pass at "create a new group" used it and was
  completely broken. Replaced with a real inline text field.

### New

- **Repeater tab groups**: assign tabs to a group, then send the whole
  group's requests **in parallel** or **sequentially**, like Burp's
  group-send. Rename any tab or group by double-clicking its label.
  Deleting a group ungroups its tabs instead of closing them.
- **rockyou.txt now works out of the box on Windows and macOS too** (and
  any Linux that isn't Kali) — Wraith ships its own compressed copy and
  falls back to it when the OS doesn't have one, extracted on first use
  the same way as before. Verified with a real install: hid this
  machine's system copy, installed the packaged app, confirmed it fell
  back to and extracted the bundled copy with a byte-for-byte matching
  checksum.

### Known limitations

- WebSocket traffic passes through the proxy but is only logged, not yet
  interceptable/editable like HTTP(S) exchanges.
- The optional chained upstream proxy setting in Settings is not yet
  wired into the forwarding path.
- Windows and macOS installers build successfully on GitHub's native
  Windows/macOS runners, but their end-to-end runtime behavior hasn't
  been confirmed on real hardware yet — please report issues.

### Installing

- **Windows**: download `Wraith-Setup-0.3.0.exe`, run it.
- **Linux**: `sudo apt install ./Wraith-0.3.0-linux-amd64.deb` (or
  double-click it in a GUI package manager).
- **macOS**: open the `.dmg`, drag Wraith to Applications. It's
  unsigned, so the first launch needs right-click → Open to get past
  Gatekeeper.

Full manual: [docs](https://d1se0.github.io/wraith/#/docs) · [README](https://github.com/D1se0/wraith#readme).
