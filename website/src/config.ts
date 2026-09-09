// Matches server/index.js's GITHUB_REPO default. Update both when the
// project gets a real GitHub home. This constant only backs the "View on
// GitHub" link before /api/latest-release has responded (which returns
// the authoritative `repo` field once loaded).
export const GITHUB_REPO_FALLBACK = "D1se0/wraith";
export const GITHUB_URL_FALLBACK = `https://github.com/${GITHUB_REPO_FALLBACK}`;
