import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  WraithSettings,
  ProxyStatus,
  Exchange,
  InterceptResolution,
  InterceptPending,
  NetworkInterfaceInfo,
  DiscoveredCertInfo,
  CodecRequest,
  CodecResult,
  CurlRunRequest,
  CurlRunResult,
  CrackerJobRequest,
  CrackerJobEvent,
  CaptureStartRequest,
  CapturedPacketSummary,
  CrawlerRequest,
  CrawlerEvent,
  WriteFileRequest,
  DefaultWordlistInfo,
  CaptureExportRequest,
  JwtDecodeResult,
  JwtSignRequest,
  JwtSignResult,
  JwtVerifyRequest,
  JwtVerifyResult,
  JwtCrackRequest,
  JwtCrackEvent,
  Finding,
  NewFinding,
  Identity,
  NewIdentity,
  FuzzerRequest,
  FuzzerStartHandle,
  FuzzerEvent,
  RaceRequest,
  RaceStartHandle,
  RaceEvent,
  OobStartResult,
  OobEvent,
  AiExplainRequest,
  AiExplainResult,
  AiTestConnectionResult,
  AiAgentEvent,
} from "./types";

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_e: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

/**
 * Everything the renderer is allowed to touch. contextIsolation is on and
 * nodeIntegration is off (see main.ts), so this bridge is the *entire*
 * attack surface between untrusted rendered content and the OS -- keep it
 * a thin, typed pass-through to ipcMain handlers, never eval-able strings.
 */
