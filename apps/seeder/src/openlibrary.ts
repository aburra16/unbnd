// Open Library subjects-API work -> @unbnd/schemas BookRecord. ADR 0008.
// IMPLEMENTATION PENDING — stubs throw so the suite fails for the right reason.
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

/**
 * Deterministic, idempotent slug (= the kind-39999 d-tag) from an Open
 * Library work key. `/works/OL45804W` and `OL45804W` → `ol-ol45804w`.
 */
export function deriveSlug(_workKey: string): string {
  throw new Error("deriveSlug not implemented");
}

/**
 * Map a work to a BookRecord, or null if it lacks a title/author. `source`
 * is "openlibrary", `format` "reference"; optional fields are filled when
 * present (publishYear, openLibraryId, coverUrl, subjects).
 */
export function mapWorkToBookRecord(
  _work: OLWork,
  _parentHeader: DListAddress<39998>,
): BookRecord | null {
  throw new Error("mapWorkToBookRecord not implemented");
}
