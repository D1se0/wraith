import { ExchangeTag, HighlightRule } from "../../electron/types";

export function tagColor(tag: ExchangeTag, rules: HighlightRule[]): string | null {
  const rule = rules.find((r) => r.enabled && r.matchTag === tag);
  return rule ? rule.color : null;
}

/** First enabled rule color matching this exchange's tags -- used to tint the History row. */
export function firstMatchColor(tags: ExchangeTag[], rules: HighlightRule[]): string | null {
  for (const t of tags) {
    const c = tagColor(t, rules);
    if (c) return c;
  }
  return null;
}

export function TagPills({ tags, rules }: { tags: ExchangeTag[]; rules: HighlightRule[] }) {
  if (!tags.length) return null;
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      {tags.map((t) => {
        const color = tagColor(t, rules);
        return (
          <span
            key={t}
            className="tag-pill"
            style={
              color
                ? { background: `${color}22`, color, borderColor: `${color}55` }
                : { background: "rgba(var(--overlay-rgb),0.06)", color: "var(--text-dim)" }
            }
          >
            {t}
          </span>
        );
      })}
    </div>
  );
}
