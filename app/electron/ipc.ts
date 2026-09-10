import { ipcMain, shell, dialog, app, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { WraithProxy } from "./proxy/engine";
import { loadSettings, updateSettings, getHistory, appendExchange, updateExchange, clearHistory, purgeAllWraithData, wraithRoot } from "./store";
import { listLocalAddresses } from "./network";
import { readCaCertInfo, caCertPath, regenerateCa } from "./ca";
import { runCodec } from "./codec";
import { repeaterSend } from "./repeater";
import { runCurl } from "./curlTool/runner";
import {
  checkCrackerAvailable,
  listHashcatModes,
  listJohnFormats,
  CrackerRunner,
  readCrackedResults,
  findDefaultWordlist,
  extractDefaultWordlist,
} from "./cracker/johnHashcat";
import { checkTsharkAvailable, listCaptureInterfaces, CaptureSession, readPacketDetail, applyDisplayFilter, exportCapture } from "./capture/tshark";
import { Crawler } from "./crawler/crawler";
import { decodeJwt, signJwt, verifyJwt, JwtCracker } from "./jwt";
import { CrackerJobRequest, CaptureStartRequest, CrawlerRequest, Exchange, WriteFileRequest, JwtSignRequest, JwtVerifyRequest, JwtCrackRequest, CaptureExportRequest, AiExplainRequest, NewFinding, Finding, NewIdentity, Identity, FuzzerRequest, RaceRequest } from "./types";
import * as fsp from "fs/promises";
import { explainWithClaude, testAiConnection, AiAgent, newAiRunId } from "./ai";
import { getFindings, addFinding, updateFinding, deleteFinding, clearFindings } from "./findings";
import { scanExchange } from "./scanner";
import { getIdentities, addIdentity, updateIdentity, deleteIdentity } from "./identities";
import { FuzzerRunner } from "./fuzzer";
import { RaceRunner } from "./race";
import { OobClient } from "./oob";

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export function registerIpcHandlers(getWindow: () => BrowserWindow | null) {
  const send = (channel: string, ...args: any[]) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  // ---------------------------------------------------------------- app
  ipcMain.handle("app:getVersion", () => app.getVersion());

  ipcMain.handle("app:openExternal", async (_e, url: string) => {
    try {
      const u = new URL(url);
      if (!ALLOWED_EXTERNAL_PROTOCOLS.has(u.protocol)) return;
      await shell.openExternal(url);
    } catch {
      /* ignore malformed url */
    }
  });

  ipcMain.handle("app:chooseFile", async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win || (undefined as any), {
      properties: ["openFile"],
      filters: filters && filters.length ? filters : [{ name: "All files", extensions: ["*"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("app:chooseSaveFile", async (_e, defaultName?: string) => {
    const win = getWindow();
    const result = await dialog.showSaveDialog(win || (undefined as any), { defaultPath: defaultName });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle("app:purgeAllData", async () => {
    await proxy.stop();
    purgeAllWraithData();
  });

  ipcMain.handle("app:writeFile", async (_e, req: WriteFileRequest) => {
    const buf = Buffer.from(req.content, req.encoding === "base64" ? "base64" : "utf-8");
    await fsp.writeFile(req.path, buf);
  });

  // ----------------------------------------------------------- settings
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:update", (_e, patch) => updateSettings(patch));

  // ------------------------------------------------------------ network
  ipcMain.handle("network:list", () => listLocalAddresses());

  // ------------------------------------------------------------------ ca
  ipcMain.handle("ca:info", () => readCaCertInfo());
  ipcMain.handle("ca:exportToDesktop", () => {
    const src = caCertPath();
    if (!fs.existsSync(src)) throw new Error("CA certificate not generated yet — start the proxy once first.");
    const dest = path.join(app.getPath("desktop"), "wraith-ca.pem");
    fs.copyFileSync(src, dest);
    return dest;
  });
  ipcMain.handle("ca:openFolder", () => {
    const src = caCertPath();
    if (fs.existsSync(src)) shell.showItemInFolder(src);
    else shell.openPath(path.dirname(src));
  });
  ipcMain.handle("ca:regenerate", async () => {
    const wasRunning = proxy.isRunning();
    if (wasRunning) await proxy.stop();
    regenerateCa();
    if (wasRunning) await proxy.start();
    return readCaCertInfo();
  });

  // --------------------------------------------------------------- codec
  ipcMain.handle("codec:run", (_e, req) => runCodec(req));

  // --------------------------------------------------------------- proxy
  const proxy = new WraithProxy(() => loadSettings().proxy);

  const runPassiveScan = (exchange: Exchange) => {
    for (const finding of scanExchange(exchange)) {
      const saved = addFinding(finding);
      send("findings:new", saved);
    }
  };

  proxy.on("exchange:new", (exchange: Exchange) => {
    appendExchange(exchange);
    send("proxy:exchange:new", exchange);
  });
  proxy.on("exchange:update", (id: string, patch: Partial<Exchange>) => {
    const updated = updateExchange(id, patch);
    send("proxy:exchange:update", { id, patch });
    if (updated) runPassiveScan(updated);
  });
  proxy.on("intercept:pending", (pending) => send("proxy:intercept:pending", pending));
  proxy.on("log", (line: string) => send("proxy:log", line));
  proxy.on("started", (port: number, host: string) => send("proxy:statusChange", { running: true, port, host }));
  proxy.on("stopped", () => {
    const s = loadSettings().proxy;
    send("proxy:statusChange", { running: false, port: s.port, host: s.host });
  });

  ipcMain.handle("proxy:start", async () => {
    try {
      await proxy.start();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
  ipcMain.handle("proxy:stop", () => proxy.stop());
  ipcMain.handle("proxy:status", () => {
    const s = loadSettings().proxy;
    return { running: proxy.isRunning(), port: s.port, host: s.host };
  });
  ipcMain.handle("proxy:resolveIntercept", (_e, resolution) => proxy.resolveIntercept(resolution));
  ipcMain.handle("proxy:forwardAll", () => proxy.forwardAll());

  // ------------------------------------------------------------- history
  ipcMain.handle("history:list", () => getHistory());
  ipcMain.handle("history:clear", () => clearHistory());
  ipcMain.handle("history:update", (_e, id: string, patch: Partial<Exchange>) => updateExchange(id, patch));
  ipcMain.handle("history:import", (_e, exchanges: Exchange[]) => {
    // Re-mint ids so an imported HAR can never collide with (or silently
    // overwrite the display of) something already in this session's history.
    const imported = exchanges.map((raw) => ({ ...raw, id: randomUUID() }));
    for (const exchange of imported) appendExchange(exchange);
    return imported;
  });

  // ------------------------------------------------------------ repeater
  ipcMain.handle("repeater:send", (_e, req) => {
    const cap = loadSettings().proxy.maxBodyCaptureBytes;
    return repeaterSend(req, cap).then((exchange) => {
      appendExchange(exchange);
      send("proxy:exchange:new", exchange);
      runPassiveScan(exchange);
      return exchange;
    });
  });

  // ----------------------------------------------------------------curl
  ipcMain.handle("curl:run", (_e, req) => runCurl(req));

  // ------------------------------------------------------------- cracker
  const cracker = new CrackerRunner();
  const crackerHandles = new Map<string, ReturnType<CrackerRunner["start"]>>();

  cracker.events.on("stdout", (jobId: string, line: string) => {
    send("cracker:event", { jobId, type: "stdout", data: line });
    if (/^\S.*\(\S*\)\s*$/.test(line) || /Cracked/i.test(line)) {
      send("cracker:event", { jobId, type: "cracked", data: line });
    }
  });
  cracker.events.on("stderr", (jobId: string, line: string) => send("cracker:event", { jobId, type: "stderr", data: line }));
  cracker.events.on("close", (jobId: string, code: number | null) =>
    send("cracker:event", { jobId, type: "done", data: String(code) })
  );
  cracker.events.on("error", (jobId: string, message: string) => send("cracker:event", { jobId, type: "error", data: message }));

  ipcMain.handle("cracker:checkAvailable", () => checkCrackerAvailable());
  ipcMain.handle("cracker:listHashcatModes", () => listHashcatModes());
  ipcMain.handle("cracker:listJohnFormats", () => listJohnFormats());
  ipcMain.handle("cracker:start", (_e, req: CrackerJobRequest) => {
    const handle = cracker.start(req);
    crackerHandles.set(handle.jobId, handle);
    return handle;
  });
  ipcMain.handle("cracker:stop", (_e, jobId: string) => cracker.stop(jobId));
  ipcMain.handle("cracker:readResults", (_e, handle) => readCrackedResults(handle));
  ipcMain.handle("cracker:defaultWordlist", () => findDefaultWordlist());
  ipcMain.handle("cracker:extractRockyou", () => extractDefaultWordlist());

  // ------------------------------------------------------------- capture
  const captureSessions = new Map<string, CaptureSession>();

  ipcMain.handle("capture:checkAvailable", () => checkTsharkAvailable());
  ipcMain.handle("capture:listInterfaces", () => listCaptureInterfaces());
  ipcMain.handle("capture:start", (_e, req: CaptureStartRequest) => {
    const session = new CaptureSession();
    captureSessions.set(session.jobId, session);
    session.start(
      req.interfaceName,
      req.bpfFilter,
      (packet) => send("capture:packet", { ...packet, jobId: session.jobId }),
      (line) => send("capture:log", { jobId: session.jobId, line }),
      (code) => send("capture:closed", { jobId: session.jobId, code })
    );
    return { jobId: session.jobId, pcapPath: session.outputFile };
  });
  ipcMain.handle("capture:stop", (_e, jobId: string) => {
    captureSessions.get(jobId)?.stop();
  });
  ipcMain.handle("capture:packetDetail", (_e, pcapPath: string, frameNumber: number) => readPacketDetail(pcapPath, frameNumber));
  ipcMain.handle("capture:applyFilter", (_e, pcapPath: string, displayFilter: string) => applyDisplayFilter(pcapPath, displayFilter));
  ipcMain.handle("capture:export", (_e, req: CaptureExportRequest) =>
    exportCapture(req.pcapPath, req.format, req.destPath, req.displayFilter)
  );

  // ----------------------------------------------------------------- jwt
  ipcMain.handle("jwt:decode", (_e, token: string) => decodeJwt(token));
  ipcMain.handle("jwt:sign", (_e, req: JwtSignRequest) => signJwt(req));
  ipcMain.handle("jwt:verify", (_e, req: JwtVerifyRequest) => verifyJwt(req));

  const jwtCracker = new JwtCracker();
  jwtCracker.on("event", (evt) => send("jwt:crackEvent", evt));

  ipcMain.handle("jwt:crackStart", (_e, req: JwtCrackRequest) => {
    const jobId = randomUUID();
    jwtCracker.run(jobId, req).catch((err) => send("jwt:crackEvent", { jobId, type: "error", message: String(err?.message || err) }));
    return { jobId };
  });
  ipcMain.handle("jwt:crackStop", (_e, jobId: string) => jwtCracker.cancel(jobId));

  // ------------------------------------------------------------- crawler
  const crawlers = new Map<string, Crawler>();

  ipcMain.handle("crawler:start", (_e, req: CrawlerRequest) => {
    const crawler = new Crawler();
    crawlers.set(crawler.jobId, crawler);
    crawler.on("event", (evt) => send("crawler:event", evt));
    crawler.run(req).catch((err) => send("crawler:event", { jobId: crawler.jobId, type: "error", message: String(err?.message || err) }));
    return { jobId: crawler.jobId };
  });
  ipcMain.handle("crawler:stop", (_e, jobId: string) => {
    crawlers.get(jobId)?.stop();
  });

  // -------------------------------------------------------------findings
  ipcMain.handle("findings:list", () => getFindings());
  ipcMain.handle("findings:add", (_e, req: NewFinding) => {
    const finding = addFinding(req);
    send("findings:new", finding);
    return finding;
  });
  ipcMain.handle("findings:update", (_e, id: string, patch: Partial<Finding>) => updateFinding(id, patch));
  ipcMain.handle("findings:delete", (_e, id: string) => deleteFinding(id));
  ipcMain.handle("findings:clear", () => clearFindings());

  // ----------------------------------------------------------identities
  ipcMain.handle("identities:list", () => getIdentities());
  ipcMain.handle("identities:add", (_e, req: NewIdentity) => addIdentity(req));
  ipcMain.handle("identities:update", (_e, id: string, patch: Partial<Identity>) => updateIdentity(id, patch));
  ipcMain.handle("identities:delete", (_e, id: string) => deleteIdentity(id));

  // -------------------------------------------------------------- fuzzer
  const fuzzer = new FuzzerRunner();
  fuzzer.on("event", (evt) => send("fuzzer:event", evt));

  ipcMain.handle("fuzzer:start", (_e, req: FuzzerRequest) => {
    const totalPositions = fuzzer.countPositions(req);
    // Validated synchronously, before any job starts or any event is emitted --
    // an error emitted from inside fuzzer.run() (which runs synchronously up to
    // its first real await) can otherwise reach the renderer before the
    // renderer has even finished processing this handler's own return value,
    // silently dropping the error since nothing is listening for that jobId yet.
    if (totalPositions === 0) {
      return { jobId: "", totalPositions: 0, totalRequests: 0, error: "No §payload positions§ marked -- wrap at least one value (in the URL, a header, or the body) in § §." };
    }
    if (!req.payloads || req.payloads.length === 0) {
      return { jobId: "", totalPositions, totalRequests: 0, error: "No payloads provided." };
    }
    const jobId = randomUUID();
    const cap = loadSettings().proxy.maxBodyCaptureBytes;
    fuzzer.run(jobId, req, cap).catch((err) => send("fuzzer:event", { jobId, type: "error", message: String(err?.message || err) }));
    return { jobId, totalPositions, totalRequests: totalPositions * req.payloads.length };
  });
  ipcMain.handle("fuzzer:stop", (_e, jobId: string) => fuzzer.stop(jobId));

  // ---------------------------------------------------------------- race
  const race = new RaceRunner();
  race.on("event", (evt) => send("race:event", evt));

  ipcMain.handle("race:start", (_e, req: RaceRequest) => {
    if (!req.count || req.count < 2) return { jobId: "", error: "Fire at least 2 requests to test for a race." };
    if (req.count > 100) return { jobId: "", error: "Capped at 100 concurrent requests." };
    const jobId = randomUUID();
    const cap = loadSettings().proxy.maxBodyCaptureBytes;
    race.run(jobId, req, cap).catch((err) => send("race:event", { jobId, type: "error", message: String(err?.message || err) }));
    return { jobId };
  });

  // ------------------------------------------------------------------oob
  const oob = new OobClient();
  oob.on("event", (evt) => send("oob:event", evt));

  ipcMain.handle("oob:start", async () => {
    const sessionId = randomUUID();
    const result = await oob.start(sessionId);
    if ("error" in result) return { sessionId: "", domain: "", error: result.error };
    return { sessionId, domain: result.domain };
  });
  ipcMain.handle("oob:stop", (_e, sessionId: string) => oob.stop(sessionId));

  // ------------------------------------------------------------------ ai
  ipcMain.handle("ai:testConnection", () => testAiConnection(loadSettings().ai));
  ipcMain.handle("ai:explain", (_e, req: AiExplainRequest) => explainWithClaude(loadSettings().ai, req));

  const aiAgent = new AiAgent();
  aiAgent.on("event", (evt) => {
    send("ai:agentEvent", evt);
    if (evt.type === "tool_result" && evt.toolName === "add_finding" && typeof evt.toolOutput === "string") {
      try {
        send("findings:new", JSON.parse(evt.toolOutput));
      } catch {
        /* not JSON -- ignore */
      }
    }
  });

  ipcMain.handle("ai:agentStart", (_e, req: { prompt: string }) => {
    const runId = newAiRunId();
    const cap = loadSettings().proxy.maxBodyCaptureBytes;
    aiAgent.start(runId, req.prompt, loadSettings().ai, cap).catch((err) =>
      send("ai:agentEvent", { runId, type: "error", message: String(err?.message || err) })
    );
    return { runId };
  });
  ipcMain.handle("ai:agentStop", (_e, runId: string) => aiAgent.stop(runId));

  return {
    shutdown: async () => {
      await proxy.stop();
      for (const c of crawlers.values()) c.stop();
      for (const s of captureSessions.values()) s.stop();
      oob.stopAll();
    },
    wraithRoot,
  };
}
