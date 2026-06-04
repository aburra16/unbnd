// Open Library work -> @unbnd/schemas BookRecord. ADR 0008 (subjects API) +
// ADR 0054 (search API with inline enrichment signals).
import type { BookRecord, DListAddress } from "@unbnd/schemas";
import type { OLSearchDoc } from "./gate";

/** The subset of an Open Library subjects-API work entry we consume. */
export type OLWork = {
  readonly key: string; // "/works/OL45804W"
  readonly title?: string;
  readonly authors?: ReadonlyArray<{ readonly name?: string; readonly key?: string }>;
  readonly first_publish_year?: number;
  readonly cover_id?: number | null;
  readonly subject?: readonly string[];
};

/** Bare Open Library work id, e.g. `/works/OL45804W` -> `OL45804W`. */
function workId(workKey: string): string {
  return workKey.replace(/^\/?works\//, "").trim();
}

/**
 * Deterministic, idempotent slug (= the kind-39999 d-tag) from an Open
 * Library work key. `/works/OL45804W` and `OL45804W` -> `ol-ol45804w`.
 */
export function deriveSlug(workKey: string): string {
  return `ol-${workId(workKey).toLowerCase()}`;
}

/**
 * Map a work to a BookRecord, or null if it lacks a title/first-author.
 * `source` is "openlibrary", `format` "reference"; optional fields are
 * filled when present (publishYear, openLibraryId, coverUrl, subjects).
 */
export function mapWorkToBookRecord(
  work: OLWork,
  parentHeader: DListAddress<39998>,
): BookRecord | null {
  const title = work.title?.trim();
  const authorName = work.authors?.[0]?.name?.trim();
  if (!title || !authorName) return null;

  const record: BookRecord = {
    slug: deriveSlug(work.key),
    title,
    authorName,
    openLibraryId: workId(work.key),
    ...(work.cover_id
      ? { coverUrl: `https://covers.openlibrary.org/b/id/${work.cover_id}-L.jpg` }
      : {}),
    ...(typeof work.first_publish_year === "number"
      ? { publishYear: work.first_publish_year }
      : {}),
    ...(work.subject && work.subject.length
      ? { subjects: [...work.subject] }
      : {}),
    format: "reference",
    source: "openlibrary",
    parentHeader,
  };
  return record;
}

const ISBN13_RE = /^(?:978|979)\d{10}$/;
const ISBN10_RE = /^\d{9}[\dXx]$/;

/** First valid 13-digit ISBN (978/979 prefix) in the array, or undefined. */
function selectIsbn13(isbn?: readonly string[]): string | undefined {
  return isbn?.find((v) => ISBN13_RE.test(v));
}

/** First valid 10-char ISBN (last may be X), uppercased, or undefined. */
function selectIsbn10(isbn?: readonly string[]): string | undefined {
  const hit = isbn?.find((v) => ISBN10_RE.test(v));
  return hit?.toUpperCase();
}

/**
 * Map an Open Library *search* doc to a BookRecord, or null if it lacks a
 * title/first-author. In addition to the base fields (title, author, cover,
 * openLibraryId, publishYear, subjects) this populates the enrichment fields
 * the search API supplies inline: `isbn13` (first 978/979 13-digit entry),
 * `isbn10` (first 10-char entry, uppercased), `pageCount`
 * (`number_of_pages_median`), and `language` normalized to the `eng` scalar
 * (the gate guarantees `eng` is present). The slug stays deterministic from the
 * work key so a re-seed replaces the record in place. Pure / synchronous.
 */
export function mapSearchDocToBookRecord(
  doc: OLSearchDoc,
  parentHeader: DListAddress<39998>,
): BookRecord | null {
  const title = doc.title?.trim();
  const authorName = doc.author_name?.[0]?.trim();
  if (!title || !authorName || !doc.key) return null;

  const isbn13 = selectIsbn13(doc.isbn);
  const isbn10 = selectIsbn10(doc.isbn);

  const record: BookRecord = {
    slug: deriveSlug(doc.key),
    title,
    authorName,
    openLibraryId: workId(doc.key),
    ...(typeof doc.cover_i === "number"
      ? { coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` }
      : {}),
    ...(typeof doc.first_publish_year === "number"
      ? { publishYear: doc.first_publish_year }
      : {}),
    ...(doc.subject && doc.subject.length ? { subjects: [...doc.subject] } : {}),
    ...(isbn13 ? { isbn13 } : {}),
    ...(isbn10 ? { isbn10 } : {}),
    ...(typeof doc.number_of_pages_median === "number"
      ? { pageCount: doc.number_of_pages_median }
      : {}),
    language: "eng",
    format: "reference",
    source: "openlibrary",
    parentHeader,
  };
  return record;
}
