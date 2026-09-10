import { EventEmitter } from "events";
import { sendHttpRequest } from "./httpClient";
import { FuzzerRequest, FuzzerResultRow } from "./types";

/**
 * Intruder-style "Sniper" fuzzer: values wrapped in §like this§ mark a
 * payload position. Each position is attacked in turn -- for every payload,
 * one request is sent with that position replaced by the payload and every
 * *other* marked position replaced by its own base value (the text that was
 * between its § §), matching Burp's Sniper attack type.
 */

interface FieldTemplate {
  /** text.split("§") -- odd indices are marked (attackable) segments, even indices are fixed literal text */
  parts: string[];
}

function parseField(text: string): FieldTemplate {
  return { parts: text.split("§") };
}

function countMarkers(t: FieldTemplate): number {
  return Math.floor((t.parts.length - 1) / 2);
}

/** Renders one field with the marker at `attackPosition` (a global index across url+headers+body) replaced by `payload`, and every other marker replaced by its own base value. `markerOffset` is how many markers precede this field globally. */
function renderField(t: FieldTemplate, markerOffset: number, attackPosition: number, payload: string): string {
  let out = "";
  let local = 0;
  for (let i = 0; i < t.parts.length; i++) {
    if (i % 2 === 0) {
      out += t.parts[i];
    } else {
      out += markerOffset + local === attackPosition ? payload : t.parts[i];
      local++;
    }
  }
  return out;
}

export class FuzzerRunner extends EventEmitter {
  private cancelled = new Set<string>();

  stop(jobId: string): void {
    this.cancelled.add(jobId);
  }

  countPositions(req: FuzzerRequest): number {
    const urlT = parseField(req.url);
    const headerTs = req.headers.map((h) => parseField(h.value));
    const bodyT = parseField(req.bodyText);
    return countMarkers(urlT) + headerTs.reduce((s, t) => s + countMarkers(t), 0) + countMarkers(bodyT);
  }

  async run(jobId: string, req: FuzzerRequest, maxCaptureBytes: number): Promise<void> {
    const urlT = parseField(req.url);
    const headerTs = req.headers.map((h) => ({ key: h.key, t: parseField(h.value) }));
    const bodyT = parseField(req.bodyText);
    const totalPositions = this.countPositions(req);

    if (totalPositions === 0) {
      this.emit("event", { jobId, type: "error", message: "No §payload positions§ marked -- wrap at least one value (in the URL, a header, or the body) in § §." });
      return;
    }
    if (req.payloads.length === 0) {
      this.emit("event", { jobId, type: "error", message: "No payloads provided." });
      return;
    }

    const tasks: { position: number; payload: string; index: number }[] = [];
    let idx = 0;
    for (let pos = 0; pos < totalPositions; pos++) {
      for (const payload of req.payloads) tasks.push({ position: pos, payload, index: idx++ });
    }
    const total = tasks.length;
    let completed = 0;
    let cursor = 0;
    const concurrency = Math.min(Math.max(req.concurrency || 5, 1), 20);

    const buildAndSend = async (task: { position: number; payload: string; index: number }): Promise<FuzzerResultRow> => {
      let markerOffset = 0;
      const url = renderField(urlT, markerOffset, task.position, task.payload);
      markerOffset += countMarkers(urlT);

      const headers: Record<string, string> = {};
      for (const h of headerTs) {
        if (!h.key.trim()) continue;
        headers[h.key] = renderField(h.t, markerOffset, task.position, task.payload);
        markerOffset += countMarkers(h.t);
      }
      const bodyText = renderField(bodyT, markerOffset, task.position, task.payload);
      const started = Date.now();
      try {
        const { response } = await sendHttpRequest({
          method: req.method,
          url,
          headers,
          body: Buffer.from(bodyText, "utf-8"),
          insecure: req.insecure,
          maxCaptureBytes,
        });
        return {
          index: task.index,
          position: task.position,
          payload: task.payload,
          statusCode: response.statusCode,
          sizeBytes: Buffer.from(response.body, "base64").length,
          timeMs: response.timeMs,
        };
      } catch (err: any) {
        return {
          index: task.index,
          position: task.position,
          payload: task.payload,
          statusCode: 0,
          sizeBytes: 0,
          timeMs: Date.now() - started,
          error: err?.message || String(err),
        };
      }
    };

    const worker = async () => {
      while (cursor < tasks.length) {
        if (this.cancelled.has(jobId)) return;
        const task = tasks[cursor++];
        const row = await buildAndSend(task);
        completed++;
        this.emit("event", { jobId, type: "result", row, completed, total });
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (this.cancelled.has(jobId)) {
      this.cancelled.delete(jobId);
      this.emit("event", { jobId, type: "stopped" });
    } else {
      this.emit("event", { jobId, type: "done", completed, total });
    }
  }
}
