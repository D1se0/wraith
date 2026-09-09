// The one place the repo slug lives. useLatestRelease() calls GitHub's
// API directly with this (works both on GitHub Pages, which is static
// only, and when self-hosted via server/index.js).
export const GITHUB_REPO_FALLBACK = "D1se0/wraith";
export const GITHUB_URL_FALLBACK = `https://github.com/${GITHUB_REPO_FALLBACK}`;
