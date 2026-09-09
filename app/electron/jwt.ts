import * as crypto from "crypto";
import * as fs from "fs";
import * as readline from "readline";
import { EventEmitter } from "events";
import {
  JwtAlgorithm,
  JwtCrackRequest,
  JwtDecodeResult,
  JwtSignRequest,
  JwtSignResult,
  JwtVerifyRequest,
  JwtVerifyResult,
} from "./types";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

const HMAC_HASH: Record<string, string> = { HS256: "sha256", HS384: "sha384", HS512: "sha512" };
const RSA_HASH: Record<string, string> = { RS256: "sha256", RS384: "sha384", RS512: "sha512" };
const EC_HASH: Record<string, string> = { ES256: "sha256", ES384: "sha384", ES512: "sha512" };

/**
 * Splits a token into its raw base64url segments and best-effort JSON
 * decodes header/payload. Never throws -- a malformed token comes back
 * with wellFormed:false and an explanatory error instead, since this is
 * meant to happily accept tokens a human is actively tampering with.
 */
export function decodeJwt(token: string): JwtDecodeResult {
  const parts = token.trim().split(".");
  if (parts.length < 2) {
    return {
      wellFormed: false,
      header: null,
      payload: null,
      headerRaw: "",
      payloadRaw: "",
      signatureB64Url: "",
      algorithm: null,
      error: "Not a JWT: expected at least header.payload (dot-separated base64url segments)",
    };
  }
  const [headerRaw, payloadRaw, signatureB64Url = ""] = parts;
  let header: any = null;
  let payload: any = null;
  let error: string | undefined;
  try {
    header = JSON.parse(b64urlDecode(headerRaw).toString("utf-8"));
  } catch (e: any) {
    error = `Header isn't valid JSON: ${e.message}`;
  }
  try {
    payload = JSON.parse(b64urlDecode(payloadRaw).toString("utf-8"));
  } catch (e: any) {
    error = error ? `${error}; payload isn't valid JSON: ${e.message}` : `Payload isn't valid JSON: ${e.message}`;
  }
  return {
    wellFormed: true,
    header,
    payload,
    headerRaw,
    payloadRaw,
    signatureB64Url,
    algorithm: header?.alg ?? null,
    error,
  };
}

function computeSignature(signingInput: string, algorithm: JwtAlgorithm, secretOrKey: string): Buffer {
  if (algorithm === "none") return Buffer.alloc(0);
  if (algorithm in HMAC_HASH) {
    return crypto.createHmac(HMAC_HASH[algorithm], secretOrKey).update(signingInput).digest();
  }
  if (algorithm in RSA_HASH) {
    return crypto.sign(RSA_HASH[algorithm], Buffer.from(signingInput), secretOrKey);
  }
  if (algorithm in EC_HASH) {
    // JWT (RFC 7518) wants the raw R||S "IEEE P1363" signature format, not
    // the DER encoding Node's crypto uses by default for EC -- ask for it
    // explicitly or every ES256/384/512 token we produce would be rejected
    // by any spec-compliant verifier.
    return crypto.sign(EC_HASH[algorithm], Buffer.from(signingInput), {
      key: secretOrKey,
      dsaEncoding: "ieee-p1363",
    });
  }
  throw new Error(`Unsupported algorithm: ${algorithm}`);
}

/**
 * Builds a JWT from raw header/payload JSON text exactly as typed (not
 * re-serialized through JSON.parse/stringify, which could reorder keys)
 * signed with the chosen algorithm. The algorithm used to sign is
 * independent from whatever "alg" the header JSON happens to say --
 * that's deliberate, it's what lets you test alg-confusion / alg:none
 * attacks by hand.
 */
export function signJwt(req: JwtSignRequest): JwtSignResult {
  try {
    JSON.parse(req.headerJson);
    JSON.parse(req.payloadJson);
  } catch (e: any) {
    return { token: "", error: `Header/payload must be valid JSON: ${e.message}` };
  }
  try {
    const headerB64 = b64url(Buffer.from(req.headerJson, "utf-8"));
    const payloadB64 = b64url(Buffer.from(req.payloadJson, "utf-8"));
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = computeSignature(signingInput, req.algorithm, req.secretOrKey);
    return { token: `${signingInput}.${b64url(sig)}` };
  } catch (e: any) {
    return { token: "", error: e?.message || String(e) };
  }
}

