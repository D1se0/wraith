import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { caDir } from "./store";
import { DiscoveredCertInfo } from "./types";

/**
 * http-mitm-proxy (via node-forge) writes its generated root CA to
 * <sslCaDir>/certs/ca.pem the first time the proxy starts. We point
 * sslCaDir at our own centralized ca/ folder so everything Wraith
 * touches stays under one root (see store.ts).
 */
export function sslCaDir(): string {
  return caDir();
}

export function caCertPath(): string {
  return path.join(sslCaDir(), "certs", "ca.pem");
}

/**
 * Wipes the whole CA folder (root cert/key + every per-host cert signed
 * off it) so http-mitm-proxy generates a brand new root CA the next time
 * the proxy starts. Callers must stop the proxy first -- deleting these
 * files out from under a running http-mitm-proxy instance would leave it
 * signing against files that no longer exist.
 */
export function regenerateCa(): void {
  const dir = sslCaDir();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

export function readCaCertInfo(): DiscoveredCertInfo | null {
  const p = caCertPath();
  if (!fs.existsSync(p)) return null;
  const pem = fs.readFileSync(p, "utf-8");
  const der = Buffer.from(
    pem.replace(/-----BEGIN CERTIFICATE-----/, "").replace(/-----END CERTIFICATE-----/, "").replace(/\s+/g, ""),
    "base64"
  );
  const fingerprint = crypto.createHash("sha256").update(der).digest("hex").match(/.{2}/g)!.join(":").toUpperCase();
  return { caCertPath: p, caCertPem: pem, fingerprintSha256: fingerprint };
}
