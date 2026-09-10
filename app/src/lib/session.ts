import { Exchange, Finding, Identity, WraithSettings } from "../../electron/types";

/**
 * A portable ".wraith" project file: History, Findings, Identities and the
 * project-shareable parts of Settings (proxy config incl. Match & Replace
 * rules, highlight rules, general prefs). Deliberately excludes the
 * Anthropic API key and first-run/theme flags -- those are per-machine, not
 * per-project, and nobody wants their API key inside a file they hand to a
 * teammate or attach to a bug report.
 */
export interface WraithSession {
  version: 1;
  exportedAt: string;
  history: Exchange[];
  findings: Finding[];
  identities: Identity[];
  settings: {
    proxy: WraithSettings["proxy"];
    highlightRules: WraithSettings["highlightRules"];
    general: WraithSettings["general"];
  };
}

export async function buildSession(): Promise<WraithSession> {
  const [history, findings, identities, settings] = await Promise.all([
    window.wraith.history.list(),
    window.wraith.findings.list(),
    window.wraith.identities.list(),
    window.wraith.settings.get(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    history,
    findings,
    identities,
    settings: { proxy: settings.proxy, highlightRules: settings.highlightRules, general: settings.general },
  };
}

export interface ApplySessionResult {
  historyCount: number;
  findingsCount: number;
  identitiesCount: number;
}

export async function applySession(session: WraithSession): Promise<ApplySessionResult> {
  if (!session || session.version !== 1) throw new Error("Unrecognized .wraith file format.");

  const imported = await window.wraith.history.import(session.history || []);

  for (const f of session.findings || []) {
    await window.wraith.findings.add({ title: f.title, description: f.description, severity: f.severity, status: f.status, source: f.source, exchangeId: f.exchangeId, url: f.url });
  }
  for (const i of session.identities || []) {
    await window.wraith.identities.add({ name: i.name, color: i.color, headers: i.headers });
  }
  if (session.settings) {
    await window.wraith.settings.update({
      proxy: session.settings.proxy,
      highlightRules: session.settings.highlightRules,
      general: session.settings.general,
    });
  }

  return { historyCount: imported.length, findingsCount: session.findings?.length || 0, identitiesCount: session.identities?.length || 0 };
}
