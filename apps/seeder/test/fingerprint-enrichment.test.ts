// Failing tests for Story 55 (catalog expansion), per ADR 0054 §4
// "Fingerprint refinement (for the enrichment fields)".
//
// The existing fingerprint() (ADR 0051) hashes title|authorName|blurb|coverUrl|
// publishYear|subjects. Story 55 extends the canonical input to ALSO include
// isbn13, language, and pageCount, so that a future same-epoch re-run
// re-publishes a record whose enrichment fields changed (e.g. an ISBN was
// added). This keeps the delta-aware checkpoint honest for the new fields.
//
// fingerprint.ts already exists and is statically importable — the red here is
// at the ASSERTION level: today two records that differ only in isbn13 (or
// language / pageCount) produce the SAME fingerprint, so the "DIFFERENT
// fingerprint" expectations fail until the canonical string is extended. We
// load via the opaque loader to match the rest of the Story 55 set and to read
// the field through the (extended) FingerprintInput without a tsc wall.
import { describe, expect, it } from "vitest";
import { loadSeederModule } from "./_load";

type FpModule = { fingerprint: (record: Record<string, unknown>) => string };
const load = () => loadSeederModule<FpModule>("fingerprint");

const base = {
  title: "The Great Gatsby",
  authorName: "F. Scott Fitzgerald",
  blurb: "A novel of the Jazz Age.",
  coverUrl: "https://covers.openlibrary.org/b/id/1234-L.jpg",
  publishYear: 1925,
  subjects: ["fiction", "classic"],
  isbn13: "9780743273565",
  language: "eng",
  pageCount: 180,
};

describe("fingerprint — stable for identical enriched content", () => {
  it("yields the same fingerprint for two identical enriched records", async () => {
    const { fingerprint } = await load();
    expect(fingerprint({ ...base })).toBe(fingerprint({ ...base }));
  });
});

describe("fingerprint — sensitive to the new enrichment fields", () => {
  it("changes when isbn13 changes (so a newly-ISBN'd record re-publishes)", async () => {
    const { fingerprint } = await load();
    const a = fingerprint({ ...base, isbn13: undefined });
    const b = fingerprint({ ...base, isbn13: "9780743273565" });
    expect(b).not.toBe(a);
  });

  it("changes when language changes", async () => {
    const { fingerprint } = await load();
    const a = fingerprint({ ...base, language: undefined });
    const b = fingerprint({ ...base, language: "eng" });
    expect(b).not.toBe(a);
  });

  it("changes when pageCount changes", async () => {
    const { fingerprint } = await load();
    const a = fingerprint({ ...base, pageCount: undefined });
    const b = fingerprint({ ...base, pageCount: 180 });
    expect(b).not.toBe(a);
  });
});
