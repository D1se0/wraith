import { useState } from "react";
import { RequestEditor } from "../components/RequestEditor";
import { ResponseViewer } from "../components/ResponseViewer";
import { IconPlus, IconX, IconSend, IconTrash, IconPlay, IconCheck } from "../lib/icons";
import { useApp, RepeaterTab } from "../context/AppContext";

export function Repeater() {
  const {
    repeaterTabs,
    repeaterGroups,
    activeRepeaterTabId,
    setActiveRepeaterTabId,
    addRepeaterTab,
    closeRepeaterTab,
    renameRepeaterTab,
    patchRepeaterTab,
    sendRepeaterTab,
    createRepeaterGroup,
    renameRepeaterGroup,
    deleteRepeaterGroup,
    setRepeaterTabGroup,
    sendRepeaterGroup,
  } = useApp();

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [sendingGroup, setSendingGroup] = useState<string | null>(null);
  // Electron's renderer doesn't implement window.prompt() at all (it
  // throws "prompt() is not supported"), so "create a new group" needs a
  // real inline text field instead of a native dialog.
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingGroupForActive, setCreatingGroupForActive] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const active = repeaterTabs.find((t) => t.id === activeRepeaterTabId) || repeaterTabs[0];
  const ungrouped = repeaterTabs.filter((t) => !t.groupId);

  const send = () => {
    if (!active) return;
    sendRepeaterTab(active.id);
  };

  const handleGroupSelect = (groupId: string) => {
    if (!active) return;
    setRepeaterTabGroup(active.id, groupId || null);
  };

  const commitNewGroup = (assignTabId?: number) => {
    const name = newGroupName.trim();
    if (name) {
      const id = createRepeaterGroup(name);
      if (assignTabId !== undefined) setRepeaterTabGroup(assignTabId, id);
    }
    setNewGroupName("");
    setCreatingGroup(false);
    setCreatingGroupForActive(false);
  };

  const startEditingGroup = (id: string, currentName: string) => {
    setEditingGroupId(id);
    setGroupDraft(currentName);
  };
  const commitGroupRename = () => {
    if (editingGroupId) renameRepeaterGroup(editingGroupId, groupDraft);
    setEditingGroupId(null);
  };

  const runGroup = async (groupId: string, mode: "parallel" | "sequential") => {
    setSendingGroup(groupId);
    try {
      await sendRepeaterGroup(groupId, mode);
    } finally {
      setSendingGroup(null);
    }
  };

  if (!active) return null;

  return (
    <div className="stack" style={{ height: "100%" }}>
      <div>
        <h1 className="page-title">Repeater</h1>
        <p className="page-sub">
          Tweak a request and resend it as many times as you like — each tab keeps its own history. Double-click a tab or group name to
          rename it.
        </p>
      </div>

      <div className="stack-sm">
        {repeaterGroups.map((group) => {
          const tabsInGroup = repeaterTabs.filter((t) => t.groupId === group.id);
          return (
            <div key={group.id} className="panel repeater-group" style={{ borderLeftColor: group.color }}>
              <div className="row between">
                <div className="row" style={{ gap: 8 }}>
                  <span className="group-dot" style={{ background: group.color }} />
                  {editingGroupId === group.id ? (
                    <input
                      autoFocus
                      value={groupDraft}
                      onChange={(e) => setGroupDraft(e.target.value)}
                      onBlur={commitGroupRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitGroupRename();
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      style={{ width: 160 }}
                    />
                  ) : (
                    <b onDoubleClick={() => startEditingGroup(group.id, group.name)} style={{ cursor: "pointer" }} title="Double-click to rename">
                      {group.name}
                    </b>
                  )}
                  <span className="muted">({tabsInGroup.length})</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={tabsInGroup.length === 0 || sendingGroup === group.id}
                    onClick={() => runGroup(group.id, "parallel")}
                    title="Send every request in this group at the same time"
                  >
                    <IconPlay size={12} /> {sendingGroup === group.id ? "Sending…" : "Send all (parallel)"}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={tabsInGroup.length === 0 || sendingGroup === group.id}
                    onClick={() => runGroup(group.id, "sequential")}
                    title="Send one at a time, in order"
                  >
                    Sequential
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => addRepeaterTab(group.id)} title="New tab in this group">
                    <IconPlus size={12} />
                  </button>
                  <button className="btn btn-ghost btn-icon" onClick={() => deleteRepeaterGroup(group.id)} title="Delete group (tabs stay, just ungrouped)">
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                {tabsInGroup.length === 0 && <span className="faint">No tabs in this group yet — use the + above or the "Group" picker below.</span>}
                {tabsInGroup.map((t) => (
                  <TabChip
                    key={t.id}
                    tab={t}
                    active={t.id === activeRepeaterTabId}
                    onSelect={() => setActiveRepeaterTabId(t.id)}
                    onClose={() => closeRepeaterTab(t.id)}
                    onRename={(label) => renameRepeaterTab(t.id, label)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <div className="row wrap" style={{ gap: 6 }}>
          {repeaterGroups.length > 0 && <span className="muted" style={{ alignSelf: "center" }}>Ungrouped:</span>}
          {ungrouped.map((t) => (
            <TabChip
              key={t.id}
              tab={t}
              active={t.id === activeRepeaterTabId}
              onSelect={() => setActiveRepeaterTabId(t.id)}
              onClose={() => closeRepeaterTab(t.id)}
              onRename={(label) => renameRepeaterTab(t.id, label)}
            />
          ))}
          <button className="btn btn-sm btn-icon" onClick={() => addRepeaterTab()} title="New tab">
            <IconPlus size={13} />
          </button>
          {creatingGroup ? (
            <span className="row" style={{ gap: 4 }}>
              <input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNewGroup();
                  if (e.key === "Escape") {
                    setCreatingGroup(false);
                    setNewGroupName("");
                  }
                }}
                placeholder="Group name…"
                style={{ width: 140 }}
              />
              <button className="btn btn-sm btn-icon" onClick={() => commitNewGroup()} title="Create group">
                <IconCheck size={12} />
              </button>
              <button
                className="btn btn-sm btn-ghost btn-icon"
                onClick={() => {
                  setCreatingGroup(false);
                  setNewGroupName("");
                }}
                title="Cancel"
              >
                <IconX size={12} />
              </button>
            </span>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => setCreatingGroup(true)}>
              <IconPlus size={12} /> New group
            </button>
          )}
        </div>
      </div>

      <div className="split" style={{ flex: 1, minHeight: 0 }}>
        <div className="panel" style={{ overflow: "auto" }}>
          <RequestEditor value={active.request} onChange={(request) => patchRepeaterTab(active.id, { request })} />
          <div className="row wrap" style={{ marginTop: 12, gap: 14 }}>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={active.insecure} onChange={(e) => patchRepeaterTab(active.id, { insecure: e.target.checked })} />
              <span className="muted">Ignore TLS errors</span>
            </label>
            <label className="row" style={{ gap: 6 }}>
              <span className="muted">Group</span>
              <select value={active.groupId || ""} onChange={(e) => handleGroupSelect(e.target.value)} style={{ width: 150 }}>
                <option value="">No group</option>
                {repeaterGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {creatingGroupForActive ? (
                <>
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitNewGroup(active.id);
                      if (e.key === "Escape") {
                        setCreatingGroupForActive(false);
                        setNewGroupName("");
                      }
                    }}
                    placeholder="Group name…"
                    style={{ width: 130 }}
                  />
                  <button className="btn btn-sm btn-icon" onClick={() => commitNewGroup(active.id)} title="Create and assign">
                    <IconCheck size={12} />
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setCreatingGroupForActive(true)} title="Create a new group with this tab in it">
                  <IconPlus size={11} /> new
                </button>
              )}
            </label>
            <button className="btn btn-primary" onClick={send} disabled={active.loading} style={{ marginLeft: "auto" }}>
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

function TabChip({
  tab,
  active,
  onSelect,
  onClose,
  onRename,
}: {
  tab: RepeaterTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.label);

  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        style={{ width: 130 }}
      />
    );
  }

  return (
    <button
      className={`chip ${active ? "active" : ""}`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(tab.label);
        setEditing(true);
      }}
      title="Double-click to rename"
    >
      {tab.loading && <span className="chip-spinner" />}
      {tab.label}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{ display: "flex" }}
      >
        <IconX size={11} />
      </span>
    </button>
  );
}