const api = {
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: (): Promise<void> => ipcRenderer.invoke("window:toggleMaximize"),
    close: (): Promise<void> => ipcRenderer.invoke("window:close"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:isMaximized"),
    onMaximizedChange: (cb: (maximized: boolean) => void) => on("window:maximized", cb),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke("app:openExternal", url),
    chooseFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
      ipcRenderer.invoke("app:chooseFile", filters),
    chooseSaveFile: (defaultName?: string): Promise<string | null> => ipcRenderer.invoke("app:chooseSaveFile", defaultName),
    purgeAllData: (): Promise<void> => ipcRenderer.invoke("app:purgeAllData"),
    writeFile: (req: WriteFileRequest): Promise<void> => ipcRenderer.invoke("app:writeFile", req),
    platform: process.platform,
  },
  settings: {
    get: (): Promise<WraithSettings> => ipcRenderer.invoke("settings:get"),
    update: (patch: Partial<WraithSettings>): Promise<WraithSettings> => ipcRenderer.invoke("settings:update", patch),
  },
  network: {
    list: (): Promise<NetworkInterfaceInfo[]> => ipcRenderer.invoke("network:list"),
  },
  ca: {
    info: (): Promise<DiscoveredCertInfo | null> => ipcRenderer.invoke("ca:info"),
    exportToDesktop: (): Promise<string> => ipcRenderer.invoke("ca:exportToDesktop"),
    openFolder: (): Promise<void> => ipcRenderer.invoke("ca:openFolder"),
    regenerate: (): Promise<DiscoveredCertInfo | null> => ipcRenderer.invoke("ca:regenerate"),
  },
  codec: {
    run: (req: CodecRequest): Promise<CodecResult> => ipcRenderer.invoke("codec:run", req),
  },
  proxy: {
    start: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("proxy:start"),
    stop: (): Promise<void> => ipcRenderer.invoke("proxy:stop"),
    status: (): Promise<ProxyStatus> => ipcRenderer.invoke("proxy:status"),
    resolveIntercept: (resolution: InterceptResolution): Promise<boolean> => ipcRenderer.invoke("proxy:resolveIntercept", resolution),
    forwardAll: (): Promise<number> => ipcRenderer.invoke("proxy:forwardAll"),
    onExchangeNew: (cb: (ex: Exchange) => void) => on("proxy:exchange:new", cb),
    onExchangeUpdate: (cb: (payload: { id: string; patch: Partial<Exchange> }) => void) => on("proxy:exchange:update", cb),
    onInterceptPending: (cb: (pending: InterceptPending) => void) => on("proxy:intercept:pending", cb),
    onLog: (cb: (line: string) => void) => on("proxy:log", cb),
    onStatusChange: (cb: (status: ProxyStatus) => void) => on("proxy:statusChange", cb),
  },
  history: {
    list: (): Promise<Exchange[]> => ipcRenderer.invoke("history:list"),
    clear: (): Promise<void> => ipcRenderer.invoke("history:clear"),
    update: (id: string, patch: Partial<Exchange>): Promise<Exchange | null> => ipcRenderer.invoke("history:update", id, patch),
    import: (exchanges: Exchange[]): Promise<Exchange[]> => ipcRenderer.invoke("history:import", exchanges),
  },
  repeater: {
    send: (req: {
      method: string;
      url: string;
      headers: { key: string; value: string }[];
      bodyBase64: string;
      insecure: boolean;
    }): Promise<Exchange> => ipcRenderer.invoke("repeater:send", req),
  },
  curl: {
    run: (req: CurlRunRequest): Promise<CurlRunResult> => ipcRenderer.invoke("curl:run", req),
  },
  cracker: {
    checkAvailable: () => ipcRenderer.invoke("cracker:checkAvailable"),
    listHashcatModes: () => ipcRenderer.invoke("cracker:listHashcatModes"),
    listJohnFormats: () => ipcRenderer.invoke("cracker:listJohnFormats"),
    start: (req: CrackerJobRequest) => ipcRenderer.invoke("cracker:start", req),
    stop: (jobId: string): Promise<boolean> => ipcRenderer.invoke("cracker:stop", jobId),
    readResults: (handle: any) => ipcRenderer.invoke("cracker:readResults", handle),
    onEvent: (cb: (evt: CrackerJobEvent) => void) => on("cracker:event", cb),
    defaultWordlist: (): Promise<DefaultWordlistInfo> => ipcRenderer.invoke("cracker:defaultWordlist"),
    extractRockyou: (): Promise<DefaultWordlistInfo> => ipcRenderer.invoke("cracker:extractRockyou"),
  },
  capture: {
    checkAvailable: () => ipcRenderer.invoke("capture:checkAvailable"),
    listInterfaces: () => ipcRenderer.invoke("capture:listInterfaces"),
    start: (req: CaptureStartRequest) => ipcRenderer.invoke("capture:start", req),
    stop: (jobId: string): Promise<void> => ipcRenderer.invoke("capture:stop", jobId),
    packetDetail: (pcapPath: string, frameNumber: number): Promise<string> =>
      ipcRenderer.invoke("capture:packetDetail", pcapPath, frameNumber),
    applyFilter: (pcapPath: string, displayFilter: string): Promise<CapturedPacketSummary[]> =>
      ipcRenderer.invoke("capture:applyFilter", pcapPath, displayFilter),
    export: (req: CaptureExportRequest): Promise<void> => ipcRenderer.invoke("capture:export", req),
    onPacket: (cb: (p: CapturedPacketSummary & { jobId: string }) => void) => on("capture:packet", cb),
    onLog: (cb: (payload: { jobId: string; line: string }) => void) => on("capture:log", cb),
    onClosed: (cb: (payload: { jobId: string; code: number | null }) => void) => on("capture:closed", cb),
  },
  jwt: {
    decode: (token: string): Promise<JwtDecodeResult> => ipcRenderer.invoke("jwt:decode", token),
    sign: (req: JwtSignRequest): Promise<JwtSignResult> => ipcRenderer.invoke("jwt:sign", req),
    verify: (req: JwtVerifyRequest): Promise<JwtVerifyResult> => ipcRenderer.invoke("jwt:verify", req),
    crackStart: (req: JwtCrackRequest): Promise<{ jobId: string }> => ipcRenderer.invoke("jwt:crackStart", req),
    crackStop: (jobId: string): Promise<void> => ipcRenderer.invoke("jwt:crackStop", jobId),
    onCrackEvent: (cb: (evt: JwtCrackEvent) => void) => on("jwt:crackEvent", cb),
  },
  crawler: {
    start: (req: CrawlerRequest): Promise<{ jobId: string }> => ipcRenderer.invoke("crawler:start", req),
    stop: (jobId: string): Promise<void> => ipcRenderer.invoke("crawler:stop", jobId),
    onEvent: (cb: (evt: CrawlerEvent) => void) => on("crawler:event", cb),
  },
  findings: {
    list: (): Promise<Finding[]> => ipcRenderer.invoke("findings:list"),
    add: (req: NewFinding): Promise<Finding> => ipcRenderer.invoke("findings:add", req),
    update: (id: string, patch: Partial<Finding>): Promise<Finding | null> => ipcRenderer.invoke("findings:update", id, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke("findings:delete", id),
    clear: (): Promise<void> => ipcRenderer.invoke("findings:clear"),
    onNew: (cb: (finding: Finding) => void) => on("findings:new", cb),
  },
  identities: {
    list: (): Promise<Identity[]> => ipcRenderer.invoke("identities:list"),
    add: (req: NewIdentity): Promise<Identity> => ipcRenderer.invoke("identities:add", req),
    update: (id: string, patch: Partial<Identity>): Promise<Identity | null> => ipcRenderer.invoke("identities:update", id, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke("identities:delete", id),
  },
  fuzzer: {
    start: (req: FuzzerRequest): Promise<FuzzerStartHandle> => ipcRenderer.invoke("fuzzer:start", req),
    stop: (jobId: string): Promise<void> => ipcRenderer.invoke("fuzzer:stop", jobId),
    onEvent: (cb: (evt: FuzzerEvent) => void) => on("fuzzer:event", cb),
  },
  race: {
    start: (req: RaceRequest): Promise<RaceStartHandle> => ipcRenderer.invoke("race:start", req),
    onEvent: (cb: (evt: RaceEvent) => void) => on("race:event", cb),
  },
  oob: {
    start: (): Promise<OobStartResult> => ipcRenderer.invoke("oob:start"),
    stop: (sessionId: string): Promise<void> => ipcRenderer.invoke("oob:stop", sessionId),
    onEvent: (cb: (evt: OobEvent) => void) => on("oob:event", cb),
  },
  ai: {
    testConnection: (): Promise<AiTestConnectionResult> => ipcRenderer.invoke("ai:testConnection"),
    explain: (req: AiExplainRequest): Promise<AiExplainResult> => ipcRenderer.invoke("ai:explain", req),
    agentStart: (prompt: string): Promise<{ runId: string }> => ipcRenderer.invoke("ai:agentStart", { prompt }),
    agentStop: (runId: string): Promise<void> => ipcRenderer.invoke("ai:agentStop", runId),
    onAgentEvent: (cb: (evt: AiAgentEvent) => void) => on("ai:agentEvent", cb),
  },
};

contextBridge.exposeInMainWorld("wraith", api);

export type WraithApi = typeof api;
