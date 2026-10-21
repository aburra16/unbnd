// Open Library dump lines into the fields the gate and mapper read (Story 109 /
// ADR 0097 §3), computed as Open Library's search index computes them and as
// the sizing pass validated against the live catalog. Pure: no I/O.
import type { OLSearchDoc } from "../gate";
import { birthYearOf } from "../year";

/** A dump line: type, key, revision, last modified, JSON. */
export function splitDumpLine(line: string): { type: string; key: string; json: string } | null {
  const parts = line.split("\t", 5);
  if (parts.length < 5) return null;
  return { type: parts[0]!, key: parts[1]!, json: parts[4]! };
}

const bare = (key: string, kind: "works" | "authors") => {
  const m = key.match(new RegExp(`^/${kind}/(OL\\d+${kind === "works" ? "W" : "A"})$`));
  return m ? m[1]! : null;
};

/** The work a reading-log line counts a reader for. */
export function readingLogWorkId(line: string): string | null {
  const tab = line.indexOf("\t");
  return bare(tab === -1 ? line : line.slice(0, tab), "works");
}

/** A work or author redirect, as bare ids. */
export function parseRedirect(json: { key?: unknown; location?: unknown }): { from: string; to: string } | null {
  if (typeof json.key !== "string" || typeof json.location !== "string") return null;
  for (const kind of ["works", "authors"] as const) {
    const from = bare(json.key, kind);
    const to = bare(json.location, kind);
    if (from && to) return { from, to };
  }
  return null;
}

const EDITION_WORK = /"works": \[\{"key": "\/works\/(OL\d+W)"/;

/** An edition's work, found in the raw line so only candidates' editions are parsed. */
export function editionWorkId(line: string): string | null {
  return line.match(EDITION_WORK)?.[1] ?? null;
}

export type WorkFields = {
  readonly title?: string;
  readonly authorKey?: string;
  readonly cover?: number;
  readonly subjects: readonly string[];
  readonly description?: string;
};

const firstCover = (covers: unknown): number | undefined =>
  Array.isArray(covers) ? covers.find((c): c is number => Number.isInteger(c) && c > 0) : undefined;

export function parseWork(json: Record<string, unknown>): WorkFields {
  const title = typeof json.title === "string" && json.title.trim() ? json.title.trim() : undefined;
  const authors = Array.isArray(json.authors) ? json.authors : [];
  const firstAuthor = authors[0] as { author?: unknown } | undefined;
  const authorRef = firstAuthor?.author;
  const authorKey =
    authorRef && typeof authorRef === "object" && typeof (authorRef as { key?: unknown }).key === "string"
      ? bare((authorRef as { key: string }).key, "authors") ?? undefined
      : undefined;
  const raw = json.description;
  const text = typeof raw === "string" ? raw : raw && typeof raw === "object" ? (raw as { value?: unknown }).value : undefined;
  const description = typeof text === "string" && text.trim() ? text : undefined;
  const subjects = Array.isArray(json.subjects) ? json.subjects.filter((s): s is string => typeof s === "string") : [];
  const cover = firstCover(json.covers);
  return {
    ...(title ? { title } : {}),
    ...(authorKey ? { authorKey } : {}),
    ...(cover !== undefined ? { cover } : {}),
    subjects,
    ...(description ? { description } : {}),
  };
}

export type EditionFields = {
  readonly workId?: string;
  readonly languages: readonly string[];
  readonly pages?: number;
  readonly year?: number;
  readonly isbns: readonly string[];
  readonly cover?: number;
};

export function parseEdition(json: Record<string, unknown>): EditionFields {
  const works = Array.isArray(json.works) ? json.works : [];
  const workKey = (works[0] as { key?: unknown } | undefined)?.key;
  const workId = typeof workKey === "string" ? bare(workKey, "works") ?? undefined : undefined;
  const languages = (Array.isArray(json.languages) ? json.languages : [])
    .map((l) => (l && typeof l === "object" ? (l as { key?: unknown }).key : undefined))
    .filter((k): k is string => typeof k === "string" && k.startsWith("/languages/"))
    .map((k) => k.slice("/languages/".length));
  const pages = Number.isInteger(json.number_of_pages) && (json.number_of_pages as number) > 0 ? (json.number_of_pages as number) : undefined;
  const yearMatch = typeof json.publish_date === "string" ? json.publish_date.match(/(\d{4})/) : null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const cover = firstCover(json.covers);
  return {
    ...(workId ? { workId } : {}),
    languages,
    ...(pages !== undefined ? { pages } : {}),
    ...(yearMatch ? { year: Number(yearMatch[1]) } : {}),
    isbns: [...strings(json.isbn_13), ...strings(json.isbn_10)],
    ...(cover !== undefined ? { cover } : {}),
  };
}

export function parseAuthor(json: Record<string, unknown>): { name?: string; birthYear?: number } {
  const name = typeof json.name === "string" && json.name.trim() ? json.name.trim() : undefined;
  const birthYear = birthYearOf(typeof json.birth_date === "string" ? json.birth_date : undefined);
  return { ...(name ? { name } : {}), ...(birthYear !== undefined ? { birthYear } : {}) };
}

/** How many ISBNs a work keeps: the mapper takes the first of each length. */
const ISBNS_KEPT = 8;

/** One work's editions, reduced as they stream past. */
export class EditionAggregate {
  count = 0;
  readonly languages = new Set<string>();
  readonly pages: number[] = [];
  readonly years = new Set<number>();
  readonly isbns: string[] = [];
  cover: number | undefined;

  add(edition: Omit<EditionFields, "workId">): void {
    this.count++;
    for (const l of edition.languages) this.languages.add(l);
    if (edition.pages !== undefined) this.pages.push(edition.pages);
    if (edition.year !== undefined) this.years.add(edition.year);
    for (const i of edition.isbns) if (this.isbns.length < ISBNS_KEPT && !this.isbns.includes(i)) this.isbns.push(i);
    if (this.cover === undefined && edition.cover !== undefined) this.cover = edition.cover;
  }
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Truncated, as Open Library's index stores the median as an integer.
  return sorted.length % 2 ? sorted[mid]! : Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** The search-API shape of a work, from its record, its editions and its first author's name. */
export function toSearchDoc(
  workId: string,
  work: WorkFields,
  editions: EditionAggregate,
  authorName: string | undefined,
): OLSearchDoc {
  const years = [...editions.years].sort((a, b) => a - b);
  const cover = work.cover ?? editions.cover;
  const pages = median(editions.pages);
  return {
    key: `/works/${workId}`,
    ...(work.title ? { title: work.title } : {}),
    ...(authorName ? { author_name: [authorName] } : {}),
    ...(work.authorKey ? { author_key: [work.authorKey] } : {}),
    edition_count: editions.count,
    ...(cover !== undefined ? { cover_i: cover } : {}),
    language: [...editions.languages],
    ...(pages !== undefined ? { number_of_pages_median: pages } : {}),
    publish_year: years,
    ...(years.length > 0 ? { first_publish_year: years[0] } : {}),
    isbn: [...editions.isbns],
    subject: [...work.subjects],
  };
}
