import { EventEmitter } from "events";
import { sendHttpRequest } from "./httpClient";
import { RaceRequest, RaceResultRow } from "./types";

/**
 * Fires N identical copies of a request essentially simultaneously (all
 * sockets opened in the same synchronous loop, before any of them can
 * resolve) to surface race-condition bugs -- e.g. a coupon or balance
 * check-then-use that isn't atomic will often let more copies "win" than
 * should be possible when hit like this.
 */
export class RaceRunner extends EventEmitter {
  async run(jobId: string, req: RaceRequest, maxCaptureBytes: number): Promise<void> {
    const headers: Record<string, string> = {};
    for (const h of req.headers) if (h.key.trim()) headers[h.key] = h.value;
    const body = Buffer.from(req.bodyText, "utf-8");
    const total = req.count;
    let completed = 0;

    const fireOne = (index: number): Promise<RaceResultRow> =>
      sendHttpRequest({ method: req.method, url: req.url, headers, body, insecure: req.insecure, maxCaptureBytes })
        .then(
          ({ response }): RaceResultRow => ({
            index,
            statusCode: response.statusCode,
            sizeBytes: Buffer.from(response.body, "base64").length,
            timeMs: response.timeMs,
          })
        )
        .catch(
          (err): RaceResultRow => ({ index, statusCode: 0, sizeBytes: 0, timeMs: 0, error: err?.message || String(err) })
        )
        .then((row) => {
          completed++;
          this.emit("event", { jobId, type: "result", row, completed, total });
          return row;
        });

    // All N sendHttpRequest() calls are kicked off in this single
    // synchronous loop -- nothing here awaits between them, so every socket
    // starts connecting before the event loop moves on to anything else.
    const tasks: Promise<RaceResultRow>[] = [];
    for (let i = 0; i < total; i++) tasks.push(fireOne(i));

    await Promise.all(tasks);
    this.emit("event", { jobId, type: "done", completed, total });
  }
}
