// The catalog year rule (Story 104 / ADR 0093 §1–2). Pure, no I/O.
//
// Open Library's `first_publish_year` is the minimum over a work's editions, so
// one mis-dated edition pulls a work back (Step on a Crack: 1658). A stored year
// is checked against two facts: nothing was printed before PRINT_ERA_START, and
// nobody published a book before they were born. A year that fails is changed
// only when it also stands alone (no other edition within EDITION_COMPANY_YEARS
// after it): Open Library's birth dates are sometimes wrong too, and a real first
// year has reprints right behind it. The replacement is the earliest edition
// year that passes.
import { PRINT_ERA_START } from "@unbnd/schemas";

/** A year before the author turned this old is nominated for correction. */
export const MIN_AUTHOR_AGE = 20;

/** Another edition within this many years after a stored year is its company. */
export const EDITION_COMPANY_YEARS = 10;

export type YearVerdict =
  | { readonly kind: "credible" }
  | { readonly kind: "corrected"; readonly year: number }
  | { readonly kind: "kept"; readonly floor: number }
  | { readonly kind: "unresolved"; readonly floor: number };

export type YearInput = {
  readonly year: number;
  readonly editionYears: readonly number[];
  readonly authorBirthYear?: number;
};

/**
 * The birth year in Open Library's free-text `birth_date` ("21 September 1866",
 * "ca. 1775"): the first three- or four-digit year. None for a BC or BCE date or
 * a date with no year.
 */
export function birthYearOf(date?: string): number | undefined {
  if (!date) return undefined;
  if (/\bB\.?\s?C\.?\s?E?\b/i.test(date)) return undefined; // BC, B.C., BCE, B.C.E.
  const m = date.match(/\b(\d{3,4})\b/);
  return m ? Number(m[1]) : undefined;
}

/** The earliest year a work could carry: printing, or the author at MIN_AUTHOR_AGE. */
export function yearFloor(authorBirthYear?: number): number {
  return authorBirthYear === undefined
    ? PRINT_ERA_START
    : Math.max(PRINT_ERA_START, authorBirthYear + MIN_AUTHOR_AGE);
}

/** Judge a stored year against the work's edition years (ADR 0093 §1). */
export function judgeYear(input: YearInput, currentYear: number): YearVerdict {
  const { year, editionYears } = input;
  const floor = yearFloor(input.authorBirthYear);
  if (year >= floor) return { kind: "credible" };

  const later = editionYears.filter((y) => y > year && y <= currentYear);
  if (later.some((y) => y - year < EDITION_COMPANY_YEARS)) return { kind: "kept", floor };

  const possible = editionYears.filter((y) => y >= floor && y <= currentYear);
  if (possible.length === 0) return { kind: "unresolved", floor };
  return { kind: "corrected", year: Math.min(...possible) };
}

/**
 * The author's birth year, counted only when the Open Library author record
 * names the record's author (ADR 0093 §2): a record never moves on evidence
 * about someone else.
 */
export function authorBirthFor(
  recordAuthor: string,
  author?: { readonly name?: string; readonly birthYear?: number },
): number | undefined {
  if (!author?.name || author.name.trim() !== recordAuthor.trim()) return undefined;
  return author.birthYear;
}
