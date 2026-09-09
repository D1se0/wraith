import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { tmpDir } from "../store";
import { CurlRunRequest, CurlRunResult } from "../types";

/**
 * Builds a curl argv array from the structured "button" options the
 * renderer exposes, then spawns curl DIRECTLY (never through a shell),
 * so nothing typed into a field can break out into shell metacharacters.
 * The equivalent argv is also returned so the UI can show the user the
 * literal command it just ran ("intuitive but transparent").
 */
export function buildCurlArgv(req: CurlRunRequest, headerFilePath: string, bodyFilePath: string): string[] {
  const argv: string[] = ["-s", "-S"];
  argv.push("-D", headerFilePath);
  argv.push("-o", bodyFilePath);
  argv.push("-X", req.method || "GET");
  if (req.followRedirects) argv.push("-L");
  if (req.insecure) argv.push("-k");
  if (req.verbose) argv.push("-v");
  if (req.userAgent) argv.push("-A", req.userAgent);
  if (req.cookie) argv.push("-b", req.cookie);
  if (req.authUser) argv.push("-u", req.authPass ? `${req.authUser}:${req.authPass}` : req.authUser);
  if (req.proxy) argv.push("-x", req.proxy);
  if (req.timeoutSeconds) argv.push("--max-time", String(req.timeoutSeconds));
  for (const h of req.headers) {
    if (h.key.trim()) argv.push("-H", `${h.key}: ${h.value}`);
  }
  if (req.data) {
    argv.push(req.dataIsFile ? "--data-binary" : "--data-raw", req.dataIsFile ? `@${req.data}` : req.data);
  }
  if (req.extraArgs) {
    argv.push(...splitShellLikeArgs(req.extraArgs));
  }
  argv.push(req.url);
  return argv;
}

function splitShellLikeArgs(s: string): string[] {
  return (s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map((a: string) => a.replace(/^"|"$/g, "").replace(/^'|'$/g, ""));
}

export function runCurl(req: CurlRunRequest): Promise<CurlRunResult> {
  return new Promise((resolve) => {
    const id = randomUUID();
    const workDir = path.join(tmpDir(), `curl-${id}`);
    fs.mkdirSync(workDir, { recursive: true });
    const headerFile = path.join(workDir, "headers.txt");
    const bodyFile = path.join(workDir, "body.bin");

    let argv: string[];
    try {
      argv = buildCurlArgv(req, headerFile, bodyFile);
    } catch (e: any) {
      resolve({ argv: [], exitCode: null, durationMs: 0, stdout: "", stderr: String(e?.message || e), headers: "", bodyBase64: "", contentType: null, error: e?.message });
      return;
    }

    const started = Date.now();
    const child = spawn("curl", argv, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      resolve({
        argv,
        exitCode: null,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        headers: "",
        bodyBase64: "",
        contentType: null,
        error: `Failed to launch curl: ${err.message}. Is curl installed and on PATH?`,
      });
    });

    child.on("close", (code) => {
      let headers = "";
      let bodyBase64 = "";
      let contentType: string | null = null;
      try {
        headers = fs.readFileSync(headerFile, "utf-8");
      } catch {
        /* no headers captured (e.g. connection failed) */
      }
      try {
        const buf = fs.readFileSync(bodyFile);
        bodyBase64 = buf.toString("base64");
      } catch {
        /* no body */
      }
      const ctMatch = headers.match(/^content-type:\s*(.+)$/im);
      if (ctMatch) contentType = ctMatch[1].trim();

      resolve({
        argv,
        exitCode: code,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        headers,
        bodyBase64,
        contentType,
      });

      fs.rm(workDir, { recursive: true, force: true }, () => undefined);
    });
  });
}
