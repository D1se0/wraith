import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { ProxyStatus, InterceptPending, InterceptResolution, CapturedResponse } from "../../electron/types";
import { base64ToUtf8, utf8ToBase64 } from "../lib/base64";
import { EditableRequest } from "../components/RequestEditor";

export type Page = "welcome" | "proxy" | "history" | "repeater" | "decoder" | "capture" | "cracker" | "curl" | "crawler" | "jwt" | "settings";

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

interface AppContextValue {
  page: Page;
  setPage: (p: Page) => void;
  proxyStatus: ProxyStatus;
  refreshProxyStatus: () => void;
  /** Creates a brand new Repeater tab pre-filled with this request and switches to the Repeater page. Safe to call repeatedly in quick succession -- each call gets its own tab, nothing is ever overwritten. */
  sendToRepeater: (req: PendingRepeaterRequest) => void;
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

  const refreshProxyStatus = useCallback(() => {
    window.wraith.proxy.status().then(setProxyStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshProxyStatus();
    const off = window.wraith.proxy.onStatusChange((s) => setProxyStatus(s));
    return off;
  }, [refreshProxyStatus]);

  // Apply a saved accent color once at boot, before the user visits Settings.
  useEffect(() => {
    window.wraith.settings.get().then((s) => {
      if (s.general.accentFrom) document.documentElement.style.setProperty("--accent-a", `#${s.general.accentFrom}`);
      if (s.general.accentTo) document.documentElement.style.setProperty("--accent-b", `#${s.general.accentTo}`);
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
    (req: PendingRepeaterRequest) => {
      const tab = blankRepeaterTab(null);
      tab.label = safeHostname(req.url);
      tab.request = { method: req.method, url: req.url, headers: req.headers, bodyText: req.body };
      setRepeaterTabs((cur) => [...cur, tab]);
      setActiveRepeaterTabId(tab.id);
      setPage("repeater");
    },
    [setPage]
  );

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
