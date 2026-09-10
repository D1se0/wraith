import * as crypto from "crypto";
import { EventEmitter } from "events";
import { OobInteraction } from "./types";

/**
 * Minimal client for the interactsh out-of-band interaction protocol
 * (https://github.com/projectdiscovery/interactsh) -- generates a unique
 * subdomain, registers it with a public interactsh server, and polls for
 * DNS/HTTP/SMTP/etc hits against it. Used to confirm blind SSRF, XXE,
 * blind command injection and similar vulnerabilities that don't return
 * any visible response.
 *
 * Talks to a third-party service (no server of our own) -- the generated
 * domain and any interaction data it reports pass through interactsh's
 * infrastructure, not just this machine.
 */

const SERVERS = ["oast.fun", "oast.pro", "oast.live", "oast.site", "oast.online", "oast.me"];
const POLL_INTERVAL_MS = 7000;
const CORRELATION_ID_LENGTH = 20;
const NONCE_LENGTH = 13;

function randomAlnum(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

interface Session {
  id: string;
  server: string;
  correlationId: string;
  secretKey: string;
  privateKey: string;
  domain: string;
  timer: NodeJS.Timeout | null;
  seenIds: Set<string>;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export class OobClient extends EventEmitter {
  private sessions = new Map<string, Session>();

  async start(sessionId: string): Promise<{ domain: string } | { error: string }> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const correlationId = randomAlnum(CORRELATION_ID_LENGTH);
    const secretKey = crypto.randomUUID();
    const publicKeyB64 = Buffer.from(publicKey, "utf-8").toString("base64");

    let lastErr: any = null;
    for (const server of SERVERS) {
      try {
        const result = await postJson(`https://${server}/register`, {
          "public-key": publicKeyB64,
          "secret-key": secretKey,
          "correlation-id": correlationId,
        });
        if (!result || typeof result.message !== "string" || !result.message.toLowerCase().includes("success")) {
          throw new Error(`Unexpected register response: ${JSON.stringify(result)}`);
        }
        const domain = `${correlationId}${randomAlnum(NONCE_LENGTH)}.${server}`;
        const session: Session = { id: sessionId, server, correlationId, secretKey, privateKey, domain, timer: null, seenIds: new Set() };
        this.sessions.set(sessionId, session);
        this.poll(session);
        session.timer = setInterval(() => this.poll(session), POLL_INTERVAL_MS);
        return { domain };
      } catch (err: any) {
        lastErr = err;
        // try the next public server
      }
    }
    return { error: `Could not register with any interactsh server: ${lastErr?.message || lastErr}` };
  }

  stop(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.timer) clearInterval(session.timer);
    this.sessions.delete(sessionId);
    postJson(`https://${session.server}/deregister`, { "correlation-id": session.correlationId, "secret-key": session.secretKey }).catch(() => {
      /* best-effort cleanup -- the session naturally expires server-side either way */
    });
  }

  stopAll(): void {
    for (const id of Array.from(this.sessions.keys())) this.stop(id);
  }

  private decryptAesKey(session: Session, aesKeyB64: string): Buffer {
    return crypto.privateDecrypt({ key: session.privateKey, oaepHash: "sha256" }, Buffer.from(aesKeyB64, "base64"));
  }

  private decryptEntry(aesKey: Buffer, entryB64: string): OobInteraction | null {
    try {
      const raw = Buffer.from(entryB64, "base64");
      const iv = raw.subarray(0, 16);
      const ciphertext = raw.subarray(16);
      const decipher = crypto.createDecipheriv("aes-256-ctr", aesKey, iv);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
      const parsed = JSON.parse(plain);
      return {
        protocol: parsed["protocol"],
        uniqueId: parsed["unique-id"],
        fullId: parsed["full-id"],
        qType: parsed["q-type"],
        rawRequest: parsed["raw-request"],
        rawResponse: parsed["raw-response"],
        remoteAddress: parsed["remote-address"],
        timestamp: parsed["timestamp"],
      };
    } catch {
      return null;
    }
  }

  private async poll(session: Session): Promise<void> {
    try {
      const res = await fetch(`https://${session.server}/poll?id=${session.correlationId}&secret=${session.secretKey}`);
      if (!res.ok) return; // transient server hiccup -- just wait for the next tick
      const body = (await res.json()) as { data?: string[]; aes_key?: string };
      if (!body.data || body.data.length === 0 || !body.aes_key) return;

      const aesKey = this.decryptAesKey(session, body.aes_key);
      for (const entry of body.data) {
        const interaction = this.decryptEntry(aesKey, entry);
        if (!interaction || session.seenIds.has(interaction.fullId)) continue;
        session.seenIds.add(interaction.fullId);
        this.emit("event", { sessionId: session.id, type: "interaction", interaction });
      }
    } catch (err: any) {
      this.emit("event", { sessionId: session.id, type: "error", message: err?.message || String(err) });
    }
  }
}
