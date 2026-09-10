import { useEffect, useRef, useState } from "react";
import { WraithSettings } from "../../electron/types";
import { IconAi, IconSend, IconStop, IconExternal } from "../lib/icons";
import { AiTranscriptItem, useApp } from "../context/AppContext";

const SUGGESTIONS = [
  "Look through History and tell me what vulnerabilities you can find or things worth investigating.",
  "Search History for anything that looks like an API key, token or secret.",
  "Check the most recent JSON responses in History for missing security headers or verbose error messages.",
  "Find a request in History that uses a numeric ID and try changing it by one to see if it's an IDOR.",
];

export function Ai() {
  const { toast, setPage, aiItems, aiRunId, startAiRun, stopAiRun } = useApp();
  const [settings, setSettings] = useState<WraithSettings | null>(null);
  const [prompt, setPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.wraith.settings.get().then(setSettings);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [aiItems]);

  const send = async (text?: string) => {
    const p = (text ?? prompt).trim();
    if (!p || aiRunId) return;
    if (!settings?.ai.apiKey) {
      toast("Add an Anthropic API key in Settings -> AI first.", "error");
      setPage("settings");
      return;
    }
    setPrompt("");
    await startAiRun(p);
  };

  return (
    <div className="stack" style={{ height: "100%" }}>
      <div>
        <h1 className="page-title">AI</h1>
        <p className="page-sub">
          Give Claude a goal in plain language and it'll drive the app itself — read History, decode things, record findings, and, only when it's
          clearly useful, send a live request through Repeater to check a hypothesis.
        </p>
      </div>

      {!settings?.ai.apiKey && (
        <div className="panel row between">
          <span className="muted">No Anthropic API key configured yet.</span>
          <button className="btn btn-sm" onClick={() => setPage("settings")}>
            Set up in Settings
          </button>
        </div>
      )}

      <div className="panel stack" style={{ flex: 1, minHeight: 420, display: "flex" }}>
        {aiItems.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <IconAi size={30} />
            <p>Ask it to explore your captured traffic, or try one of these:</p>
            <div className="row wrap" style={{ justifyContent: "center", gap: 8, marginTop: 10 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ai-suggest" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-transcript" ref={scrollRef}>
            {aiItems.map((item, i) => <TranscriptRow key={i} item={item} />)}
            {aiRunId && <div className="ai-msg-system">Working…</div>}
          </div>
        )}

        <div className="ai-composer">
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "Go to History and see if you can find anything suspicious I could use to gain access to something"'
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {aiRunId ? (
            <button className="btn btn-danger btn-icon" onClick={stopAiRun} title="Stop">
              <IconStop size={16} />
            </button>
          ) : (
            <button className="btn btn-primary btn-icon" onClick={() => send()} disabled={!prompt.trim()} title="Send">
              <IconSend size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TranscriptRow({ item }: { item: AiTranscriptItem }) {
  if (item.kind === "user") {
    return (
      <div className="ai-msg ai-msg-text" style={{ alignSelf: "flex-end", background: "rgba(55,230,196,0.08)", borderColor: "rgba(55,230,196,0.25)" }}>
        {item.text}
      </div>
    );
  }
  if (item.kind === "text") {
    return <div className="ai-msg ai-msg-text">{item.text}</div>;
  }
  if (item.kind === "system") {
    return <div className="ai-msg-system">{item.text}</div>;
  }
  if (item.kind === "error") {
    return <div className="ai-msg ai-msg-error">{item.text}</div>;
  }
  return (
    <div className={`ai-msg ai-msg-tool ${item.isActive ? "active" : ""}`}>
      <div className="ai-msg-tool-head">
        {item.isActive ? <IconExternal size={12} /> : null}
        {item.toolName}
        {item.pending && " …"}
        {item.isActive && !item.pending && " (sent live traffic)"}
      </div>
      <div className="mono faint" style={{ fontSize: 11 }}>
        {JSON.stringify(item.toolInput)}
      </div>
      {item.toolOutput !== undefined && <div className="ai-msg-tool-body">{item.toolOutput.slice(0, 2000)}</div>}
    </div>
  );
}
