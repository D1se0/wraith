import * as crypto from "crypto";
import * as zlib from "zlib";
import { CodecRequest, CodecResult } from "./types";

function htmlEncode(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function htmlDecode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Backs the Decoder tab. Runs in the main process (via IPC) rather than
 * the renderer so Buffer/crypto/zlib give byte-correct results for
 * arbitrary binary input, not just what the DOM's atob/btoa can handle.
 */
export function runCodec(req: CodecRequest): CodecResult {
  try {
    switch (req.op) {
      case "base64-encode":
        return { output: Buffer.from(req.input, "utf-8").toString("base64") };
      case "base64-decode":
        return { output: Buffer.from(req.input, "base64").toString("utf-8") };
      case "url-encode":
        return { output: encodeURIComponent(req.input) };
      case "url-decode":
        return { output: decodeURIComponent(req.input) };
      case "hex-encode":
        return { output: Buffer.from(req.input, "utf-8").toString("hex") };
      case "hex-decode":
        return { output: Buffer.from(req.input.replace(/\s+/g, ""), "hex").toString("utf-8") };
      case "html-entities-encode":
        return { output: htmlEncode(req.input) };
      case "html-entities-decode":
        return { output: htmlDecode(req.input) };
      case "unicode-escape":
        return { output: [...req.input].map((c) => (c.codePointAt(0)! > 126 ? "\\u" + c.codePointAt(0)!.toString(16).padStart(4, "0") : c)).join("") };
      case "unicode-unescape":
        return { output: req.input.replace(/\\u([0-9a-fA-F]{4})/g, (_m, g) => String.fromCharCode(parseInt(g, 16))) };
      case "jwt-decode": {
        const parts = req.input.trim().split(".");
        if (parts.length < 2) throw new Error("Not a JWT (expected header.payload.signature)");
        const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
        return { output: JSON.stringify({ header, payload }, null, 2) };
      }
      case "gzip-decode":
        return { output: zlib.gunzipSync(Buffer.from(req.input, "base64")).toString("utf-8") };
      case "gzip-encode":
        return { output: zlib.gzipSync(Buffer.from(req.input, "utf-8")).toString("base64") };
      case "md5":
        return { output: crypto.createHash("md5").update(req.input).digest("hex") };
      case "sha1":
        return { output: crypto.createHash("sha1").update(req.input).digest("hex") };
      case "sha256":
        return { output: crypto.createHash("sha256").update(req.input).digest("hex") };
      default:
        return { output: "", error: `Unknown operation: ${req.op}` };
    }
  } catch (err: any) {
    return { output: "", error: err?.message || String(err) };
  }
}
