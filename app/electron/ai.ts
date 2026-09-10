import Anthropic from "@anthropic-ai/sdk";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { getHistory } from "./store";
import { runCodec } from "./codec";
import { decodeJwt } from "./jwt";
import { repeaterSend } from "./repeater";
import { addFinding, updateFinding, getFindings } from "./findings";
import {
  AiAgentEvent,
  AiExplainRequest,
  AiExplainResult,
  AiSettings,
  AiTestConnectionResult,
  CodecOp,
  Exchange,
  FindingSeverity,
  FindingStatus,
} from "./types";

const SYSTEM_PROMPT = `You are the built-in AI assistant of Wraith, an offensive web security toolkit (a Burp Suite-style app). \
You run *inside* the user's own copy of the app, operating on traffic the user has already captured in their own \
authorized testing session -- you are not attacking anything over the network except by explicitly calling the \
send_repeater_request tool, which the user has knowingly enabled. \
Your job: help the user analyze captured HTTP(S) traffic, tokens and hashes, spot vulnerabilities, and -- when asked \
to operate the app -- use the provided tools to look through History, decode/inspect data, record findings, jump the \
UI to a relevant page, and (only when it's clearly useful and in-scope) fire a crafted request through Repeater to \
verify a hypothesis. Always explain your reasoning in plain text as you go, not just tool calls. When you find a \
concrete, credible issue, call add_finding to record it with an accurate severity -- don't spam trivial findings. \
Be precise and skeptical: don't claim a vulnerability is confirmed unless the evidence actually shows it (e.g. an \
actual reflected payload, an actual auth bypass response, an actual secret in a response body) -- a *possible* issue \
worth investigating should be reported as such, not overstated. Keep responses focused and technical.`;

const MAX_TURNS = 24;

function exchangeSummary(ex: Exchange) {
  return {
    id: ex.id,
    method: ex.request.method,
    url: ex.request.url,
    host: ex.host,
    status: ex.response?.statusCode ?? null,
    tags: ex.tags,
    fromTool: ex.fromTool ?? "proxy",
    startedAt: ex.startedAt,
  };
}

function decodeBody(b64: string, max = 6000): { text: string; truncated: boolean } {
  if (!b64) return { text: "", truncated: false };
  const buf = Buffer.from(b64, "base64");
  const truncated = buf.length > max;
  const text = buf.subarray(0, max).toString("utf-8");
  return { text, truncated };
}

