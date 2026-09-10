import { useEffect, useState } from "react";
import { Identity } from "../../electron/types";
import { KeyValueEditor } from "../components/KeyValueEditor";
import { IconPlus, IconTrash, IconUsers } from "../lib/icons";

const COLORS = ["#37e6c4", "#7c5cff", "#ff8a3d", "#ff5c8a", "#4fb0ff", "#c792ff", "#ffd166"];

export function Identities() {
  const [items, setItems] = useState<Identity[]>([]);

  useEffect(() => {
    window.wraith.identities.list().then(setItems);
  }, []);

  const add = async () => {
    const identity = await window.wraith.identities.add({
      name: `Identity ${items.length + 1}`,
      color: COLORS[items.length % COLORS.length],
      headers: [{ key: "Authorization", value: "" }],
    });
    setItems((cur) => [...cur, identity]);
  };

  const update = async (id: string, patch: Partial<Identity>) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    await window.wraith.identities.update(id, patch);
  };

  const remove = async (id: string) => {
    setItems((cur) => cur.filter((i) => i.id !== id));
    await window.wraith.identities.delete(id);
  };

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1 className="page-title">Identities</h1>
          <p className="page-sub">
            Save named sets of auth headers (Authorization, Cookie…) so you can "Replay as…" from History — the fastest way to check broken
            access control / IDOR: does the same request return someone else's data under a different identity?
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={add}>
          <IconPlus size={13} /> Add identity
        </button>
      </div>

      {items.length === 0 ? (
        <div className="panel empty-state">
          <IconUsers size={30} />
          <p>No identities yet. Add one (e.g. "Admin", "User A", "Anonymous") to start replaying requests as different users from History.</p>
        </div>
      ) : (
        <div className="grid-2">
          {items.map((identity) => (
            <div key={identity.id} className="panel stack-sm" style={{ borderLeft: `3px solid ${identity.color}` }}>
              <div className="row between">
                <input
                  type="text"
                  value={identity.name}
                  onChange={(e) => update(identity.id, { name: e.target.value })}
                  style={{ fontWeight: 700, flex: 1 }}
                />
                <input type="color" value={identity.color} onChange={(e) => update(identity.id, { color: e.target.value })} />
                <button className="btn btn-ghost btn-icon" onClick={() => remove(identity.id)}>
                  <IconTrash size={13} />
                </button>
              </div>
              <span className="field-hint">Headers below overwrite the original request's headers of the same name when you "Replay as" this identity.</span>
              <KeyValueEditor rows={identity.headers} onChange={(rows) => update(identity.id, { headers: rows })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
