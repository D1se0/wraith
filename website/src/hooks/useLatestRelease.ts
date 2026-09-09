import { useEffect, useState } from "react";

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

export function useLatestRelease(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/latest-release")
      .then((r) => r.json())
      .then((data: LatestRelease) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
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
