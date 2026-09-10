import { useState } from "react";
import { IconAi } from "../lib/icons";
import { useApp } from "../context/AppContext";

interface AskClaudeButtonProps {
  /** plain-text context to send (request/response, decoded token, cracked hash, whatever the caller has) */
  context: () => string;
  question?: string;
  label?: string;
}

/**
 * Small contextual "Ask Claude" affordance embedded in a page (History,
 * JWT, etc.) -- a one-shot analysis, distinct from the full agentic AI
 * page (which can act on the app, not just comment on one thing).
 */
export function AskClaudeButton({ context, question, label }: AskClaudeButtonProps) {
  const { toast, setPage } = useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setOpen(true);
    if (answer !== null || error !== null || loading) return;
    const settings = await window.wraith.settings.get();
    if (!settings.ai.apiKey) {
      toast("Add an Anthropic API key in Settings -> AI first.", "error");
      setPage("settings");
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await window.wraith.ai.explain({ context: context(), question });
      if (res.error) setError(res.error);
      else setAnswer(res.answer);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack-sm">
      <button className="btn btn-sm" onClick={() => (open ? setOpen(false) : run())}>
        <IconAi size={13} /> {label || (open ? "Hide" : "Ask Claude")}
      </button>
      {open && (
        <div className="codebox" style={{ whiteSpace: "pre-wrap" }}>
          {loading ? "Thinking…" : error ? `Error: ${error}` : answer}
        </div>
      )}
    </div>
  );
}
