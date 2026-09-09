import { useEffect, useState } from "react";
import { CapturedResponse } from "../../electron/types";
import { RequestEditor, EditableRequest } from "../components/RequestEditor";
import { ResponseViewer } from "../components/ResponseViewer";
import { IconPlus, IconX, IconSend } from "../lib/icons";
import { utf8ToBase64 } from "../lib/base64";
import { useApp } from "../context/AppContext";

interface RepeaterTab {
  id: number;
  label: string;
  request: EditableRequest;
  response: CapturedResponse | null;
  loading: boolean;
  insecure: boolean;
}

let nextTabId = 1;

function blankTab(): RepeaterTab {
  return {
    id: nextTabId++,
    label: `Request ${nextTabId - 1}`,
    request: { method: "GET", url: "https://", headers: [{ key: "User-Agent", value: "Wraith/1.0" }], bodyText: "" },
    response: null,
    loading: false,
    insecure: true,
  };
}

export function Repeater() {
  const { pendingRepeaterRequest, consumePendingRepeaterRequest } = useApp();
  const [tabs, setTabs] = useState<RepeaterTab[]>(() => [blankTab()]);
  const [activeId, setActiveId] = useState<number>(() => tabs[0]?.id ?? 1);

  useEffect(() => {
    if (!pendingRepeaterRequest) return;
    const pending = consumePendingRepeaterRequest();
    if (!pending) return;
    const tab = blankTab();
    tab.label = new URL(safeUrl(pending.url)).hostname || "Request";
    tab.request = { method: pending.method, url: pending.url, headers: pending.headers, bodyText: pending.body };
    setTabs((cur) => [...cur, tab]);
    setActiveId(tab.id);
  }, [pendingRepeaterRequest, consumePendingRepeaterRequest]);

  const active = tabs.find((t) => t.id === activeId) || tabs[0];

  const patchActive = (patch: Partial<RepeaterTab>) => {
    setTabs((cur) => cur.map((t) => (t.id === active.id ? { ...t, ...patch } : t)));
  };

  const addTab = () => {
    const t = blankTab();
    setTabs((cur) => [...cur, t]);
    setActiveId(t.id);
  };

  const closeTab = (id: number) => {
    setTabs((cur) => {
      const next = cur.filter((t) => t.id !== id);
      if (next.length === 0) next.push(blankTab());
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const send = async () => {
    patchActive({ loading: true, response: null });
    try {
      const exchange = await window.wraith.repeater.send({
        method: active.request.method,
        url: active.request.url,
        headers: active.request.headers,
        bodyBase64: utf8ToBase64(active.request.bodyText),
        insecure: active.insecure,
      });
      patchActive({ response: exchange.response, loading: false });
    } catch (err: any) {
      patchActive({
        loading: false,
        response: {
          statusCode: 0,
          statusMessage: String(err?.message || err),
          headers: {},
          body: "",
          bodyTruncated: false,
          timeMs: 0,
        },
      });
    }
  };

  return (
    <div className="stack" style={{ height: "100%" }}>
      <div>
        <h1 className="page-title">Repeater</h1>
        <p className="page-sub">Tweak a request and resend it as many times as you like — each tab keeps its own history.</p>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {tabs.map((t) => (
          <button key={t.id} className={`chip ${t.id === activeId ? "active" : ""}`} onClick={() => setActiveId(t.id)}>
            {t.label}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              style={{ display: "flex" }}
            >
              <IconX size={11} />
            </span>
          </button>
        ))}
        <button className="btn btn-sm btn-icon" onClick={addTab} title="New tab">
          <IconPlus size={13} />
        </button>
      </div>

      <div className="split" style={{ flex: 1, minHeight: 0 }}>
        <div className="panel" style={{ overflow: "auto" }}>
          <RequestEditor value={active.request} onChange={(request) => patchActive({ request })} />
          <div className="row" style={{ marginTop: 12, gap: 14 }}>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={active.insecure} onChange={(e) => patchActive({ insecure: e.target.checked })} />
              <span className="muted">Ignore TLS errors</span>
            </label>
            <button className="btn btn-primary" onClick={send} disabled={active.loading}>
              <IconSend size={13} /> {active.loading ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
        <div className="panel" style={{ overflow: "auto" }}>
          <ResponseViewer response={active.response} loading={active.loading} />
        </div>
      </div>
    </div>
  );
}

function safeUrl(u: string): string {
  try {
    // eslint-disable-next-line no-new
    new URL(u);
    return u;
  } catch {
    return "http://invalid.local";
  }
}
