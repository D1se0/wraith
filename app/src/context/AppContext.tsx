import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { ProxyStatus, InterceptPending, InterceptResolution } from "../../electron/types";
import { base64ToUtf8, utf8ToBase64 } from "../lib/base64";

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

interface AppContextValue {
  page: Page;
  setPage: (p: Page) => void;
  proxyStatus: ProxyStatus;
  refreshProxyStatus: () => void;
  pendingRepeaterRequest: PendingRepeaterRequest | null;
  sendToRepeater: (req: PendingRepeaterRequest) => void;
  consumePendingRepeaterRequest: () => PendingRepeaterRequest | null;
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
  const [pendingRepeaterRequest, setPendingRepeaterRequest] = useState<PendingRepeaterRequest | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const [interceptQueue, setInterceptQueue] = useState<InterceptPending[]>([]);
  const [interceptEdits, setInterceptEdits] = useState<Record<string, EditableHeld>>({});
  const [interceptArrivalTick, setInterceptArrivalTick] = useState(0);

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

  const sendToRepeater = useCallback(
    (req: PendingRepeaterRequest) => {
      setPendingRepeaterRequest(req);
      setPage("repeater");
    },
    [setPage]
  );

  // NOTE: this must NOT try to read the state via the setState updater's
  // argument and return it synchronously -- React does not guarantee (and
  // in React 18's batched updates, does not) invoke that updater within
  // the same call stack, so `value` would always still be null when
  // returned. Read the already-current `pendingRepeaterRequest` closure
  // value directly instead; only the clearing needs to go through setState.
  const consumePendingRepeaterRequest = useCallback(() => {
    setPendingRepeaterRequest(null);
    return pendingRepeaterRequest;
  }, [pendingRepeaterRequest]);

  const toast = useCallback((message: string, kind: "info" | "error" = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <AppCtx.Provider
      value={{
        page,
        setPage,
        proxyStatus,
        refreshProxyStatus,
        pendingRepeaterRequest,
        sendToRepeater,
        consumePendingRepeaterRequest,
        toast,
        interceptQueue,
        interceptEdits,
        setInterceptEdit,
        resolveIntercept,
        forwardAllIntercepts,
        interceptArrivalTick,
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
