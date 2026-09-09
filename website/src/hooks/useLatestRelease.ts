import { useEffect, useState } from "react";
import { GITHUB_REPO_FALLBACK } from "../config";

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface LatestRelease {
  repo: string;
  available: boolean;
  version?: string;
  publishedAt?: string;
  releasesUrl: string;
  htmlUrl?: string;
  assets?: {
    windows: ReleaseAsset | null;
    linux: ReleaseAsset | null;
    mac: ReleaseAsset | null;
  };
  reason?: string;
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: LatestRelease }
  | { status: "error" };

function pickAsset(assets: any[], matcher: (name: string) => boolean): ReleaseAsset | null {
  const found = assets.find((a) => matcher(String(a.name || "").toLowerCase()));
  return found ? { name: found.name, url: found.browser_download_url, size: found.size } : null;
}

const CACHE_KEY = "wraith:latest-release";
const CACHE_MS = 5 * 60 * 1000;

/**
 * Talks to GitHub's REST API directly from the browser instead of going
 * through a server proxy. api.github.com sends CORS headers on its public
 * read endpoints, so this works whether the site is served by our own
 * Express server (website/server) or as static files on GitHub Pages,
 * which can't run Node at all. One build, both hosting paths.
 */
export function useLatestRelease(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (Date.now() - cached.at < CACHE_MS) {
            if (!cancelled) setState({ status: "ready", data: cached.data });
            return;
          }
        }
      } catch {
        /* sessionStorage unavailable or corrupt cache entry, ignore */
      }

      const releasesUrl = `https://github.com/${GITHUB_REPO_FALLBACK}/releases`;
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO_FALLBACK}/releases/latest`, {
          headers: { Accept: "application/vnd.github+json" },
        });

        let data: LatestRelease;
        if (!res.ok) {
          data = {
            repo: GITHUB_REPO_FALLBACK,
            available: false,
            reason: res.status === 404 ? "no-release-published" : `github-api-${res.status}`,
            releasesUrl,
          };
        } else {
          const gh = await res.json();
          const assets = Array.isArray(gh.assets) ? gh.assets : [];
          data = {
            repo: GITHUB_REPO_FALLBACK,
            available: true,
            version: gh.tag_name,
            publishedAt: gh.published_at,
            releasesUrl,
            htmlUrl: gh.html_url,
            assets: {
              windows: pickAsset(assets, (n) => n.endsWith(".exe")),
              linux: pickAsset(assets, (n) => n.endsWith(".deb")),
              mac: pickAsset(assets, (n) => n.endsWith(".dmg")),
            },
          };
        }

        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
        } catch {
          /* storage full/unavailable, non-fatal */
        }
        if (!cancelled) setState({ status: "ready", data });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export type DetectedOS = "windows" | "linux" | "mac" | "unknown";

export function detectOS(): DetectedOS {
  if (typeof navigator === "undefined") return "unknown";
  const ua = `${navigator.userAgent} ${navigator.platform || ""}`.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "unknown";
}
