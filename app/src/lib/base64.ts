/**
 * Every request/response body crossing the IPC bridge is base64 of the
 * raw bytes (see electron/types.ts). These helpers convert that to/from
 * displayable UTF-8 text without blowing the call stack on large bodies
 * (a naive `String.fromCharCode(...bytes)` spread fails above ~100k
 * bytes in most engines) and without corrupting multi-byte characters
 * the way `atob`/`btoa` alone would.
 */

export function base64ToUtf8(b64: string): string {
  if (!b64) return "";
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isLikelyBinary(bytes: Uint8Array, sampleSize = 512): boolean {
  const n = Math.min(sampleSize, bytes.length);
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 9 || b === 10 || b === 13) continue;
    if (b < 32 || b === 127) control++;
  }
  return n > 0 && control / n > 0.1;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
