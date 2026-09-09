import { execFile, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { JobRunner } from "../jobs";
import { tmpDir } from "../store";
import { CapturedPacketSummary, CaptureExportFormat } from "../types";

const TSHARK_BIN = process.platform === "win32" ? "tshark.exe" : "tshark";

// "  12  0.001234    10.0.0.1 → 10.0.0.2      TCP 74 51234 → 443 [SYN] ..."
const LINE_RE = /^\s*(\d+)\s+([\d.]+)\s+(\S+)\s+→\s+(\S+)\s+(\S+)\s+(\d+)\s+(.*)$/;

export interface TsharkAvailability {
  available: boolean;
  version?: string;
  installHint: string;
}

function installHint(): string {
  switch (process.platform) {
    case "darwin":
      return "brew install wireshark";
    case "win32":
      return "Download & install Wireshark from wireshark.org (includes tshark.exe), then restart Wraith.";
    default:
      return "sudo apt install tshark   (or: sudo dnf install wireshark-cli / sudo pacman -S wireshark-cli)";
  }
}

export function checkTsharkAvailable(): Promise<TsharkAvailability> {
  return new Promise((resolve) => {
    execFile(TSHARK_BIN, ["-v"], (err, stdout) => {
      if (err) {
        resolve({ available: false, installHint: installHint() });
        return;
      }
      resolve({ available: true, version: stdout.split("\n")[0], installHint: installHint() });
    });
  });
}

export function listCaptureInterfaces(): Promise<{ id: string; description: string }[]> {
  return new Promise((resolve) => {
    execFile(TSHARK_BIN, ["-D"], (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      // "1. eth0" or "2. wlan0 (Wi-Fi)"
      const lines = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const m = l.match(/^\d+\.\s+(\S+)\s*(.*)$/);
          return m ? { id: m[1], description: m[2] || m[1] } : null;
        })
        .filter((x): x is { id: string; description: string } => !!x);
      resolve(lines);
    });
  });
}

export class CaptureSession {
  private runner = new JobRunner();
  private pcapPath: string;
  private nextIdx = 1;

  readonly jobId: string;

  constructor() {
    this.jobId = randomUUID();
    this.pcapPath = path.join(tmpDir(), `capture-${this.jobId}.pcapng`);
  }

  get outputFile(): string {
    return this.pcapPath;
  }

  start(interfaceName: string, bpfFilter: string | undefined, onPacket: (p: CapturedPacketSummary) => void, onLog: (l: string) => void, onClose: (code: number | null) => void) {
    const args = ["-i", interfaceName, "-w", this.pcapPath, "-P", "-l"];
    if (bpfFilter && bpfFilter.trim()) {
      args.push("-f", bpfFilter.trim());
    }
    this.runner.on("stdout", (_id, line) => {
      const m = line.match(LINE_RE);
      if (!m) return;
      onPacket({
        id: this.nextIdx++,
        time: m[2],
        source: m[3],
        destination: m[4],
        protocol: m[5],
        length: Number(m[6]),
        info: m[7],
      });
    });
    this.runner.on("stderr", (_id, line) => onLog(line));
    this.runner.on("close", (_id, code) => onClose(code));
    this.runner.run(this.jobId, TSHARK_BIN, args);
  }

  stop() {
    this.runner.kill(this.jobId);
  }
}

/**
 * Re-reads an already-captured file through a Wireshark-style display
 * filter (e.g. "tcp.port == 443 && http") -- distinct from the BPF
 * capture filter you set when starting a capture, this one can be
 * changed and re-applied after the fact without recapturing anything.
 * Frame numbers are preserved from the original file, so a filtered
 * row's "id" still works with readPacketDetail().
 */
export function applyDisplayFilter(pcapPath: string, displayFilter: string): Promise<CapturedPacketSummary[]> {
  return new Promise((resolve, reject) => {
    const args = ["-r", pcapPath];
    if (displayFilter && displayFilter.trim()) args.push("-Y", displayFilter.trim());
    execFile(TSHARK_BIN, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        reject(new Error(stderr || err.message));
        return;
      }
      const packets: CapturedPacketSummary[] = [];
      for (const line of stdout.split("\n")) {
        const m = line.match(LINE_RE);
        if (!m) continue;
        packets.push({
          id: Number(m[1]),
          time: m[2],
          source: m[3],
          destination: m[4],
          protocol: m[5],
          length: Number(m[6]),
          info: m[7],
        });
      }
      resolve(packets);
    });
  });
}

const EXPORT_ARGS: Record<CaptureExportFormat, (destPath: string) => string[]> = {
  pcap: (dest) => ["-w", dest, "-F", "pcap"],
  pcapng: (dest) => ["-w", dest, "-F", "pcapng"],
  json: () => ["-T", "json"],
  csv: () => ["-T", "fields", "-e", "frame.number", "-e", "frame.time", "-e", "ip.src", "-e", "ip.dst", "-e", "_ws.col.Protocol", "-e", "frame.len", "-e", "_ws.col.Info", "-E", "header=y", "-E", "separator=,", "-E", "quote=d"],
};

/** Exports a capture to .pcap/.pcapng (native tshark -w) or .json/.csv (captured from stdout), optionally through a display filter first. */
export function exportCapture(pcapPath: string, format: CaptureExportFormat, destPath: string, displayFilter?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["-r", pcapPath];
    if (displayFilter && displayFilter.trim()) args.push("-Y", displayFilter.trim());
    args.push(...EXPORT_ARGS[format](destPath));

    const child = spawn(TSHARK_BIN, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));

    const writesToStdout = format === "json" || format === "csv";
    const out = writesToStdout ? fs.createWriteStream(destPath) : null;
    if (out) child.stdout.pipe(out);

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `tshark exited with code ${code}`));
    });
  });
}

export function readPacketDetail(pcapPath: string, frameNumber: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      TSHARK_BIN,
      ["-r", pcapPath, "-Y", `frame.number==${frameNumber}`, "-V"],
      { maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout);
      }
    );
  });
}
