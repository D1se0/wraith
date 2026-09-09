import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { ProxyStatus } from "../../electron/types";

export type Page = "welcome" | "proxy" | "history" | "repeater" | "decoder" | "capture" | "cracker" | "curl" | "crawler" | "settings";

export interface PendingRepeaterRequest {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string; // utf-8 text, not base64
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
}

const AppCtx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp() must be used inside <AppProvider>");
  return ctx;
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

  const sendToRepeater = useCallback(
    (req: PendingRepeaterRequest) => {
      setPendingRepeaterRequest(req);
      setPage("repeater");
    },
    [setPage]
  );

  const consumePendingRepeaterRequest = useCallback(() => {
    let value: PendingRepeaterRequest | null = null;
    setPendingRepeaterRequest((current) => {
      value = current;
      return null;
    });
    return value;
  }, []);

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
