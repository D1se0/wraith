export function StatusBadge({ code }: { code: number | undefined | null }) {
  if (!code) return <span className="badge badge-0">—</span>;
  const cls = code >= 500 ? "badge-5xx" : code >= 400 ? "badge-4xx" : code >= 300 ? "badge-3xx" : code >= 200 ? "badge-2xx" : "badge-0";
  return <span className={`badge ${cls}`}>{code}</span>;
}

export function MethodBadge({ method }: { method: string }) {
  return <span className="badge badge-method">{method}</span>;
}
