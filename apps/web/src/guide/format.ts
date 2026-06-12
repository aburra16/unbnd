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
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "steps"; readonly items: readonly (readonly InlinePart[])[] };

const STEP = /^\s*\d+\.\s+(.*)$/;
const HEADING = /^##\s+(.+)$/;
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: "bold", text: m[1] });
    else parts.push({ kind: "link", text: m[2]!, href: m[3]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export function formatBody(md: string): Block[] {
  const blocks: Block[] = [];
  // Chunks split on blank lines; a chunk of step lines becomes one steps block.
  for (const chunk of md.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    // A lone ## line is a heading (real document structure, Story 85);
    // deeper hashes are not the construct and fall through to literal text.
    if (lines.length === 1 && HEADING.test(lines[0]!)) {
      blocks.push({ kind: "heading", text: HEADING.exec(lines[0]!)![1]! });
      continue;
    }
    if (lines.every((l) => STEP.test(l))) {
      blocks.push({
        kind: "steps",
        items: lines.map((l) => parseInline(STEP.exec(l)![1]!)),
      });
    } else {
      blocks.push({ kind: "paragraph", parts: parseInline(lines.join(" ")) });
    }
  }
  return blocks;
}