export function verifyJwt(req: JwtVerifyRequest): JwtVerifyResult {
  const decoded = decodeJwt(req.token);
  if (!decoded.wellFormed) return { valid: false, algorithm: "?", reason: "Malformed token" };
  const algorithm = (req.algorithm || decoded.algorithm || "").toUpperCase() as JwtAlgorithm;
  if (!algorithm) return { valid: false, algorithm: "?", reason: "No algorithm in header and none specified" };

  const signingInput = `${decoded.headerRaw}.${decoded.payloadRaw}`;
  const providedSig = b64urlDecode(decoded.signatureB64Url);

  try {
    if (algorithm === "none") {
      return { valid: providedSig.length === 0, algorithm, reason: providedSig.length === 0 ? undefined : "alg=none but a signature is present" };
    }
    if (algorithm in HMAC_HASH) {
      const expected = crypto.createHmac(HMAC_HASH[algorithm], req.secretOrKey).update(signingInput).digest();
      const valid = expected.length === providedSig.length && crypto.timingSafeEqual(expected, providedSig);
      return { valid, algorithm, reason: valid ? undefined : "Signature does not match this secret" };
    }
    if (algorithm in RSA_HASH) {
      const valid = crypto.verify(RSA_HASH[algorithm], Buffer.from(signingInput), req.secretOrKey, providedSig);
      return { valid, algorithm, reason: valid ? undefined : "Signature does not match this public key" };
    }
    if (algorithm in EC_HASH) {
      const valid = crypto.verify(
        EC_HASH[algorithm],
        Buffer.from(signingInput),
        { key: req.secretOrKey, dsaEncoding: "ieee-p1363" },
        providedSig
      );
      return { valid, algorithm, reason: valid ? undefined : "Signature does not match this public key" };
    }
    return { valid: false, algorithm, reason: `Unsupported algorithm: ${algorithm}` };
  } catch (e: any) {
    return { valid: false, algorithm, reason: e?.message || String(e) };
  }
}

/**
 * Brute-forces an HS256/384/512 secret against a wordlist -- the classic
 * "weak JWT secret" check. Streams the wordlist line by line (rockyou.txt
 * is 14M+ lines) so memory use stays flat regardless of wordlist size,
 * and is cancellable mid-run.
 */
export class JwtCracker extends EventEmitter {
  private cancelled = new Set<string>();

  cancel(jobId: string) {
    this.cancelled.add(jobId);
  }

  async run(jobId: string, req: JwtCrackRequest): Promise<void> {
    const decoded = decodeJwt(req.token);
    if (!decoded.wellFormed) {
      this.emit("event", { jobId, type: "error", message: "Malformed token" });
      return;
    }
    const algorithm = (decoded.algorithm || "").toUpperCase();
    const hashAlg = HMAC_HASH[algorithm];
    if (!hashAlg) {
      this.emit("event", {
        jobId,
        type: "error",
        message: `alg=${decoded.algorithm || "?"} isn't a symmetric HMAC algorithm -- secret brute-force only applies to HS256/HS384/HS512 tokens.`,
      });
      return;
    }
    if (!fs.existsSync(req.wordlistFile)) {
      this.emit("event", { jobId, type: "error", message: `Wordlist not found: ${req.wordlistFile}` });
      return;
    }

    const signingInput = `${decoded.headerRaw}.${decoded.payloadRaw}`;
    const target = b64urlDecode(decoded.signatureB64Url);

    const rl = readline.createInterface({ input: fs.createReadStream(req.wordlistFile, { encoding: "utf-8" }) });
    let tried = 0;
    const started = Date.now();
    let lastEmit = started;

    for await (const line of rl) {
      if (this.cancelled.has(jobId)) {
        this.cancelled.delete(jobId);
        rl.close();
        this.emit("event", { jobId, type: "done", tried });
        return;
      }
      const candidate = line.replace(/\r$/, "");
      if (!candidate) continue;
      tried++;
      const digest = crypto.createHmac(hashAlg, candidate).update(signingInput).digest();
      if (digest.length === target.length && crypto.timingSafeEqual(digest, target)) {
        rl.close();
        this.emit("event", { jobId, type: "found", secret: candidate, tried });
        this.emit("event", { jobId, type: "done", tried });
        return;
      }
      const now = Date.now();
      if (now - lastEmit > 300) {
        this.emit("event", { jobId, type: "progress", tried, ratePerSec: Math.round((tried * 1000) / (now - started)) });
        lastEmit = now;
      }
    }

    this.emit("event", { jobId, type: "done", tried });
  }
}
