import { IconPlus, IconX } from "../lib/icons";

export interface KV {
  key: string;
  value: string;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Header",
  valuePlaceholder = "Value",
}: {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const update = (i: number, patch: Partial<KV>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { key: "", value: "" }]);

  return (
    <div className="stack-sm">
      {rows.map((r, i) => (
        <div className="kv-row" key={i}>
          <input type="text" placeholder={keyPlaceholder} value={r.key} onChange={(e) => update(i, { key: e.target.value })} />
          <input type="text" placeholder={valuePlaceholder} value={r.value} onChange={(e) => update(i, { value: e.target.value })} />
          <button className="btn btn-ghost btn-icon" onClick={() => remove(i)} title="Remove">
            <IconX size={14} />
          </button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={add} style={{ alignSelf: "flex-start" }}>
        <IconPlus size={13} /> Add row
      </button>
    </div>
  );
}
