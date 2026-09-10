import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { ProxyStatus, InterceptPending, InterceptResolution, CapturedResponse, Exchange } from "../../electron/types";
import { base64ToUtf8, utf8ToBase64 } from "../lib/base64";
import { EditableRequest } from "../components/RequestEditor";

export type Page = "welcome" | "proxy" | "history" | "repeater" | "decoder" | "capture" | "cracker" | "curl" | "crawler" | "jwt" | "ai" | "findings" | "comparer" | "identities" | "fuzzer" | "race" | "chain" | "oob" | "settings";

export interface PendingRepeaterRequest {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string; // utf-8 text, not base64
}

export interface KV {
  key: string;
  value: string;
}

/** The user-editable copy of a held request/response, keyed by InterceptPending.id in interceptEdits. */
export interface EditableHeld {
  method: string;
  url: string;
  headers: KV[];
  bodyText: string;
  statusCode?: number;
  statusMessage?: string;
}

function headersRecordToKv(headers: Record<string, any>): KV[] {
  return Object.entries(headers || {}).map(([key, v]) => ({ key, value: Array.isArray(v) ? v.join(", ") : String(v) }));
}

function kvToHeadersRecord(rows: KV[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) if (r.key.trim()) out[r.key] = r.value;
  return out;
}

interface ToastItem {
  id: number;
  message: string;
  kind: "info" | "error";
}

// --------------------------------------------------------------- Repeater

export interface RepeaterTab {
  id: number;
  label: string;
  groupId: string | null;
  request: EditableRequest;
  response: CapturedResponse | null;
  loading: boolean;
  insecure: boolean;
}

export interface RepeaterGroup {
  id: string;
  name: string;
  color: string;
}

const GROUP_COLORS = ["#37e6c4", "#7c5cff", "#ff8a3d", "#ff5c8a", "#4fb0ff", "#c792ff", "#ffd166"];

let nextRepeaterTabId = 1;

function blankRepeaterTab(groupId: string | null = null): RepeaterTab {
  return {
    id: nextRepeaterTabId++,
    label: `Request ${nextRepeaterTabId - 1}`,
    groupId,
    request: { method: "GET", url: "https://", headers: [{ key: "User-Agent", value: "Wraith/1.0" }], bodyText: "" },
    response: null,
    loading: false,
    insecure: true,
  };
}

function safeHostname(u: string): string {
  try {
    return new URL(u).hostname || "Request";
  } catch {
    return "Request";
  }
}

// ------------------------------------------------------------------- AI

export type AiTranscriptItem =
  | { kind: "user"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; toolName: string; toolInput: any; toolOutput?: string; isActive?: boolean; pending: boolean }
  | { kind: "error"; text: string }
  | { kind: "system"; text: string };

interface AppContextValue {
  page: Page;
  setPage: (p: Page) => void;
  proxyStatus: ProxyStatus;
  refreshProxyStatus: () => void;
  /** Creates a brand new Repeater tab pre-filled with this request and switches to the Repeater page. Safe to call repeatedly in quick succession -- each call gets its own tab, nothing is ever overwritten. */
  sendToRepeater: (req: PendingRepeaterRequest, label?: string) => void;
  /** One-shot seed for the Fuzzer page -- set on navigation from History, consumed and cleared the first time Fuzzer.tsx mounts and reads it. */
  fuzzerSeed: PendingRepeaterRequest | null;
  sendToFuzzer: (req: PendingRepeaterRequest) => void;
  clearFuzzerSeed: () => void;
  raceSeed: PendingRepeaterRequest | null;
  sendToRace: (req: PendingRepeaterRequest) => void;
  clearRaceSeed: () => void;
  toast: (message: string, kind?: "info" | "error") => void;

  // Intercept queue lives here (not inside the Intercept page component) so
  // a request held while the user is on a different tab isn't silently
  // orphaned when the page unmounts, and so the sidebar can flash on
  // arrival regardless of which page is currently open.
  interceptQueue: InterceptPending[];
  interceptEdits: Record<string, EditableHeld>;
  setInterceptEdit: (id: string, patch: Partial<EditableHeld>) => void;
  resolveIntercept: (pending: InterceptPending, action: "forward" | "drop") => Promise<void>;
  forwardAllIntercepts: () => Promise<number>;
  /** bumps every time a new item is held -- watch it to trigger a brief flash/animation */
  interceptArrivalTick: number;

