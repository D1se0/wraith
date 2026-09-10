import { Exchange } from "../../electron/types";
import { base64ToBytes, base64ToUtf8, isLikelyBinary } from "./base64";
import { ChainStep } from "./chain";

interface ReqInfo {
  method: string;
  url: string;
  headers: [string, string][];
  bodyText: string | null; // null if binary or empty
}

function extract(ex: Exchange): ReqInfo {
  const headers = Object.entries(ex.request.headers)
    .filter(([k]) => !/^(content-length|connection)$/i.test(k))
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")] as [string, string]);
  const bytes = base64ToBytes(ex.request.body);
  const bodyText = bytes.length === 0 ? null : isLikelyBinary(bytes) ? null : base64ToUtf8(ex.request.body);
  return { method: ex.request.method, url: ex.request.url, headers, bodyText };
}

function pyStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function jsStr(s: string): string {
  return JSON.stringify(s);
}
function goStr(s: string): string {
  return JSON.stringify(s);
}

export function toPythonRequests(ex: Exchange): string {
  const { method, url, headers, bodyText } = extract(ex);
  const lines = ["import requests", "", `url = ${pyStr(url)}`, "", "headers = {"];
  for (const [k, v] of headers) lines.push(`    ${pyStr(k)}: ${pyStr(v)},`);
  lines.push("}");
  if (bodyText) {
    lines.push("", `data = ${pyStr(bodyText)}`, "", `response = requests.request(${pyStr(method)}, url, headers=headers, data=data)`);
  } else {
    lines.push("", `response = requests.request(${pyStr(method)}, url, headers=headers)`);
  }
  lines.push("", "print(response.status_code)", "print(response.text)");
  return lines.join("\n");
}

export function toJsFetch(ex: Exchange): string {
  const { method, url, headers, bodyText } = extract(ex);
  const lines = ["const headers = {"];
  for (const [k, v] of headers) lines.push(`  ${jsStr(k)}: ${jsStr(v)},`);
  lines.push("};", "");
  lines.push(`fetch(${jsStr(url)}, {`, `  method: ${jsStr(method)},`, "  headers,");
  if (bodyText) lines.push(`  body: ${jsStr(bodyText)},`);
  lines.push("})", "  .then((res) => res.text().then((text) => console.log(res.status, text)));");
  return lines.join("\n");
}

export function toGoNetHttp(ex: Exchange): string {
  const { method, url, headers, bodyText } = extract(ex);
  const lines = [
    "package main",
    "",
    "import (",
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    ...(bodyText ? ['\t"strings"'] : []),
    ")",
    "",
    "func main() {",
    `\turl := ${goStr(url)}`,
  ];
  if (bodyText) {
    lines.push(`\tbody := strings.NewReader(${goStr(bodyText)})`, `\treq, _ := http.NewRequest(${goStr(method)}, url, body)`);
  } else {
    lines.push(`\treq, _ := http.NewRequest(${goStr(method)}, url, nil)`);
  }
  for (const [k, v] of headers) lines.push(`\treq.Header.Set(${goStr(k)}, ${goStr(v)})`);
  lines.push(
    "",
    "\tclient := &http.Client{}",
    "\tresp, err := client.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer resp.Body.Close()",
    "",
    "\trespBody, _ := io.ReadAll(resp.Body)",
    "\tfmt.Println(resp.StatusCode)",
    "\tfmt.Println(string(respBody))",
    "}"
  );
  return lines.join("\n");
}

/** Generates a standalone Python PoC reproducing a whole Attack Chain: each step's {{var}} placeholders get substituted from a running `vars` dict, and each step's extract rules populate it further for the next step. */
export function toPythonChain(steps: ChainStep[]): string {
  const lines = [
    "import json, re, requests",
    "",
    "vars = {}",
    "",
    "def sub(text):",
    "    return re.sub(r'\\{\\{(\\w+)\\}\\}', lambda m: vars.get(m.group(1), m.group(0)), text)",
    "",
    "def json_path_get(obj, path):",
    "    cur = obj",
    "    for part in path.lstrip('$.').split('.'):",
    "        if not part or cur is None:",
    "            continue",
    "        cur = cur.get(part) if isinstance(cur, dict) else None",
    "    return cur",
    "",
    "def extract(body_text, source):",
    "    if source.startswith('json:'):",
    "        try:",
    "            v = json_path_get(json.loads(body_text), source[5:].strip())",
    "            return v if isinstance(v, str) else (json.dumps(v) if v is not None else None)",
    "        except Exception:",
    "            return None",
    "    if source.startswith('regex:'):",
    "        m = re.search(source[6:], body_text)",
    "        if not m:",
    "            return None",
    "        return m.group(1) if m.groups() else m.group(0)",
    "    return None",
    "",
  ];

  steps.forEach((step, i) => {
    lines.push(`# --- ${pyComment(step.label)} ---`);
    lines.push(`url = sub(${pyStr(step.request.url)})`);
    lines.push("headers = {");
    for (const h of step.request.headers) if (h.key.trim()) lines.push(`    ${pyStr(h.key)}: sub(${pyStr(h.value)}),`);
    lines.push("}");
    if (step.request.bodyText) {
      lines.push(`data = sub(${pyStr(step.request.bodyText)})`);
      lines.push(`resp = requests.request(${pyStr(step.request.method)}, url, headers=headers, data=data, verify=${step.insecure ? "False" : "True"})`);
    } else {
      lines.push(`resp = requests.request(${pyStr(step.request.method)}, url, headers=headers, verify=${step.insecure ? "False" : "True"})`);
    }
    lines.push(`print(${pyStr(`[step ${i + 1}: ${step.label}]`)}, resp.status_code)`);
    for (const ex of step.extracts) {
      lines.push(`vars[${pyStr(ex.varName)}] = extract(resp.text, ${pyStr(ex.source)})`);
      lines.push(`print("  extracted", ${pyStr(ex.varName)}, "=", vars.get(${pyStr(ex.varName)}))`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

function pyComment(s: string): string {
  return s.replace(/\n/g, " ");
}
