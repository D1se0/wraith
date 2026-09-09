import { execFile } from "child_process";
import * as path from "path";
import { randomUUID } from "crypto";
import { JobRunner } from "../jobs";
import { tmpDir } from "../store";
import { CapturedPacketSummary } from "../types";

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