function headersToText(headers: Record<string, string | string[] | undefined>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v ?? ""}`)
    .join("\n");
}

function exchangeToText(ex: Exchange): string {
  const reqBody = decodeBody(ex.request.body);
  const parts = [
    `${ex.request.method} ${ex.request.url} HTTP/${ex.request.httpVersion}`,
    headersToText(ex.request.headers),
    reqBody.text ? `\n${reqBody.text}${reqBody.truncated ? "\n...[request body truncated]" : ""}` : "",
  ];
  if (ex.response) {
    const resBody = decodeBody(ex.response.body);
    parts.push(
      `\n--- response (${ex.response.timeMs}ms) ---`,
      `HTTP ${ex.response.statusCode} ${ex.response.statusMessage}`,
      headersToText(ex.response.headers),
      resBody.text ? `\n${resBody.text}${resBody.truncated || ex.response.bodyTruncated ? "\n...[response body truncated]" : ""}` : ""
    );
  } else {
    parts.push("\n--- no response captured ---");
  }
  return parts.filter(Boolean).join("\n");
}

/** Simple one-shot "explain this" helper used by contextual "Ask Claude" buttons scattered across the UI. */
export async function explainWithClaude(settings: AiSettings, req: AiExplainRequest): Promise<AiExplainResult> {
  if (!settings.apiKey) return { answer: "", error: "No Anthropic API key configured. Add one in Settings -> AI." };
  try {
    const client = new Anthropic({ apiKey: settings.apiKey });
    const msg = await client.messages.create({
      model: settings.model || "claude-sonnet-5",
      max_tokens: 1500,
      system:
        "You are a concise, technically precise web security analyst embedded in the Wraith toolkit. " +
        "Analyze exactly what's given to you; don't ask clarifying questions, give your best analysis directly.",
      messages: [
        {
          role: "user",
          content: req.question ? `${req.question}\n\n---\n${req.context}` : `Analyze this for security issues, notable behavior, or anything worth investigating:\n\n${req.context}`,
        },
      ],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { answer: text || "(empty response)" };
  } catch (err: any) {
    return { answer: "", error: err?.message || String(err) };
  }
}

export async function testAiConnection(settings: AiSettings): Promise<AiTestConnectionResult> {
  if (!settings.apiKey) return { ok: false, error: "No API key set." };
  try {
    const client = new Anthropic({ apiKey: settings.apiKey });
    const msg = await client.messages.create({
      model: settings.model || "claude-sonnet-5",
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true, model: msg.model };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ------------------------------------------------------------------ tools

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_history",
    description: "List recent captured HTTP(S) exchanges (proxy traffic, repeater sends). Returns compact summaries -- use get_history_entry for full request/response detail.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return, most recent first. Default 30, max 100." },
      },
    },
  },
  {
    name: "search_history",
    description: "Search captured history by substring match against URL, host, headers and body (request + response). Case-insensitive.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to search for." },
        limit: { type: "number", description: "Max matches to return. Default 30, max 100." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_history_entry",
    description: "Get the full request and response (headers + decoded body text) for one history entry by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "decode",
    description: "Run a decode/encode/hash operation, same as the app's Decoder tool (base64, url, hex, html-entities, jwt-decode, gzip, md5/sha1/sha256, unicode escape).",
    input_schema: {
      type: "object",
      properties: {
        op: {
          type: "string",
          enum: [
            "base64-encode", "base64-decode", "url-encode", "url-decode", "hex-encode", "hex-decode",
            "html-entities-encode", "html-entities-decode", "jwt-decode", "gzip-decode", "gzip-encode",
            "md5", "sha1", "sha256", "unicode-escape", "unicode-unescape",
          ],
        },
        input: { type: "string" },
      },
      required: ["op", "input"],
    },
  },
  {
    name: "jwt_decode",
    description: "Decode a JWT into its header and payload JSON (no signature verification).",
    input_schema: {
      type: "object",
      properties: { token: { type: "string" } },
      required: ["token"],
    },
  },
  {
    name: "list_findings",
    description: "List findings already recorded on the Findings board.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_finding",
    description: "Record a new finding on the Findings board. Only call this for a concrete, credible issue -- not for routine observations.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string", description: "What you found, why it matters, and how you'd verify/exploit it further." },
        severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
        exchangeId: { type: "string", description: "Related history entry id, if any." },
        url: { type: "string" },
      },
      required: ["title", "description", "severity"],
    },
  },
  {
    name: "update_finding_status",
    description: "Move an existing finding to a new status.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["todo", "testing", "confirmed", "reported"] },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "navigate_to_page",
    description: "Switch the app's UI to a given page, so the user can see what you're looking at.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["welcome", "proxy", "history", "repeater", "decoder", "capture", "cracker", "curl", "crawler", "jwt", "findings", "settings"],
        },
      },
      required: ["page"],
    },
  },
  {
    name: "send_repeater_request",
    description:
      "Send a real HTTP(S) request to the target and capture the response, exactly like the Repeater tool. This sends live traffic -- only use it when you have a specific, well-formed request to test (e.g. a modified parameter to check for IDOR/injection), never for generic exploration.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string" },
        url: { type: "string" },
        headers: {
          type: "array",
          items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] },
        },
        bodyText: { type: "string", description: "Plain text request body, if any." },
        insecure: { type: "boolean", description: "Skip TLS verification. Default false." },
      },
      required: ["method", "url"],
    },
  },
];

interface ToolExecResult {
  output: string;
  isActive: boolean;
}

async function executeTool(name: string, input: any, maxCaptureBytes: number): Promise<ToolExecResult> {
  switch (name) {
    case "list_history": {
      const limit = Math.min(Math.max(Number(input?.limit) || 30, 1), 100);
      const items = getHistory().slice(-limit).reverse().map(exchangeSummary);
      return { output: JSON.stringify(items, null, 2), isActive: false };
    }
    case "search_history": {
      const q = String(input?.query || "").toLowerCase();
      const limit = Math.min(Math.max(Number(input?.limit) || 30, 1), 100);
      const matches = getHistory()
        .filter((ex) => {
          const hay = [
            ex.request.url,
            ex.host,
            headersToText(ex.request.headers),
            decodeBody(ex.request.body).text,
            ex.response ? headersToText(ex.response.headers) : "",
            ex.response ? decodeBody(ex.response.body).text : "",
          ]
            .join("\n")
            .toLowerCase();
          return hay.includes(q);
        })
        .slice(-limit)
        .reverse()
        .map(exchangeSummary);
      return { output: JSON.stringify(matches, null, 2), isActive: false };
    }
    case "get_history_entry": {
      const ex = getHistory().find((e) => e.id === input?.id);
      if (!ex) return { output: `No history entry with id ${input?.id}`, isActive: false };
      return { output: exchangeToText(ex), isActive: false };
    }
    case "decode": {
      const result = runCodec({ op: input?.op as CodecOp, input: String(input?.input ?? "") });
      return { output: result.error ? `Error: ${result.error}` : result.output, isActive: false };
    }
    case "jwt_decode": {
      const result = decodeJwt(String(input?.token ?? ""));
      return { output: JSON.stringify(result, null, 2), isActive: false };
    }
    case "list_findings": {
      return { output: JSON.stringify(getFindings(), null, 2), isActive: false };
    }
    case "add_finding": {
      const finding = addFinding({
        title: String(input?.title || "Untitled finding"),
        description: String(input?.description || ""),
        severity: (input?.severity as FindingSeverity) || "info",
        status: "todo",
        source: "ai",
        exchangeId: input?.exchangeId,
        url: input?.url,
      });
      return { output: JSON.stringify(finding, null, 2), isActive: false };
    }
    case "update_finding_status": {
      const finding = updateFinding(String(input?.id), { status: input?.status as FindingStatus });
      return { output: finding ? JSON.stringify(finding, null, 2) : `No finding with id ${input?.id}`, isActive: false };
    }
    case "navigate_to_page": {
      return { output: `Navigated to ${input?.page}`, isActive: false };
    }
    case "send_repeater_request": {
      const headers: { key: string; value: string }[] = Array.isArray(input?.headers) ? input.headers : [];
      const bodyBase64 = input?.bodyText ? Buffer.from(String(input.bodyText), "utf-8").toString("base64") : "";
      const exchange = await repeaterSend(
        {
          method: String(input?.method || "GET"),
          url: String(input?.url || ""),
          headers,
          bodyBase64,
          insecure: !!input?.insecure,
        },
        maxCaptureBytes
      );
      return { output: exchangeToText(exchange) + `\n\n[history id: ${exchange.id}]`, isActive: true };
    }
    default:
      return { output: `Unknown tool: ${name}`, isActive: false };
  }
}

/**
 * The agentic "AI" page: a single free-text prompt drives a Claude tool-use
 * loop that can read History, decode/inspect data, record findings, move
 * the app's own UI around, and -- only via one explicitly flagged tool --
 * fire real requests through Repeater. Each run streams events back to the
 * renderer (text / tool_call / tool_result / done / error / stopped) so the
 * user watches it work in real time instead of waiting on a single reply.
 */
export class AiAgent extends EventEmitter {
  private cancelled = new Set<string>();

  stop(runId: string): void {
    this.cancelled.add(runId);
  }

  async start(runId: string, prompt: string, settings: AiSettings, maxCaptureBytes: number): Promise<void> {
    if (!settings.apiKey) {
      this.emit("event", { runId, type: "error", message: "No Anthropic API key configured. Add one in Settings -> AI." } as AiAgentEvent);
      return;
    }

    const client = new Anthropic({ apiKey: settings.apiKey });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        if (this.cancelled.has(runId)) {
          this.cancelled.delete(runId);
          this.emit("event", { runId, type: "stopped" } as AiAgentEvent);
          return;
        }

        const response = await client.messages.create({
          model: settings.model || "claude-sonnet-5",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        });

        const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
        for (const block of textBlocks) {
          if (block.text.trim()) this.emit("event", { runId, type: "text", text: block.text } as AiAgentEvent);
        }

        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

        if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
          this.emit("event", { runId, type: "done" } as AiAgentEvent);
          return;
        }

        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const call of toolUses) {
          if (this.cancelled.has(runId)) {
            this.cancelled.delete(runId);
            this.emit("event", { runId, type: "stopped" } as AiAgentEvent);
            return;
          }
          this.emit("event", { runId, type: "tool_call", toolName: call.name, toolInput: call.input } as AiAgentEvent);
          let result: ToolExecResult;
          try {
            result = await executeTool(call.name, call.input, maxCaptureBytes);
          } catch (err: any) {
            result = { output: `Error: ${err?.message || err}`, isActive: false };
          }
          this.emit("event", {
            runId,
            type: "tool_result",
            toolName: call.name,
            toolOutput: result.output,
            isActive: result.isActive,
          } as AiAgentEvent);
          toolResults.push({ type: "tool_result", tool_use_id: call.id, content: result.output.slice(0, 12000) });
        }

        messages.push({ role: "user", content: toolResults });
      }

      this.emit("event", { runId, type: "error", message: "Reached the max tool-use turn limit for this run." } as AiAgentEvent);
    } catch (err: any) {
      this.emit("event", { runId, type: "error", message: err?.message || String(err) } as AiAgentEvent);
    }
  }
}

export function newAiRunId(): string {
  return randomUUID();
}