  // Repeater tabs/groups: same reasoning as Intercept above -- this used to
  // live inside Repeater.tsx's own component state, which reset to a
  // single blank tab every time the page unmounted (i.e. every time you
  // navigated away and back), silently discarding every other tab. Sending
  // two different requests to Repeater back-to-back looked like the second
  // one "overwrote" the first because of exactly this.
  repeaterTabs: RepeaterTab[];
  repeaterGroups: RepeaterGroup[];
  activeRepeaterTabId: number | null;
  setActiveRepeaterTabId: (id: number) => void;
  addRepeaterTab: (groupId?: string | null) => number;
  closeRepeaterTab: (id: number) => void;
  renameRepeaterTab: (id: number, label: string) => void;
  patchRepeaterTab: (id: number, patch: Partial<Pick<RepeaterTab, "request" | "insecure">>) => void;
  sendRepeaterTab: (id: number) => Promise<void>;
  createRepeaterGroup: (name: string) => string;
  renameRepeaterGroup: (id: string, name: string) => void;
  deleteRepeaterGroup: (id: string) => void;
  setRepeaterTabGroup: (tabId: number, groupId: string | null) => void;
  sendRepeaterGroup: (groupId: string, mode: "parallel" | "sequential") => Promise<void>;

  // AI agent run: lives here (not inside Ai.tsx's component state) for the
  // same reason as Intercept/Repeater above -- the agent's own tools can
  // call navigate_to_page mid-run, which unmounts the Ai page while events
  // are still streaming in. Hosting the transcript and the single always-on
  // ai:onAgentEvent listener here means neither the transcript nor an
  // in-flight run is ever silently dropped by that navigation.
  aiItems: AiTranscriptItem[];
  aiRunId: string | null;
  startAiRun: (prompt: string) => Promise<void>;
  stopAiRun: () => Promise<void>;

  // Comparer: two "slots" of exchanges picked from History/Repeater to
  // diff against each other. Lives here (not in Comparer.tsx) so picking
  // slot A from History, navigating around, then picking slot B later
  // doesn't lose the first pick.
  comparerSlots: [Exchange | null, Exchange | null];
  sendToComparer: (exchange: Exchange | null, slot?: 0 | 1) => void;
}

const AppCtx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp() must be used inside <AppProvider>");
  return ctx;
}

