// Open Library subjects-API work -> @unbnd/schemas BookRecord. ADR 0008.
import type { BookRecord, DListAddress } from "@unbnd/schemas";

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
