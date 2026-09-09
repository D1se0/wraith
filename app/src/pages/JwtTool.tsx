import { useEffect, useRef, useState } from "react";
import { JwtAlgorithm, JwtDecodeResult, DefaultWordlistInfo } from "../../electron/types";
import { copyToClipboard } from "../lib/format";
import { IconCopy, IconPlay, IconStop, IconCheck, IconX, IconWarning } from "../lib/icons";

const ALGORITHMS: JwtAlgorithm[] = ["none", "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384", "ES512"];

function keyLabel(alg: JwtAlgorithm): string {
  if (alg === "none") return "";
  if (alg.startsWith("HS")) return "HMAC secret";
  return "Private key (PEM)";
}

function pretty(v: any): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function JwtTool() {
  // --- decode ---
  const [token, setToken] = useState("");
  const [decoded, setDecoded] = useState<JwtDecodeResult | null>(null);

  useEffect(() => {
    if (!token.trim()) {
      setDecoded(null);
      return;
    }
    let cancelled = false;
    window.wraith.jwt.decode(token.trim()).then((r) => !cancelled && setDecoded(r));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // --- sign ---
  const [headerJson, setHeaderJson] = useState('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
  const [payloadJson, setPayloadJson] = useState('{\n  "sub": "1234567890",\n  "name": "test",\n  "iat": 1700000000\n}');
  const [signAlg, setSignAlg] = useState<JwtAlgorithm>("HS256");
  const [signKey, setSignKey] = useState("");
  const [signedToken, setSignedToken] = useState("");
  const [signError, setSignError] = useState<string | null>(null);

  const loadFromDecoded = () => {
    if (!decoded?.wellFormed) return;
    setHeaderJson(pretty(decoded.header));
    setPayloadJson(pretty(decoded.payload));
    if (decoded.algorithm && ALGORITHMS.includes(decoded.algorithm as JwtAlgorithm)) {
      setSignAlg(decoded.algorithm as JwtAlgorithm);
    }
  };

  const doSign = async (algOverride?: JwtAlgorithm, headerOverride?: string) => {
    const algorithm = algOverride ?? signAlg;
    const res = await window.wraith.jwt.sign({ headerJson: headerOverride ?? headerJson, payloadJson, algorithm, secretOrKey: signKey });
    if (res.error) {
      setSignError(res.error);
      setSignedToken("");
    } else {
      setSignError(null);
      setSignedToken(res.token);
    }
  };

  // The classic attack needs the header to actually CLAIM alg:none too --
  // a vulnerable verifier trusts the header, not just an empty signature,
  // so just forcing the signing algorithm without rewriting "alg" in the
  // header JSON would produce a token no real vulnerable verifier accepts.
  const stripSignature = async () => {
    let nextHeader = headerJson;
    try {
      const parsed = JSON.parse(headerJson);
      parsed.alg = "none";
      nextHeader = JSON.stringify(parsed, null, 2);
    } catch {
      nextHeader = '{\n  "alg": "none",\n  "typ": "JWT"\n}';
    }
    setHeaderJson(nextHeader);
    setSignAlg("none");
    await doSign("none", nextHeader);
  };

  // --- verify ---
  const [verifyToken, setVerifyToken] = useState("");
  const [verifyKey, setVerifyKey] = useState("");
  const [verifyAlgOverride, setVerifyAlgOverride] = useState<JwtAlgorithm | "">("");
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; algorithm: string; reason?: string } | null>(null);

  const doVerify = async () => {
    const res = await window.wraith.jwt.verify({
      token: verifyToken || token,
      secretOrKey: verifyKey,
      algorithm: verifyAlgOverride || undefined,
    });
    setVerifyResult(res);
  };

  // --- crack ---
  const [crackToken, setCrackToken] = useState("");
  const [crackWordlist, setCrackWordlist] = useState("");
  const [crackWordlistSource, setCrackWordlistSource] = useState<string | null>(null);
  const [crackJobId, setCrackJobId] = useState<string | null>(null);
  const [crackTried, setCrackTried] = useState(0);
  const [crackRate, setCrackRate] = useState(0);
  const [crackFound, setCrackFound] = useState<string | null>(null);
  const [crackDone, setCrackDone] = useState(false);
  const [crackError, setCrackError] = useState<string | null>(null);
  // Mirrors crackJobId but updates synchronously (no waiting on a React
  // re-render), so the event listener below -- subscribed exactly once on
  // mount -- can never miss an event that arrives before state catches up.
  // A crack can finish in a single try (e.g. the target's secret is the
  // wordlist's first line), so "found"/"done" can arrive within the same
  // tick as the job starting; re-subscribing via a `[crackJobId]` effect
  // dependency would attach its listener one render too late for that case
  // and silently drop the result.
  const crackJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await window.wraith.settings.get();
      if (settings.general.defaultWordlist) {
        setCrackWordlist(settings.general.defaultWordlist);
        setCrackWordlistSource("settings override");
        return;
      }
      const info: DefaultWordlistInfo = await window.wraith.cracker.defaultWordlist();
      if (info.path) {
        setCrackWordlist(info.path);
        setCrackWordlistSource(`Kali's rockyou.txt (${Math.round((info.sizeBytes || 0) / 1024 / 1024)} MB)`);
      }
    })();
  }, []);

  useEffect(() => {
    const off = window.wraith.jwt.onCrackEvent((evt) => {
      if (evt.jobId !== crackJobIdRef.current) return;
      if (evt.type === "progress") {
        setCrackTried(evt.tried || 0);
        setCrackRate(evt.ratePerSec || 0);
      } else if (evt.type === "found") {
        setCrackFound(evt.secret || "");
        setCrackTried((cur) => evt.tried || cur);
      } else if (evt.type === "done") {
        setCrackDone(true);
        crackJobIdRef.current = null;
        setCrackJobId(null);
      } else if (evt.type === "error") {
        setCrackError(evt.message || "Unknown error");
        crackJobIdRef.current = null;
        setCrackJobId(null);
      }
    });
    return off;
  }, []);

  const pickCrackWordlist = async () => {
    const p = await window.wraith.app.chooseFile();
    if (p) {
      setCrackWordlist(p);
      setCrackWordlistSource(null);
    }
  };

  const startCrack = async () => {
    setCrackFound(null);
    setCrackDone(false);
    setCrackError(null);
    setCrackTried(0);
    setCrackRate(0);
    const t = crackToken.trim() || token.trim();
    if (!t || !crackWordlist) return;
    const { jobId } = await window.wraith.jwt.crackStart({ token: t, wordlistFile: crackWordlist });
    crackJobIdRef.current = jobId;
    setCrackJobId(jobId);
  };

  const stopCrack = async () => {
    if (crackJobId) await window.wraith.jwt.crackStop(crackJobId);
    crackJobIdRef.current = null;
    setCrackJobId(null);
  };

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">JWT</h1>
        <p className="page-sub">Decode, reconstruct, sign, verify and crack JSON Web Tokens.</p>
      </div>

      <div className="panel stack">
        <div className="panel-title">Decode</div>
        <textarea
          rows={3}
          className="mono"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        />
        {decoded && (
          <>
            {!decoded.wellFormed || decoded.error ? (
              <div className="badge badge-4xx">{decoded.error || "Not a well-formed JWT"}</div>
            ) : (
              <div className="split">
                <div className="stack-sm">
                  <div className="row between">
                    <span className="muted">Header {decoded.algorithm && <span className="badge">{decoded.algorithm}</span>}</span>
                  </div>
                  <pre className="codebox">{pretty(decoded.header)}</pre>
                </div>
                <div className="stack-sm">
                  <span className="muted">Payload</span>
                  <pre className="codebox">{pretty(decoded.payload)}</pre>
                </div>
              </div>
            )}
            {decoded.wellFormed && (
              <div className="row" style={{ gap: 8 }}>
                <span className="muted">Signature:</span>
                <code className="mono faint" style={{ wordBreak: "break-all" }}>
                  {decoded.signatureB64Url || "(none)"}
                </code>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel stack">
        <div className="row between">
          <div className="panel-title">Sign / reconstruct</div>
          <button className="btn btn-ghost btn-sm" onClick={loadFromDecoded} disabled={!decoded?.wellFormed}>
            Load from decoded token
          </button>
        </div>
        <div className="split">
          <div className="field">
            <label>Header JSON</label>
            <textarea rows={6} className="mono" value={headerJson} onChange={(e) => setHeaderJson(e.target.value)} />
          </div>
          <div className="field">
            <label>Payload JSON</label>
            <textarea rows={6} className="mono" value={payloadJson} onChange={(e) => setPayloadJson(e.target.value)} />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field" style={{ width: 140 }}>
            <label>Algorithm</label>
            <select value={signAlg} onChange={(e) => setSignAlg(e.target.value as JwtAlgorithm)}>
              {ALGORITHMS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          {signAlg !== "none" && (
            <div className="field" style={{ flex: 1 }}>
              <label>{keyLabel(signAlg)}</label>
              <textarea rows={2} className="mono" value={signKey} onChange={(e) => setSignKey(e.target.value)} placeholder={signAlg.startsWith("HS") ? "secret" : "-----BEGIN PRIVATE KEY-----…"} />
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-primary" onClick={() => doSign()}>
            Sign →
          </button>
          <button className="btn btn-ghost btn-sm" onClick={stripSignature} title='Sets algorithm to "none" and re-signs, producing an unsigned token'>
            Strip signature (alg:none attack)
          </button>
        </div>
        {signError && <div className="badge badge-5xx">{signError}</div>}
        {signedToken && (
          <div className="row" style={{ gap: 8 }}>
            <code className="mono" style={{ wordBreak: "break-all", flex: 1 }}>
              {signedToken}
            </code>
            <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(signedToken)}>
              <IconCopy size={12} /> Copy
            </button>
          </div>
        )}
      </div>

      <div className="panel stack">
        <div className="panel-title">Verify</div>
        <div className="field">
          <label>Token</label>
          <textarea rows={2} className="mono" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="(defaults to the token above if left empty)" />
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Secret / public key</label>
            <textarea rows={2} className="mono" value={verifyKey} onChange={(e) => setVerifyKey(e.target.value)} />
          </div>
          <div className="field" style={{ width: 180 }}>
            <label>Algorithm override</label>
            <select value={verifyAlgOverride} onChange={(e) => setVerifyAlgOverride(e.target.value as JwtAlgorithm | "")}>
              <option value="">(trust token header)</option>
              {ALGORITHMS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={doVerify}>
            Verify
          </button>
        </div>
        {verifyResult && (
          <div className={`row badge ${verifyResult.valid ? "badge-2xx" : "badge-5xx"}`} style={{ gap: 8, width: "fit-content" }}>
            {verifyResult.valid ? <IconCheck size={13} /> : <IconX size={13} />}
            {verifyResult.valid ? `Valid (${verifyResult.algorithm})` : verifyResult.reason || "Invalid"}
          </div>
        )}
      </div>

      <div className="panel stack">
        <div className="panel-title">Crack secret (HS256/384/512 only)</div>
        <div className="field">
          <label>Token</label>
          <textarea rows={2} className="mono" value={crackToken} onChange={(e) => setCrackToken(e.target.value)} placeholder="(defaults to the token above if left empty)" />
        </div>
        <div className="field">
          <label>Wordlist</label>
          <div className="row">
            <input type="text" readOnly value={crackWordlist} placeholder="Choose a file…" onClick={pickCrackWordlist} />
            <button className="btn btn-sm" onClick={pickCrackWordlist}>
              Browse
            </button>
          </div>
          {crackWordlistSource && <span className="field-hint">Using {crackWordlistSource}.</span>}
        </div>
        <div className="row" style={{ gap: 10 }}>
          {crackJobId ? (
            <button className="btn btn-danger" onClick={stopCrack}>
              <IconStop size={13} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startCrack} disabled={!crackWordlist}>
              <IconPlay size={13} /> Start cracking
            </button>
          )}
          {(crackJobId || crackTried > 0) && (
            <span className="muted">
              {crackTried.toLocaleString()} tried {crackRate > 0 && `· ${crackRate.toLocaleString()}/s`}
            </span>
          )}
        </div>
        {crackError && (
          <div className="row badge badge-4xx" style={{ gap: 8, width: "fit-content" }}>
            <IconWarning size={13} /> {crackError}
          </div>
        )}
        {crackFound && (
          <div className="row" style={{ gap: 8, alignItems: "center", padding: 12, borderRadius: 10, background: "rgba(55,230,196,0.1)", border: "1px solid rgba(55,230,196,0.35)" }}>
            <IconCheck size={16} style={{ color: "var(--accent-a)" }} />
            <span>
              Secret found: <code className="mono" style={{ color: "var(--accent-a)", fontWeight: 700 }}>{crackFound}</code>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(crackFound)}>
              <IconCopy size={12} /> Copy
            </button>
          </div>
        )}
        {crackDone && !crackFound && !crackError && <div className="muted">Not found in this wordlist.</div>}
      </div>
    </div>
  );
}