function editableFromPending(pending: InterceptPending): EditableHeld {
  return pending.direction === "request"
    ? {
        method: pending.request.method,
        url: pending.request.url,
        headers: headersRecordToKv(pending.request.headers),
        bodyText: base64ToUtf8(pending.request.body),
      }
    : {
        method: pending.request.method,
        url: pending.request.url,
        headers: headersRecordToKv(pending.response?.headers || {}),
        bodyText: base64ToUtf8(pending.response?.body || ""),
        statusCode: pending.response?.statusCode,
        statusMessage: pending.response?.statusMessage,
      };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPageState] = useState<Page>(() => {
    const stored = localStorage.getItem("wraith:lastPage");
    return (stored as Page) || "welcome";
  });
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>({ running: false, port: 8081, host: "0.0.0.0" });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const [interceptQueue, setInterceptQueue] = useState<InterceptPending[]>([]);
  const [interceptEdits, setInterceptEdits] = useState<Record<string, EditableHeld>>({});
  const [interceptArrivalTick, setInterceptArrivalTick] = useState(0);

  const [comparerSlots, setComparerSlots] = useState<[Exchange | null, Exchange | null]>([null, null]);

  const [aiItems, setAiItems] = useState<AiTranscriptItem[]>([]);
  const [aiRunId, setAiRunId] = useState<string | null>(null);
  // Same reasoning as repeaterTabsRef: the event listener below is
  // subscribed exactly once (empty deps) so it never misses an event that
  // arrives in the same tick a run starts, so it needs the current run id
  // without waiting for React state to catch up.
  const aiRunIdRef = useRef<string | null>(null);

  const [repeaterTabs, setRepeaterTabs] = useState<RepeaterTab[]>(() => [blankRepeaterTab()]);
  const [repeaterGroups, setRepeaterGroups] = useState<RepeaterGroup[]>([]);
  const [activeRepeaterTabId, setActiveRepeaterTabId] = useState<number | null>(() => repeaterTabs[0]?.id ?? null);
  // sendRepeaterTab needs the latest tabs without being recreated (and
  // re-triggering effects) on every keystroke a user makes editing a
  // request, so it reads through a ref kept in sync via the effect below
  // instead of closing over `repeaterTabs` directly.
  const repeaterTabsRef = useRef(repeaterTabs);
  useEffect(() => {
    repeaterTabsRef.current = repeaterTabs;
  }, [repeaterTabs]);

  const setPage = useCallback((p: Page) => {
    setPageState(p);
    localStorage.setItem("wraith:lastPage", p);
  }, []);

  const sendToComparer = useCallback(
    (exchange: Exchange | null, slot?: 0 | 1) => {
      setComparerSlots((cur) => {
        const target = slot ?? (cur[0] === null ? 0 : 1);
        const next: [Exchange | null, Exchange | null] = [...cur];
        next[target] = exchange;
        return next;
      });
      setPage("comparer");
    },
    [setPage]
  );

  const refreshProxyStatus = useCallback(() => {
    window.wraith.proxy.status().then(setProxyStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshProxyStatus();
    const off = window.wraith.proxy.onStatusChange((s) => setProxyStatus(s));
    return off;
  }, [refreshProxyStatus]);

  // Apply the saved accent color and theme once at boot, before the user visits Settings.
  useEffect(() => {
    window.wraith.settings.get().then((s) => {
      if (s.general.accentFrom) document.documentElement.style.setProperty("--accent-a", `#${s.general.accentFrom}`);
      if (s.general.accentTo) document.documentElement.style.setProperty("--accent-b", `#${s.general.accentTo}`);
      document.documentElement.setAttribute("data-theme", s.theme === "wraith-light" ? "light" : "dark");
    });
  }, []);

  // Single, always-mounted subscription for the whole app's lifetime --
  // this is what lets a request held while you're on e.g. History still
  // show up (and flash) the moment you switch to Intercept.
  useEffect(() => {
    const off = window.wraith.proxy.onInterceptPending((pending) => {
      setInterceptQueue((q) => [...q, pending]);
      setInterceptEdits((e) => ({ ...e, [pending.id]: editableFromPending(pending) }));
      setInterceptArrivalTick((t) => t + 1);
    });
    return off;
  }, []);

  // Single, always-mounted subscription for the AI agent's event stream --
  // same reasoning as the Intercept subscription above: a run started on
  // the AI page must keep streaming even if the agent's own navigate_to_page
  // tool switches the visible page away from "ai" mid-run.
  useEffect(() => {
    const off = window.wraith.ai.onAgentEvent((evt) => {
      if (evt.runId !== aiRunIdRef.current) return;
      if (evt.type === "text" && evt.text) {
        setAiItems((cur) => [...cur, { kind: "text", text: evt.text! }]);
      } else if (evt.type === "tool_call") {
        setAiItems((cur) => [...cur, { kind: "tool", toolName: evt.toolName!, toolInput: evt.toolInput, pending: true }]);
        if (evt.toolName === "navigate_to_page" && evt.toolInput?.page) {
          setPage(evt.toolInput.page);
        }
      } else if (evt.type === "tool_result") {
        setAiItems((cur) => {
          const next = [...cur];
          for (let i = next.length - 1; i >= 0; i--) {
            const it = next[i];
            if (it.kind === "tool" && it.pending && it.toolName === evt.toolName) {
              next[i] = { ...it, toolOutput: evt.toolOutput, isActive: evt.isActive, pending: false };
              break;
            }
          }
          return next;
        });
      } else if (evt.type === "done") {
        aiRunIdRef.current = null;
        setAiRunId(null);
      } else if (evt.type === "stopped") {
        setAiItems((cur) => [...cur, { kind: "system", text: "Stopped." }]);
        aiRunIdRef.current = null;
        setAiRunId(null);
      } else if (evt.type === "error") {
        setAiItems((cur) => [...cur, { kind: "error", text: evt.message || "Unknown error" }]);
        aiRunIdRef.current = null;
        setAiRunId(null);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAiRun = useCallback(async (prompt: string) => {
    if (!prompt.trim() || aiRunIdRef.current) return;
    setAiItems((cur) => [...cur, { kind: "user", text: prompt.trim() }]);
    const { runId } = await window.wraith.ai.agentStart(prompt.trim());
    aiRunIdRef.current = runId;
    setAiRunId(runId);
  }, []);

  const stopAiRun = useCallback(async () => {
    if (aiRunIdRef.current) await window.wraith.ai.agentStop(aiRunIdRef.current);
  }, []);

  const setInterceptEdit = useCallback((id: string, patch: Partial<EditableHeld>) => {
    setInterceptEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  }, []);

  const resolveIntercept = useCallback(
    async (pending: InterceptPending, action: "forward" | "drop") => {
      const edit = interceptEdits[pending.id];
      const edited: InterceptResolution["edited"] =
        action === "forward" && edit
          ? pending.direction === "request"
            ? { request: { method: edit.method, url: edit.url, headers: kvToHeadersRecord(edit.headers), body: utf8ToBase64(edit.bodyText) } }
            : {
                response: {
                  statusCode: edit.statusCode ?? 200,
                  statusMessage: edit.statusMessage ?? "OK",
                  headers: kvToHeadersRecord(edit.headers),
                  body: utf8ToBase64(edit.bodyText),
                },
              }
          : undefined;
      await window.wraith.proxy.resolveIntercept({ id: pending.id, action, edited });
      setInterceptQueue((q) => q.filter((p) => p.id !== pending.id));
      setInterceptEdits((e) => {
        const next = { ...e };
        delete next[pending.id];
        return next;
      });
    },
    [interceptEdits]
  );

  const forwardAllIntercepts = useCallback(async () => {
    const n = await window.wraith.proxy.forwardAll();
    setInterceptQueue([]);
    setInterceptEdits({});
    return n;
  }, []);

  const toast = useCallback((message: string, kind: "info" | "error" = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // ------------------------------------------------------------- Repeater

  const addRepeaterTab = useCallback((groupId: string | null = null) => {
    const tab = blankRepeaterTab(groupId);
    setRepeaterTabs((cur) => [...cur, tab]);
    setActiveRepeaterTabId(tab.id);
    return tab.id;
  }, []);

  const closeRepeaterTab = useCallback((id: number) => {
    setRepeaterTabs((cur) => {
      const next = cur.filter((t) => t.id !== id);
      const finalTabs = next.length === 0 ? [blankRepeaterTab()] : next;
      setActiveRepeaterTabId((activeId) => (activeId === id ? finalTabs[0].id : activeId));
      return finalTabs;
    });
  }, []);

  const renameRepeaterTab = useCallback((id: number, label: string) => {
    setRepeaterTabs((cur) => cur.map((t) => (t.id === id ? { ...t, label: label.trim() || t.label } : t)));
  }, []);

  const patchRepeaterTab = useCallback((id: number, patch: Partial<Pick<RepeaterTab, "request" | "insecure">>) => {
    setRepeaterTabs((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const sendRepeaterTab = useCallback(async (id: number) => {
    const tab = repeaterTabsRef.current.find((t) => t.id === id);
    if (!tab) return;
    setRepeaterTabs((cur) => cur.map((t) => (t.id === id ? { ...t, loading: true, response: null } : t)));
    try {
      const exchange = await window.wraith.repeater.send({
        method: tab.request.method,
        url: tab.request.url,
        headers: tab.request.headers,
        bodyBase64: utf8ToBase64(tab.request.bodyText),
        insecure: tab.insecure,
      });
      setRepeaterTabs((cur) => cur.map((t) => (t.id === id ? { ...t, loading: false, response: exchange.response } : t)));
    } catch (err: any) {
      setRepeaterTabs((cur) =>
        cur.map((t) =>
          t.id === id
            ? {
                ...t,
                loading: false,
                response: {
                  statusCode: 0,
                  statusMessage: String(err?.message || err),
                  headers: {},
                  body: "",
                  bodyTruncated: false,
                  timeMs: 0,
                },
              }
            : t
        )
      );
    }
  }, []);

  const sendToRepeater = useCallback(
    (req: PendingRepeaterRequest, label?: string) => {
      const tab = blankRepeaterTab(null);
      tab.label = label || safeHostname(req.url);
      tab.request = { method: req.method, url: req.url, headers: req.headers, bodyText: req.body };
      setRepeaterTabs((cur) => [...cur, tab]);
      setActiveRepeaterTabId(tab.id);
      setPage("repeater");
    },
    [setPage]
  );

  const [fuzzerSeed, setFuzzerSeed] = useState<PendingRepeaterRequest | null>(null);
  const sendToFuzzer = useCallback(
    (req: PendingRepeaterRequest) => {
      setFuzzerSeed(req);
      setPage("fuzzer");
    },
    [setPage]
  );
  const clearFuzzerSeed = useCallback(() => setFuzzerSeed(null), []);

  const [raceSeed, setRaceSeed] = useState<PendingRepeaterRequest | null>(null);
  const sendToRace = useCallback(
    (req: PendingRepeaterRequest) => {
      setRaceSeed(req);
      setPage("race");
    },
    [setPage]
  );
  const clearRaceSeed = useCallback(() => setRaceSeed(null), []);

  const createRepeaterGroup = useCallback((name: string) => {
    const id = `grp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setRepeaterGroups((cur) => [...cur, { id, name: name.trim() || "Group", color: GROUP_COLORS[cur.length % GROUP_COLORS.length] }]);
    return id;
  }, []);

  const renameRepeaterGroup = useCallback((id: string, name: string) => {
    setRepeaterGroups((cur) => cur.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g)));
  }, []);

  const deleteRepeaterGroup = useCallback((id: string) => {
    setRepeaterGroups((cur) => cur.filter((g) => g.id !== id));
    setRepeaterTabs((cur) => cur.map((t) => (t.groupId === id ? { ...t, groupId: null } : t)));
  }, []);

  const setRepeaterTabGroup = useCallback((tabId: number, groupId: string | null) => {
    setRepeaterTabs((cur) => cur.map((t) => (t.id === tabId ? { ...t, groupId } : t)));
  }, []);

  const sendRepeaterGroup = useCallback(
    async (groupId: string, mode: "parallel" | "sequential") => {
      const ids = repeaterTabsRef.current.filter((t) => t.groupId === groupId).map((t) => t.id);
      if (mode === "parallel") {
        await Promise.all(ids.map((id) => sendRepeaterTab(id)));
      } else {
        for (const id of ids) await sendRepeaterTab(id);
      }
    },
    [sendRepeaterTab]
  );

  return (
    <AppCtx.Provider
      value={{
        page,
        setPage,
        proxyStatus,
        refreshProxyStatus,
        sendToRepeater,
        fuzzerSeed,
        sendToFuzzer,
        clearFuzzerSeed,
        raceSeed,
        sendToRace,
        clearRaceSeed,
        toast,
        interceptQueue,
        interceptEdits,
        setInterceptEdit,
        resolveIntercept,
        forwardAllIntercepts,
        interceptArrivalTick,
        repeaterTabs,
        repeaterGroups,
        activeRepeaterTabId,
        setActiveRepeaterTabId,
        addRepeaterTab,
        closeRepeaterTab,
        renameRepeaterTab,
        patchRepeaterTab,
        sendRepeaterTab,
        createRepeaterGroup,
        renameRepeaterGroup,
        deleteRepeaterGroup,
        setRepeaterTabGroup,
        sendRepeaterGroup,
        aiItems,
        aiRunId,
        startAiRun,
        stopAiRun,
        comparerSlots,
        sendToComparer,
      }}
    >
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
