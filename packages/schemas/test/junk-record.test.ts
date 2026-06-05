// Failing tests for Story 56 (catalog prune via read-time filter), per ADR 0055.
//
// This file pins the contract for the shared junk oracle that ADR 0055 §1 homes
// in `@unbnd/schemas` (packages/schemas/src/BookRecord.ts):
//   - JUNK_TITLE_RE       — the Story-55 denylist, RELOCATED here verbatim and
//                           re-exported by apps/seeder/src/gate.ts (ADR §1: ONE
//                           denylist, not two).
//   - isJunkRecord(book: BookRecord, currentYear: number): boolean
//                           — true iff a STORED record is positively junk; pure,
//                           deterministic, I/O-free; conservative (absence of a
//                           signal is NOT junk).
//
// Both are NEW exports of the EXISTING module ../src/BookRecord, so they are
// loaded through the opaque-specifier loader (_load.ts) — a static import would
// be a tsc TS2305 wall, not a clean assertion-level red. Once the Implementer
// adds the exports, these turn green. The Implementer turns these green; the
// Tester does NOT implement.
import { describe, expect, it } from "vitest";
import type { DListAddress } from "../src/envelope";
import type { BookRecord } from "../src/BookRecord";
import { hex64 } from "./_helpers";
import { loadSchemasModule } from "./_load";

// The oracle + denylist are loaded from the (existing) BookRecord module by name,
// so a missing export surfaces as a readable assertion-level red, not a tsc error.
type JunkModule = {
  JUNK_TITLE_RE: RegExp;
  isJunkRecord: (book: BookRecord, currentYear: number) => boolean;
};
const load = () => loadSchemasModule<JunkModule>("BookRecord");

// A deterministic "now" so the year signal never depends on the wall clock.
// The oracle takes `currentYear` as an injected parameter (ADR 0055 §1).
const CURRENT_YEAR = 2026;

const LIBRARIAN = hex64("1".repeat(63) + "a");
const BOOKS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "books",
};

// A clean, complete, fully-valid stored record that passes EVERY junk signal.
// Each positive-junk test below is a single-field mutation of this fixture, so
// exactly one signal is under test.
const cleanBook: BookRecord = {
  slug: "the-great-gatsby",
  title: "The Great Gatsby",
  authorName: "F. Scott Fitzgerald",
  isbn13: "9780743273565",
  isbn10: "0743273567",
  openLibraryId: "OL468431W",
  coverUrl: "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
  pageCount: 180,
  publishYear: 1925,
  language: "en",
  subjects: ["fiction", "classics"],
  blurb: "Set in the Jazz Age on Long Island.",
  format: "reference",
  purchaseUrl: "https://openlibrary.org/works/OL468431W",
  source: "openlibrary",
  parentHeader: BOOKS_HEADER,
};

describe("isJunkRecord — the all-pass case (a clean, complete record)", () => {
  it("returns false (not junk) for a clean, complete BookRecord", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord(cleanBook, CURRENT_YEAR)).toBe(false);
  });
});

describe("isJunkRecord — title signal (positive junk)", () => {
  it("flags a record with a missing title (empty string)", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord({ ...cleanBook, title: "" }, CURRENT_YEAR)).toBe(true);
  });

  it("flags a record with a whitespace-only title", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord({ ...cleanBook, title: "   " }, CURRENT_YEAR)).toBe(true);
  });
});

describe("isJunkRecord — author signal (positive junk)", () => {
  it("flags a record with a missing authorName (empty string)", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord({ ...cleanBook, authorName: "" }, CURRENT_YEAR)).toBe(true);
  });

  it("flags a record with a whitespace-only authorName", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord({ ...cleanBook, authorName: "  " }, CURRENT_YEAR)).toBe(true);
  });
});

describe("isJunkRecord — cover signal (positive junk)", () => {
  it("flags a record with a missing coverUrl (absent)", async () => {
    const { isJunkRecord } = await load();
    const { coverUrl: _omit, ...noCover } = cleanBook;
    expect(isJunkRecord(noCover as BookRecord, CURRENT_YEAR)).toBe(true);
  });

  it("flags a record with an empty-string coverUrl", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord({ ...cleanBook, coverUrl: "" }, CURRENT_YEAR)).toBe(true);
  });
});

describe("isJunkRecord — denylist title signal (the shared JUNK_TITLE_RE)", () => {
  // The junk classes the Story-55 denylist removes (ADR 0054 §2 / ADR 0055 §1).
  // Each must be flagged as junk when it lands on a stored record's title.
  const junkTitles = [
    "Summary of Dune",
    "The Hobbit Study Guide",
    "Pride and Prejudice Workbook",
    "SparkNotes on Hamlet",
    "CliffsNotes on Macbeth",
    "Cliffs Notes on Beowulf",
    "The Foundation omnibus",
    "Dune Boxed Set",
  ];

  for (const title of junkTitles) {
    it(`flags the junk-denylist title: ${title}`, async () => {
      const { isJunkRecord } = await load();
      expect(isJunkRecord({ ...cleanBook, title }, CURRENT_YEAR)).toBe(true);
    });
  }
});

