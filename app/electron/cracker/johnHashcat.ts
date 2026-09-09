import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { JobRunner } from "../jobs";
import { tmpDir } from "../store";
import { CrackerJobRequest, CrackerTool } from "../types";

export interface CrackerAvailability {
  john: { available: boolean; version?: string };
  hashcat: { available: boolean; version?: string };
  installHint: string;
}

function installHint(): string {
  switch (process.platform) {
    case "darwin":
      return "brew install john-jumbo hashcat";
    case "win32":
      return "Download John the Ripper and hashcat from openwall.com / hashcat.net, unzip and add their folder to PATH.";
    default:
      return "sudo apt install john hashcat   (Kali/most distros already ship both)";
  }
}

export function checkCrackerAvailable(): Promise<CrackerAvailability> {
  const probeJohn = new Promise<{ available: boolean; version?: string }>((resolve) => {
    execFile("john", ["--list=build-info"], (err, stdout) => {
      if (err) return resolve({ available: false });
      resolve({ available: true, version: stdout.split("\n")[0]?.replace("Version: ", "") });
    });
  });
  const probeHashcat = new Promise<{ available: boolean; version?: string }>((resolve) => {
    execFile("hashcat", ["--version"], (err, stdout) => {
      if (err) return resolve({ available: false });
      resolve({ available: true, version: stdout.trim() });
    });
  });
  return Promise.all([probeJohn, probeHashcat]).then(([john, hashcat]) => ({
    john,
    hashcat,
    installHint: installHint(),
  }));
}

export function listHashcatModes(): Promise<{ mode: string; name: string }[]> {
  return new Promise((resolve) => {
    execFile("hashcat", ["--help"], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const lines = stdout.split("\n");
      const out: { mode: string; name: string }[] = [];
      for (const line of lines) {
        const m = line.match(/^\s*(\d{1,5})\s+\|\s+(.+?)\s+\|/);
        if (m) out.push({ mode: m[1], name: m[2].trim() });
      }
      resolve(out);
    });
  });
}

export function listJohnFormats(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("john", ["--list=formats"], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(
        stdout
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    });
  });
}

export interface CrackerJobHandle {
  jobId: string;
  tool: CrackerTool;
  potPath?: string;
  outPath?: string;
  hashFile: string;
  johnFormat?: string;
}

export class CrackerRunner {
  readonly events = new JobRunner();
  private runner = this.events;

  start(req: CrackerJobRequest): CrackerJobHandle {
    const jobId = randomUUID();
    const workDir = path.join(tmpDir(), `crack-${jobId}`);
    fs.mkdirSync(workDir, { recursive: true });

    if (req.tool === "john") {
      const potPath = path.join(workDir, "john.pot");
      const args: string[] = [`--pot=${potPath}`];
      if (req.johnFormat) args.push(`--format=${req.johnFormat}`);
      if (req.attackMode === "mask" && req.mask) {
        args.push(`--mask=${req.mask}`);
      } else if (req.wordlistFile) {
        args.push(`--wordlist=${req.wordlistFile}`);
        if (req.rulesEnabled) args.push("--rules");
      } else {
        args.push("--incremental");
      }
      if (req.extraArgs) args.push(...splitArgs(req.extraArgs));
      args.push(req.hashFile);
      this.runner.run(jobId, "john", args);
      return { jobId, tool: "john", potPath, hashFile: req.hashFile, johnFormat: req.johnFormat };
    }

    // hashcat
    const potPath = path.join(workDir, "hashcat.pot");
    const outPath = path.join(workDir, "cracked.txt");
    const attackModeNum = req.attackMode === "mask" ? "3" : req.attackMode === "bruteforce" ? "3" : "0";
    const args: string[] = [
      "-m",
      req.hashcatMode || "0",
      "-a",
      attackModeNum,
      "--potfile-path",
      potPath,
      "-o",
      outPath,
      "--outfile-format",
      "1,2",
      "--status",
      "--status-timer=2",
      req.hashFile,
    ];
    if (attackModeNum === "3") {
      args.push(req.mask || "?a?a?a?a?a?a");
    } else if (req.wordlistFile) {
      args.push(req.wordlistFile);
      if (req.rulesEnabled) args.push("-r", "/usr/share/hashcat/rules/best64.rule");
    }
    if (req.extraArgs) args.push(...splitArgs(req.extraArgs));
    this.runner.run(jobId, "hashcat", args);
    return { jobId, tool: "hashcat", potPath, outPath, hashFile: req.hashFile };
  }

  stop(jobId: string): boolean {
    return this.runner.kill(jobId);
  }

  isRunning(jobId: string): boolean {
    return this.runner.isRunning(jobId);
  }
}

function splitArgs(s: string): string[] {
  return (s.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((a: string) => a.replace(/^"|"$/g, ""));
}

export function readCrackedResults(handle: CrackerJobHandle): Promise<{ hash: string; plain: string }[]> {
  return new Promise((resolve) => {
    if (handle.tool === "john") {
      const showArgs = [`--pot=${handle.potPath}`];
      if (handle.johnFormat) showArgs.push(`--format=${handle.johnFormat}`);
      showArgs.push("--show", handle.hashFile);
      execFile(
        "john",
        showArgs,
        { maxBuffer: 4 * 1024 * 1024 },
        (_err, stdout) => {
          const results: { hash: string; plain: string }[] = [];
          for (const line of (stdout || "").split("\n")) {
            const m = line.match(/^([^:]*):(.*)$/);
            if (m && !line.startsWith("0 password") && !/password hash(es)? cracked/i.test(line)) {
              results.push({ hash: m[1] || "(hash)", plain: m[2] });
            }
          }
          resolve(results);
        }
      );
    } else {
      try {
        const content = handle.outPath && fs.existsSync(handle.outPath) ? fs.readFileSync(handle.outPath, "utf-8") : "";
        const results = content
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const idx = line.lastIndexOf(":");
            return idx === -1 ? { hash: line, plain: "" } : { hash: line.slice(0, idx), plain: line.slice(idx + 1) };
          });
        resolve(results);
      } catch {
        resolve([]);
      }
    }
  });
}
