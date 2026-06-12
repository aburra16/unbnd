// The subset formatter (Story 84 / ADR 0081 §1): paragraphs, numbered step
// lists, [text](path) links, **bold** labels. A constrained formatter over
// in-repo authored text, not a markdown engine; unknown constructs render as
// literal paragraph text so they are visibly wrong in review, never swallowed.

export type InlinePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "bold"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

export type Block =
  | { readonly kind: "paragraph"; readonly parts: readonly InlinePart[] }
  | { readonly kind: "steps"; readonly items: readonly (readonly InlinePart[])[] };

// STUB (red): real formatting in implementation.
export function formatBody(_md: string): Block[] {
  return [];
}