describe("isJunkRecord — year signal (PRESENT and out of 1800..currentYear)", () => {
  it("flags a record whose publishYear is before 1800 (1799)", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord({ ...cleanBook, publishYear: 1799 }, CURRENT_YEAR)).toBe(true);
  });

  it("flags a record whose publishYear is after the current year (currentYear + 1)", async () => {
    const { isJunkRecord } = await load();
    expect(
      isJunkRecord({ ...cleanBook, publishYear: CURRENT_YEAR + 1 }, CURRENT_YEAR),
    ).toBe(true);
  });

  it("keeps a record at the lower bound year 1800", async () => {
    const { isJunkRecord } = await load();
    expect(isJunkRecord({ ...cleanBook, publishYear: 1800 }, CURRENT_YEAR)).toBe(false);
  });

  it("keeps a record at the upper bound year (currentYear)", async () => {
    const { isJunkRecord } = await load();
    expect(
      isJunkRecord({ ...cleanBook, publishYear: CURRENT_YEAR }, CURRENT_YEAR),
    ).toBe(false);
  });
});

describe("isJunkRecord — conservative: absence is NOT junk (ADR 0055 §1)", () => {
  it("keeps a record with an ABSENT publishYear (an absent year is not positive evidence)", async () => {
    const { isJunkRecord } = await load();
    const { publishYear: _omit, ...noYear } = cleanBook;
    expect(isJunkRecord(noYear as BookRecord, CURRENT_YEAR)).toBe(false);
  });

  it("keeps a record with an absent pageCount", async () => {
    const { isJunkRecord } = await load();
    const { pageCount: _omit, ...noPages } = cleanBook;
    expect(isJunkRecord(noPages as BookRecord, CURRENT_YEAR)).toBe(false);
  });

  it("keeps a record with an absent language", async () => {
    const { isJunkRecord } = await load();
    const { language: _omit, ...noLang } = cleanBook;
    expect(isJunkRecord(noLang as BookRecord, CURRENT_YEAR)).toBe(false);
  });

  it("keeps a record with an absent blurb", async () => {
    const { isJunkRecord } = await load();
    const { blurb: _omit, ...noBlurb } = cleanBook;
    expect(isJunkRecord(noBlurb as BookRecord, CURRENT_YEAR)).toBe(false);
  });

  it("keeps a legacy record lacking pageCount, language, blurb, AND publishYear all at once", async () => {
    const { isJunkRecord } = await load();
    const legacy: BookRecord = {
      slug: "legacy-record",
      title: "A Legitimate Legacy Book",
      authorName: "Some Author",
      coverUrl: "https://covers.openlibrary.org/b/id/123-L.jpg",
      format: "reference",
      source: "openlibrary",
      parentHeader: BOOKS_HEADER,
      // no pageCount, no language, no blurb, no publishYear — predates enrichment
    };
    expect(isJunkRecord(legacy, CURRENT_YEAR)).toBe(false);
  });
});

describe("isJunkRecord — denylist false-positive guards (ADR 0054 §2)", () => {
  // Legit titles where the denylist word is not at a segment boundary or is a
  // different word — these must NOT be flagged (same guard as Story 55).
  const legitTitles = [
    "A Study in Scarlet", // "study" but not "study guide"
    "Notes from Underground", // "notes" but not "cliffs notes"
    "Summary", // bare "Summary", not "summary of"
  ];

  for (const title of legitTitles) {
    it(`does NOT flag the legit title (false-positive guard): ${title}`, async () => {
      const { isJunkRecord } = await load();
      expect(isJunkRecord({ ...cleanBook, title }, CURRENT_YEAR)).toBe(false);
    });
  }
});

describe("isJunkRecord — purity / determinism (no I/O)", () => {
  it("returns the same result for the same input across calls", async () => {
    const { isJunkRecord } = await load();
    const a = isJunkRecord(cleanBook, CURRENT_YEAR);
    const b = isJunkRecord(cleanBook, CURRENT_YEAR);
    expect(a).toBe(b);
    expect(a).toBe(false);
  });

  it("does not mutate the input record", async () => {
    const { isJunkRecord } = await load();
    const book: BookRecord = { ...cleanBook, subjects: [...(cleanBook.subjects ?? [])] };
    const snapshot = JSON.stringify(book);
    isJunkRecord(book, CURRENT_YEAR);
    expect(JSON.stringify(book)).toBe(snapshot);
  });

  it("uses the injected currentYear, not the wall clock (a future record passes against a future year)", async () => {
    const { isJunkRecord } = await load();
    // publishYear 2200 is junk against 2026 but clean against an injected 2200,
    // proving the year is a parameter, not read from Date inside the function.
    const future = { ...cleanBook, publishYear: 2200 };
    expect(isJunkRecord(future, 2026)).toBe(true);
    expect(isJunkRecord(future, 2200)).toBe(false);
  });
});

describe("JUNK_TITLE_RE — relocated to @unbnd/schemas (ADR 0055 §1, ONE denylist)", () => {
  it("is exported from the schemas BookRecord module and is a case-insensitive regex", async () => {
    const { JUNK_TITLE_RE } = await load();
    expect(JUNK_TITLE_RE).toBeInstanceOf(RegExp);
    expect(JUNK_TITLE_RE.flags).toContain("i");
  });

  it("matches a junk-denylist title", async () => {
    const { JUNK_TITLE_RE } = await load();
    expect(JUNK_TITLE_RE.test("Summary of Dune")).toBe(true);
    expect(JUNK_TITLE_RE.test("The Hobbit Study Guide")).toBe(true);
  });

  it("does NOT match a clean title (false-positive guard)", async () => {
    const { JUNK_TITLE_RE } = await load();
    expect(JUNK_TITLE_RE.test("A Study in Scarlet")).toBe(false);
    expect(JUNK_TITLE_RE.test("The Great Gatsby")).toBe(false);
  });
});
