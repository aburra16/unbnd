// The legitimacy gate (Story 55 / ADR 0054 §2). A pure, deterministic, I/O-free
// function over an Open Library search-doc subset. A work is kept iff it passes
// EVERY signal; otherwise it is dropped. `gateReason` names the first failing
// signal for diagnostics and tests. Readership is a sort upstream, never a gate
// input, so no popularity field is read here.

/** The subset of an Open Library search-API doc the gate reads. */
export type OLSearchDoc = {
  readonly key?: string;
  readonly title?: string;
  readonly author_name?: readonly string[];
  readonly edition_count?: number;
  readonly cover_i?: number | null;
  readonly first_publish_year?: number;
  readonly language?: readonly string[];
  readonly number_of_pages_median?: number;
  readonly isbn?: readonly string[];
  readonly subject?: readonly string[];
};

/** The single tunable edition floor (ADR §2 / OQ-5). */
export const EDITION_MIN = 3;

/** The lowest plausible page count for a real book (absence does not drop). */
const PAGE_MIN = 50;

/** The earliest publish year the gate admits. */
const YEAR_MIN = 1800;

/**
 * The junk-title denylist (ADR §2), case-insensitive and segment-anchored: each
 * phrase must begin at the start of the title, or after whitespace / `:` / `(` /
 * `[` / a spaced hyphen, and end at a word boundary. This catches the
 * study-guide / summary-of / workbook / sparknotes / cliffs-notes / omnibus /
 * box-set residue the edition, cover, and year signals miss, while leaving
 * titles where the word is not at a segment boundary (e.g. "A Study in Scarlet",
 * "Notes from Underground", a bare "Summary") untouched.
 */
export const JUNK_TITLE_RE =
  /(?:^|[\s:(\[]|\s-\s)(?:summary of\b|study guide\b|workbook\b|sparknotes\b|cliffs?\s*notes\b|omnibus\b|box\s?set\b|boxed set\b)/i;

/**
 * The first failing signal name, in the ADR's ordered short-circuit sequence,
 * or null when the doc passes every signal. `currentYear` is injected so the
 * function stays pure (no `Date` read inside).
 */
export function gateReason(doc: OLSearchDoc, currentYear: number): string | null {
  if (!doc.title?.trim()) return "title";
  if (!doc.author_name?.[0]?.trim()) return "author";
  if (typeof doc.cover_i !== "number") return "cover";
  if (!doc.language?.includes("eng")) return "language";
  if ((doc.edition_count ?? 0) < EDITION_MIN) return "editions";
  if (typeof doc.number_of_pages_median === "number" && doc.number_of_pages_median < PAGE_MIN) {
    return "pages";
  }
  const year = doc.first_publish_year;
  if (typeof year !== "number" || year < YEAR_MIN || year > currentYear) return "year";
  if (JUNK_TITLE_RE.test(doc.title)) return "denylist";
  return null;
}

/** True iff the work passes EVERY legitimacy signal. */
export function gateWork(doc: OLSearchDoc, currentYear: number): boolean {
  return gateReason(doc, currentYear) === null;
}
