// Failing tests for Story 55 (catalog expansion: search-API swap + legitimacy
// gate + ISBN dedup + enrichment), per ADR 0054.
//
// This file pins the contract for the new pure module apps/seeder/src/gate.ts
// (not yet written):
//   - OLSearchDoc          — the search-doc subset the gate reads (a type)
//   - EDITION_MIN = 3       — the single tunable edition constant (ADR §2, OQ-5)
//   - JUNK_TITLE_RE         — the pinned denylist regex (ADR §2)
//   - gateWork(doc, currentYear): boolean  — true iff ALL signals pass
//   - gateReason(doc, currentYear): string | null  — first failing signal name
//
// The gate is pure / I/O-free / deterministic; each signal is exercised with a
// fixture search doc in isolation. The Implementer turns these green. The module
// is loaded via an opaque specifier (see _load.ts) so a not-yet-existing module
// is a clean assertion-level red ("module not found"), not a tsc compile wall.
import { describe, expect, it } from "vitest";
import { loadSeederModule } from "./_load";

// The search-doc shape the gate reads (ADR §2). Mirrored here so the test file
// typechecks against the contract while gate.ts is still missing.
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

type GateModule = {
  EDITION_MIN: number;
  JUNK_TITLE_RE: RegExp;
  gateWork: (doc: OLSearchDoc, currentYear: number) => boolean;
  gateReason: (doc: OLSearchDoc, currentYear: number) => string | null;
};

const load = () => loadSeederModule<GateModule>("gate");

// A deterministic "now" for the year signal so tests do not depend on the wall
// clock. The gate takes `currentYear` as an injected parameter (ADR §2).
const CURRENT_YEAR = 2026;

// A fully-valid search doc that passes EVERY signal. Each DROP test below is a
// single-field mutation of this fixture, so exactly one signal is under test.
const validDoc: OLSearchDoc = {
  key: "/works/OL45804W",
  title: "The Great Gatsby",
  author_name: ["F. Scott Fitzgerald"],
  edition_count: 42,
  cover_i: 1234,
  first_publish_year: 1925,
  language: ["eng"],
  number_of_pages_median: 180,
  isbn: ["9780743273565", "0743273567"],
  subject: ["fiction", "classic"],
};

describe("EDITION_MIN constant (the single tunable, ADR OQ-5)", () => {
  it("defaults to 3", async () => {
    const { EDITION_MIN } = await load();
    expect(EDITION_MIN).toBe(3);
  });
});

describe("gateWork — the all-pass case", () => {
  it("passes a fully valid search doc (returns true, no reason)", async () => {
    const { gateWork, gateReason } = await load();
    expect(gateWork(validDoc, CURRENT_YEAR)).toBe(true);
    expect(gateReason(validDoc, CURRENT_YEAR)).toBeNull();
  });
});

describe("gateWork — title signal", () => {
  it("drops a doc with no title", async () => {
    const { gateWork, gateReason } = await load();
    const doc = { ...validDoc, title: undefined };
    expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
    expect(gateReason(doc, CURRENT_YEAR)).toBe("title");
  });

  it("drops a doc with a whitespace-only title", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, title: "   " }, CURRENT_YEAR)).toBe(false);
  });
});

describe("gateWork — author signal", () => {
  it("drops a doc with no first author", async () => {
    const { gateWork, gateReason } = await load();
    const doc = { ...validDoc, author_name: undefined };
    expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
    expect(gateReason(doc, CURRENT_YEAR)).toBe("author");
  });

  it("drops a doc with an empty author array", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, author_name: [] }, CURRENT_YEAR)).toBe(false);
  });
});

describe("gateWork — cover signal", () => {
  it("drops a doc with no cover_i", async () => {
    const { gateWork, gateReason } = await load();
    const doc = { ...validDoc, cover_i: undefined };
    expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
    expect(gateReason(doc, CURRENT_YEAR)).toBe("cover");
  });

  it("drops a doc with a null cover_i", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, cover_i: null }, CURRENT_YEAR)).toBe(false);
  });
});

describe("gateWork — language signal", () => {
  it("drops a doc whose language does not include eng", async () => {
    const { gateWork, gateReason } = await load();
    const doc = { ...validDoc, language: ["fre", "ger"] };
    expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
    expect(gateReason(doc, CURRENT_YEAR)).toBe("language");
  });

  it("drops a doc with absent language (no eng)", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, language: undefined }, CURRENT_YEAR)).toBe(false);
  });

  it("passes a doc whose language includes eng among others", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, language: ["fre", "eng"] }, CURRENT_YEAR)).toBe(true);
  });
});

describe("gateWork — edition signal (EDITION_MIN boundary)", () => {
  it("drops a doc with edition_count of 2", async () => {
    const { gateWork, gateReason } = await load();
    const doc = { ...validDoc, edition_count: 2 };
    expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
    expect(gateReason(doc, CURRENT_YEAR)).toBe("editions");
  });

  it("passes a doc with edition_count of 3 (the floor)", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, edition_count: 3 }, CURRENT_YEAR)).toBe(true);
  });

  it("drops a doc with absent edition_count (treated as 0)", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, edition_count: undefined }, CURRENT_YEAR)).toBe(false);
  });
});

