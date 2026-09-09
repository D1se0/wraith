import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
import { JobRunner } from "../jobs";
import { tmpDir, wraithRoot } from "../store";
import { CrackerJobRequest, CrackerTool, DefaultWordlistInfo } from "../types";

const ROCKYOU_CANDIDATES = [
  "/usr/share/wordlists/rockyou.txt",
  "/usr/share/wordlists/rockyou.txt.gz",
  "/usr/local/share/wordlists/rockyou.txt",
  "/opt/wordlists/rockyou.txt",
];

/**
 * Wraith ships its own gzip-compressed copy of rockyou.txt (see
 * app/resources/wordlists and the `extraResources` entry in
 * package.json's electron-builder config) so the Cracker/JWT tabs have a
 * usable default wordlist out of the box on platforms that don't already
 * have one lying around -- Windows and macOS have no equivalent of
 * Kali's /usr/share/wordlists, and even other Linux distros may not.
 * Checked two ways since dev runs (`npm run dev`, or `electron .`
 * straight out of app/) never go through electron-builder's
 * extraResources copy step the way a packaged app does.
 */
function bundledWordlistGzPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || "", "wordlists", "rockyou.txt.gz"),
    path.join(__dirname, "..", "..", "resources", "wordlists", "rockyou.txt.gz"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/**
 * Looks for a usable rockyou.txt so the Cracker tab can default to it
 * instead of forcing every user to go find a wordlist first: an already
 * Wraith-extracted copy, then the OS's own copy if there is one (handles
 * both the plain file and the gzipped form some distros/packages ship --
 * `apt install wordlists` on Debian leaves it as rockyou.txt.gz), and
 * finally the copy bundled inside Wraith itself.
 */
export function findDefaultWordlist(): DefaultWordlistInfo {
  const extractedPath = path.join(wraithRoot(), "wordlists", "rockyou.txt");
  if (fs.existsSync(extractedPath)) {
    return { path: extractedPath, needsExtraction: false, sizeBytes: fs.statSync(extractedPath).size };
  }
  for (const candidate of ROCKYOU_CANDIDATES) {
    if (!fs.existsSync(candidate)) continue;
    if (candidate.endsWith(".gz")) {
      return { path: null, needsExtraction: true };
    }
    return { path: candidate, needsExtraction: false, sizeBytes: fs.statSync(candidate).size };
  }
  if (bundledWordlistGzPath()) {
    return { path: null, needsExtraction: true };
  }
  return { path: null, needsExtraction: false };
}

/** Extracts whichever rockyou.txt.gz findDefaultWordlist() found (OS-provided or Wraith's own bundled copy) into our own data folder (no root needed, unlike writing back into /usr/share). */
export async function extractDefaultWordlist(): Promise<DefaultWordlistInfo> {
  const gzPath = ROCKYOU_CANDIDATES.find((c) => c.endsWith(".gz") && fs.existsSync(c)) || bundledWordlistGzPath();
  if (!gzPath) return findDefaultWordlist();

  const destDir = path.join(wraithRoot(), "wordlists");
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, "rockyou.txt");
  const tmpPath = `${destPath}.partial`;

  await pipeline(fs.createReadStream(gzPath), zlib.createGunzip(), fs.createWriteStream(tmpPath));
  fs.renameSync(tmpPath, destPath);

  return { path: destPath, needsExtraction: false, sizeBytes: fs.statSync(destPath).size };
}

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
      // hashcat has no bundled default ruleset the way John does -- only
      // apply -r when the user actually picked a .rule file, otherwise
      // this used to point at a hardcoded path that doesn't exist on a
      // stock install and would make every rules-enabled run fail outright.
      if (req.rulesEnabled && req.rulesFile) args.push("-r", req.rulesFile);
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
