import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Purely static + SPA fallback. The "latest release" download data comes
// straight from GitHub's API on the client (see src/hooks/useLatestRelease.ts)
// so the exact same `dist/` build works self-hosted here via Node AND as
// static files on GitHub Pages, which can't run a server at all.
const PORT = process.env.PORT || 4173;

const app = express();

const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));

app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[wraith-website] listening on http://localhost:${PORT}`);
});
