import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -----------------------------------------------------------------------
// The Wraith project doesn't have a public GitHub repo yet -- this is the
// ONE place that slug lives on the server side. Set the GITHUB_REPO env
// var (or edit the default below) once the project is pushed to GitHub.
// The frontend's src/config.ts has a matching placeholder used only to
// render a "View on GitHub" link before the API below has responded.
// -----------------------------------------------------------------------
const GITHUB_REPO = process.env.GITHUB_REPO || "YOUR_GITHUB_USERNAME/wraith";
const PORT = process.env.PORT || 4173;

const app = express();

let releaseCache = { at: 0, data: null };
const CACHE_MS = 5 * 60 * 1000;

function pickAsset(assets, matcher) {
  const found = assets.find((a) => matcher(String(a.name || "").toLowerCase()));
  return found ? { name: found.name, url: found.browser_download_url, size: found.size } : null;
}

app.get("/api/latest-release", async (_req, res) => {
  try {
    if (releaseCache.data && Date.now() - releaseCache.at < CACHE_MS) {
      res.json(releaseCache.data);
      return;
    }

    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "wraith-website" },
    });

    if (!ghRes.ok) {
      const payload = {
        repo: GITHUB_REPO,
        available: false,
        reason: ghRes.status === 404 ? "no-release-published" : `github-api-${ghRes.status}`,
        releasesUrl: `https://github.com/${GITHUB_REPO}/releases`,
      };
      releaseCache = { at: Date.now(), data: payload };
      res.json(payload);
      return;
    }

    const gh = await ghRes.json();
    const assets = Array.isArray(gh.assets) ? gh.assets : [];

    const payload = {
      repo: GITHUB_REPO,
      available: true,
      version: gh.tag_name,
      publishedAt: gh.published_at,
      releasesUrl: `https://github.com/${GITHUB_REPO}/releases`,
      htmlUrl: gh.html_url,
      assets: {
        windows: pickAsset(assets, (n) => n.endsWith(".exe")),
        linux: pickAsset(assets, (n) => n.endsWith(".deb")),
        mac: pickAsset(assets, (n) => n.endsWith(".dmg")),
      },
    };
    releaseCache = { at: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    res.status(502).json({
      repo: GITHUB_REPO,
      available: false,
      reason: "fetch-failed",
      error: String(err && err.message ? err.message : err),
      releasesUrl: `https://github.com/${GITHUB_REPO}/releases`,
    });
  }
});

const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));

// SPA fallback: anything not /api/* and not a real static file goes to index.html
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[wraith-website] listening on http://localhost:${PORT}`);
});
