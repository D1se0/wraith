import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import * as readline from "readline";

export interface JobHandle {
  id: string;
  proc: ChildProcessWithoutNullStreams;
  kill: () => void;
}

/**
 * Thin wrapper around child_process.spawn shared by the packet-capture
 * (tshark) and hash-cracking (john/hashcat) tools: always spawns with an
 * argv array (never a shell string, so nothing the user types can break
 * out into shell metacharacters), and emits parsed stdout/stderr lines.
 */
export class JobRunner extends EventEmitter {
  private jobs = new Map<string, ChildProcessWithoutNullStreams>();

  run(id: string, command: string, args: string[], opts: { cwd?: string } = {}): JobHandle {
    const proc = spawn(command, args, { cwd: opts.cwd, windowsHide: true });
    this.jobs.set(id, proc);

    const stdoutRl = readline.createInterface({ input: proc.stdout });
    stdoutRl.on("line", (line) => this.emit("stdout", id, line));
    const stderrRl = readline.createInterface({ input: proc.stderr });
    stderrRl.on("line", (line) => this.emit("stderr", id, line));

    proc.on("error", (err) => {
      this.emit("error", id, err.message);
      this.jobs.delete(id);
    });
    proc.on("close", (code) => {
      this.jobs.delete(id);
      this.emit("close", id, code);
    });

    return {
      id,
      proc,
      kill: () => {
        try {
          proc.kill("SIGTERM");
        } catch {
          /* already dead */
        }
      },
    };
  }

  kill(id: string): boolean {
    const proc = this.jobs.get(id);
    if (!proc) return false;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    this.jobs.delete(id);
    return true;
  }

  isRunning(id: string): boolean {
    return this.jobs.has(id);
  }

  killAll(): void {
    for (const id of Array.from(this.jobs.keys())) this.kill(id);
  }
}