describe("gateWork — pages signal (absent passes; <50 drops)", () => {
  it("drops a doc whose number_of_pages_median is 30 (below 50)", async () => {
    const { gateWork, gateReason } = await load();
    const doc = { ...validDoc, number_of_pages_median: 30 };
    expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
    expect(gateReason(doc, CURRENT_YEAR)).toBe("pages");
  });

  it("passes a doc with absent number_of_pages_median (absence does not drop)", async () => {
    const { gateWork } = await load();
    expect(
      gateWork({ ...validDoc, number_of_pages_median: undefined }, CURRENT_YEAR),
    ).toBe(true);
  });

  it("passes a doc with number_of_pages_median of 50 (the floor)", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, number_of_pages_median: 50 }, CURRENT_YEAR)).toBe(true);
  });
});

describe("gateWork — year signal (1800..currentYear inclusive)", () => {
  it("drops a doc with absent first_publish_year", async () => {
    const { gateWork, gateReason } = await load();
    const doc = { ...validDoc, first_publish_year: undefined };
    expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
    expect(gateReason(doc, CURRENT_YEAR)).toBe("year");
  });

  it("drops a doc published before 1800 (1799)", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, first_publish_year: 1799 }, CURRENT_YEAR)).toBe(false);
  });

  it("drops a doc published after the current year (currentYear + 1)", async () => {
    const { gateWork } = await load();
    expect(
      gateWork({ ...validDoc, first_publish_year: CURRENT_YEAR + 1 }, CURRENT_YEAR),
    ).toBe(false);
  });

  it("passes the lower bound year 1800", async () => {
    const { gateWork } = await load();
    expect(gateWork({ ...validDoc, first_publish_year: 1800 }, CURRENT_YEAR)).toBe(true);
  });

  it("passes the upper bound year (currentYear)", async () => {
    const { gateWork } = await load();
    expect(
      gateWork({ ...validDoc, first_publish_year: CURRENT_YEAR }, CURRENT_YEAR),
    ).toBe(true);
  });
});

describe("gateWork — denylist signal (JUNK_TITLE_RE)", () => {
  // The junk classes the probe surfaced (ADR §2). Each must be dropped with
  // gateReason "denylist".
  const dropped = [
    "Summary of Dune",
    "The Hobbit Study Guide",
    "Pride and Prejudice Workbook",
    "SparkNotes on Hamlet",
    "CliffsNotes on Macbeth",
    "Cliffs Notes on Beowulf",
    "The Foundation omnibus",
    "Dune Boxed Set",
  ];

  for (const title of dropped) {
    it(`drops the junk title: ${title}`, async () => {
      const { gateWork, gateReason } = await load();
      const doc = { ...validDoc, title };
      expect(gateWork(doc, CURRENT_YEAR)).toBe(false);
      expect(gateReason(doc, CURRENT_YEAR)).toBe("denylist");
    });
  }

  // The documented false-positive guards (ADR §2): legit titles where the word
  // is not at a segment boundary or is a different word — these must NOT be
  // dropped by the denylist.
  const kept = [
    "A Study in Scarlet",   // "study" but not "study guide"
    "Notes from Underground", // "notes" but not "cliffs notes"
    "Summary",               // bare "Summary", not "summary of"
  ];

  for (const title of kept) {
    it(`does NOT drop the legit title (denylist false-positive guard): ${title}`, async () => {
      const { gateWork, gateReason } = await load();
      const doc = { ...validDoc, title };
      // It must pass the denylist signal specifically (other signals are valid
      // in the fixture, so the whole gate passes).
      expect(gateReason(doc, CURRENT_YEAR)).not.toBe("denylist");
      expect(gateWork(doc, CURRENT_YEAR)).toBe(true);
    });
  }

  it("JUNK_TITLE_RE is a case-insensitive regex (carries the i flag)", async () => {
    const { JUNK_TITLE_RE } = await load();
    expect(JUNK_TITLE_RE.flags).toContain("i");
  });
});

describe("gateWork — purity / determinism", () => {
  it("returns the same result for the same input across calls", async () => {
    const { gateWork } = await load();
    const a = gateWork(validDoc, CURRENT_YEAR);
    const b = gateWork(validDoc, CURRENT_YEAR);
    expect(a).toBe(b);
    expect(a).toBe(true);
  });

  it("does not mutate the input doc", async () => {
    const { gateWork } = await load();
    const doc = { ...validDoc, isbn: [...validDoc.isbn!] };
    const snapshot = JSON.stringify(doc);
    gateWork(doc, CURRENT_YEAR);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it("uses the injected currentYear, not the wall clock (a future doc passes against a future year)", async () => {
    const { gateWork } = await load();
    // first_publish_year 2200 would fail against 2026 but passes when the
    // injected currentYear is 2200 — proving the year is a parameter, not read
    // from Date inside the pure function.
    const doc = { ...validDoc, first_publish_year: 2200 };
    expect(gateWork(doc, 2026)).toBe(false);
    expect(gateWork(doc, 2200)).toBe(true);
  });
});
