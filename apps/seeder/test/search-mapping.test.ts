// Failing tests for Story 55 (catalog expansion), per ADR 0054 §3.
//
// Pins the search-doc -> BookRecord mapping + enrichment that extends
// apps/seeder/src/openlibrary.ts. The ADR names the search-doc mapper
// `mapSearchDocToBookRecord` (Implementation notes / Tests surface, §278/§284);
// it maps an OL *search* doc (not a subjects-API work) and now populates the
// already-declared, currently-empty enrichment fields:
//   - isbn13   = first /^(?:978|979)\d{10}$/ entry of doc.isbn (ADR §3)
//   - isbn10   = first /^\d{9}[\dXx]$/ entry, uppercased (absent when none)
//   - pageCount = doc.number_of_pages_median (when a number)
//   - language  = "eng" scalar (normalized; the gate guarantees eng present)
//   - title/author/cover/openLibraryId/publishYear/subjects from the doc shape
// Slug derivation stays stable from the OL work key (re-seeds replace in place).
//
// The NEW export `mapSearchDocToBookRecord` does not exist yet. A static
// `import { mapSearchDocToBookRecord } from "../src/openlibrary"` would be a
// tsc error (TS2305) — a compile wall. So the module is loaded via the opaque
// specifier loader (see _load.ts): the missing export surfaces as an
// assertion-level red, not a type error. The existing `deriveSlug` is also
// pulled through the loader to assert slug stability against the work key.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  fromBookRecordEvent,
  toBookRecordEvent,
  type BookRecord,
  type DListAddress,
} from "@unbnd/schemas";
import { loadSeederModule } from "./_load";

// The search-doc subset (mirrors ADR §2 OLSearchDoc, also accepted by the
// mapper). Defined locally so this file typechecks while the new export is
// missing.
type OLSearchDoc = {
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

type OpenLibraryModule = {
  mapSearchDocToBookRecord: (
    doc: OLSearchDoc,
    parentHeader: DListAddress<39998>,
  ) => BookRecord | null;
  deriveSlug: (workKey: string) => string;
};

const load = () => loadSeederModule<OpenLibraryModule>("openlibrary");

const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");
const HEADER: DListAddress<39998> = buildBookRecordsHeaderAddress(LIBRARIAN);

const doc: OLSearchDoc = {
  key: "/works/OL45804W",
  title: "The Great Gatsby",
  author_name: ["F. Scott Fitzgerald"],
  edition_count: 42,
  cover_i: 1234,
  first_publish_year: 1925,
  language: ["eng"],
  number_of_pages_median: 180,
  // Mixed array: a 13 (979 also valid), a 10, and noise; first valid 13 wins.
  isbn: ["0743273567", "9780743273565", "9780000000000"],
  subject: ["fiction", "classic"],
};

describe("mapSearchDocToBookRecord — base fields (unchanged from the work mapper)", () => {
  it("maps the core fields from the search doc", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord(doc, HEADER);
    expect(r).not.toBeNull();
    expect(r!.title).toBe("The Great Gatsby");
    expect(r!.authorName).toBe("F. Scott Fitzgerald");
    expect(r!.openLibraryId).toBe("OL45804W");
    expect(r!.publishYear).toBe(1925);
    expect(r!.coverUrl).toMatch(/covers\.openlibrary\.org\/b\/id\/1234/);
    expect(r!.subjects).toEqual(["fiction", "classic"]);
    expect(r!.source).toBe("openlibrary");
    expect(r!.format).toBe("reference");
  });

  it("derives the slug stably from the OL work key (so re-seeds replace in place)", async () => {
    const { mapSearchDocToBookRecord, deriveSlug } = await load();
    const r = mapSearchDocToBookRecord(doc, HEADER);
    expect(r!.slug).toBe(deriveSlug("/works/OL45804W"));
    expect(r!.slug).toBe("ol-ol45804w");
  });

  it("returns null when title or first author is missing (existing behavior, kept)", async () => {
    const { mapSearchDocToBookRecord } = await load();
    expect(mapSearchDocToBookRecord({ ...doc, title: undefined }, HEADER)).toBeNull();
    expect(mapSearchDocToBookRecord({ ...doc, author_name: [] }, HEADER)).toBeNull();
  });
});

describe("mapSearchDocToBookRecord — enrichment fields (ADR §3)", () => {
  it("selects isbn13 as the first 978/979-prefixed 13-digit entry", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord(doc, HEADER);
    expect(r!.isbn13).toBe("9780743273565");
  });

  it("selects isbn10 as the first 10-char entry (last digit may be X), uppercased", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord(
      { ...doc, isbn: ["043942089x", "9780743273565"] },
      HEADER,
    );
    expect(r!.isbn10).toBe("043942089X");
  });

  it("leaves isbn13 / isbn10 unset when the isbn array has no valid match", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord({ ...doc, isbn: ["not-an-isbn", "123"] }, HEADER);
    expect(r!.isbn13).toBeUndefined();
    expect(r!.isbn10).toBeUndefined();
  });

  it("leaves isbn fields unset when the isbn array is absent", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord({ ...doc, isbn: undefined }, HEADER);
    expect(r!.isbn13).toBeUndefined();
    expect(r!.isbn10).toBeUndefined();
  });

  it("maps pageCount from number_of_pages_median", async () => {
    const { mapSearchDocToBookRecord } = await load();
    expect(mapSearchDocToBookRecord(doc, HEADER)!.pageCount).toBe(180);
  });

  it("leaves pageCount unset when number_of_pages_median is absent", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord(
      { ...doc, number_of_pages_median: undefined },
      HEADER,
    );
    expect(r!.pageCount).toBeUndefined();
  });

  it("normalizes language to the eng scalar", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord({ ...doc, language: ["fre", "eng"] }, HEADER);
    expect(r!.language).toBe("eng");
  });
});

describe("mapSearchDocToBookRecord — round-trips the enrichment through the schema", () => {
  it("serializes isbn13 / isbn10 / language / pageCount onto the kind-39999 event and back", async () => {
    const { mapSearchDocToBookRecord } = await load();
    const r = mapSearchDocToBookRecord(
      { ...doc, isbn: ["9780743273565", "0743273567"] },
      HEADER,
    )!;
    const back = fromBookRecordEvent(toBookRecordEvent(r));
    expect(back.isbn13).toBe("9780743273565");
    expect(back.isbn10).toBe("0743273567");
    expect(back.pageCount).toBe(180);
    expect(back.language).toBe("eng");
    expect(back.slug).toBe(r.slug);
  });
});
