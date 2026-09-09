// Content model for the /#/docs manual. Keep every tool's documented
// behavior here as DATA (not hand-written JSX) so that updating what a
// button/field does later is a small, obvious diff in this one file's
// sibling `content.ts` -- see the note at the top of content.ts.

export interface DocsField {
  name: string;
  description: string;
  default?: string;
}

export type DocsBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "fields"; items: DocsField[] }
  | { type: "code"; lines: string[]; caption?: string }
  | { type: "example"; title: string; steps: string[] }
  | { type: "note"; text: string; kind?: "info" | "warn" };

export interface DocsSection {
  id: string;
  title: string;
  summary: string;
  icon: string; // key into the ICONS map in DocsPage.tsx
  body: DocsBlock[];
}
