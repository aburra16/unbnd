// Guide content loader (Story 84 / ADR 0081 §1). Takes the raw md record
// (production wires import.meta.glob; tests inject fixtures), parses the
// authored frontmatter, and groups entries into the published sections.
// Missing anchor or name fails loudly: anchors are authored, never derived.
import { GUIDE_SECTIONS, type GuideSectionMeta } from "./sections";

export type GuideEntry = {
  readonly anchor: string;
  readonly name: string;
  readonly order: number;
  readonly related: readonly string[];
  readonly body: string;
};

export type GuideSection = GuideSectionMeta & {
  readonly entries: readonly GuideEntry[];
};

export type GuideContent = {
  /** Sections with at least one entry, in manifest order. */
  readonly published: readonly GuideSection[];
  /** The landing narrative body (content/landing.md), when published (Story 85). */
  readonly landing?: string;
};

type Frontmatter = Record<string, string>;

function parseFrontmatter(raw: string, path: string): { fm: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) throw new Error(`guide: ${path} has no frontmatter`);
  const fm: Frontmatter = {};
  for (const line of m[1]!.split("\n")) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    fm[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { fm, body: raw.slice(m[0].length) };
}

// Story 95: lines that are entirely an HTML comment are authoring metadata
// (the taxonomy-exemption marker the lint scanner reads) and never render.
// Inline comments inside a sentence still reach the formatter and render
// visibly wrong — they are not a sanctioned authoring form.
function stripAuthoringComments(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^\s*<!--.*-->\s*$/.test(line))
    .join("\n");
}

function parseRelated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadGuide(raw: Record<string, string>): GuideContent {
  const bySection = new Map<string, GuideEntry[]>();
  let landing: string | undefined;
  for (const [path, text] of Object.entries(raw)) {
    // The root-level landing.md is the landing slot (Story 85 / ADR 0082):
    // narrative, not an entry; the entry frontmatter rules do not apply.
    if (/content\/landing\.md$/.test(path)) {
      const fm = /^---\n[\s\S]*?\n---\n?/.exec(text);
      landing = stripAuthoringComments(fm ? text.slice(fm[0].length) : text).trim();
      continue;
    }
    const seg = /content\/([^/]+)\//.exec(path)?.[1];
    if (!seg || !GUIDE_SECTIONS.some((s) => s.slug === seg)) {
      throw new Error(`guide: ${path} is not under a known section directory`);
    }
    const { fm, body } = parseFrontmatter(text, path);
    if (!fm.anchor) throw new Error(`guide: ${path} is missing the authored anchor`);
    if (!fm.name) throw new Error(`guide: ${path} is missing the on-screen name`);
    const entry: GuideEntry = {
      anchor: fm.anchor,
      name: fm.name,
      order: Number(fm.order ?? 0),
      related: parseRelated(fm.related),
      body: stripAuthoringComments(body).trim(),
    };
    const list = bySection.get(seg) ?? [];
    list.push(entry);
    bySection.set(seg, list);
  }

  const published: GuideSection[] = [];
  for (const meta of GUIDE_SECTIONS) {
    const entries = bySection.get(meta.slug);
    if (!entries || entries.length === 0) continue;
    entries.sort((a, b) => a.order - b.order);
    published.push({ ...meta, entries });
  }
  return landing === undefined ? { published } : { published, landing };
}
