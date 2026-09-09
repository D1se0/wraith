export function prettyPrintMaybeJson(text: string): { pretty: string; isJson: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { pretty: text, isJson: false };
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return { pretty: text, isJson: false };
  try {
    return { pretty: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true };
  } catch {
    return { pretty: text, isJson: false };
  }
}

export function headerValue(headers: Record<string, any>, name: string): string {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : "";
}

export function headersToText(headers: Record<string, any>): string {
  return Object.entries(headers || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable, ignore */
  }
}
