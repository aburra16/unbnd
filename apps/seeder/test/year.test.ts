// Failing tests for Story 104 (catalog year correction), per ADR 0092 §1–2:
// the year rule. A stored year below the floor (printing, or the author's
// birth + MIN_AUTHOR_AGE) and with no other edition close behind it is
// replaced by the earliest edition year at or above the floor. Edition years
// in these cases are Open Library's own (search `publish_year`, 2026-10-20).
//
// The module does not exist yet; loaded via the opaque specifier (_load.ts) so
// the missing module is an assertion-level red, not a tsc compile wall.
import { describe, expect, it } from "vitest";
import { loadSeederModule } from "./_load";

type YearVerdict =
  | { readonly kind: "credible" }
  | { readonly kind: "corrected"; readonly year: number }
  | { readonly kind: "kept"; readonly floor: number }
  | { readonly kind: "unresolved"; readonly floor: number };

type YearModule = {
  MIN_AUTHOR_AGE: number;
  EDITION_COMPANY_YEARS: number;
  birthYearOf: (date?: string) => number | undefined;
  yearFloor: (authorBirthYear?: number) => number;
  judgeYear: (
    input: {
      readonly year: number;
      readonly editionYears: readonly number[];
      readonly authorBirthYear?: number;
    },
    currentYear: number,
  ) => YearVerdict;
  authorBirthFor: (
    recordAuthor: string,
    author?: { readonly name?: string; readonly birthYear?: number },
  ) => number | undefined;
};

const load = () => loadSeederModule<YearModule>("year");
const NOW = 2026;

describe("the rule's constants (ADR 0092 §1)", () => {
  it("nominates a year before the author turned 20, and counts company within 10 years", async () => {
    const m = await load();
    expect(m.MIN_AUTHOR_AGE).toBe(20);
    expect(m.EDITION_COMPANY_YEARS).toBe(10);
  });
});

describe("birthYearOf — Open Library's free-text birth_date", () => {
  it.each([
    ["21 September 1866", 1866],
    ["ca. 1775", 1775],
    ["1265", 1265],
    ["May 1947", 1947],
  ])("reads %s as %i", async (text, year) => {
    const { birthYearOf } = await load();
    expect(birthYearOf(text)).toBe(year);
  });

  it.each([["384 BC"], ["c. 70 B.C."], ["unknown"], [""]])(
    "reads %s as no year",
    async (text) => {
      const { birthYearOf } = await load();
      expect(birthYearOf(text)).toBeUndefined();
    },
  );

  it("reads a missing date as no year", async () => {
    const { birthYearOf } = await load();
    expect(birthYearOf(undefined)).toBeUndefined();
  });
});

describe("yearFloor", () => {
  it("is the start of printing when the author's birth is unknown", async () => {
    const { yearFloor } = await load();
    expect(yearFloor(undefined)).toBe(1450);
  });

  it("is the author's birth year plus 20 when that is later", async () => {
    const { yearFloor } = await load();
    expect(yearFloor(1947)).toBe(1967);
  });

  it("stays at the start of printing for an author born long before it", async () => {
    const { yearFloor } = await load();
    expect(yearFloor(1343)).toBe(1450); // Chaucer
  });
});

describe("judgeYear — impossible and alone: corrected (AC 1)", () => {
  it("Step on a Crack 1658 becomes 2007 (James Patterson, born 1947)", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear(
        { year: 1658, editionYears: [1658, 1947, 2007, 2008, 2011], authorBirthYear: 1947 },
        NOW,
      ),
    ).toEqual({ kind: "corrected", year: 2007 });
  });

  it("The Lake House 1662 becomes 2003", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear(
        { year: 1662, editionYears: [1662, 2003, 2004, 2005], authorBirthYear: 1947 },
        NOW,
      ),
    ).toEqual({ kind: "corrected", year: 2003 });
  });

  it("The War of the Worlds 0 becomes 1898", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear(
        { year: 0, editionYears: [0, 1898, 1906, 1912], authorBirthYear: 1866 },
        NOW,
      ),
    ).toEqual({ kind: "corrected", year: 1898 });
  });

  it("Two Years Before the Mast 1000 becomes 1840", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear(
        { year: 1000, editionYears: [1000, 1840, 1841, 1842], authorBirthYear: 1815 },
        NOW,
      ),
    ).toEqual({ kind: "corrected", year: 1840 });
  });

  it("a year before printing is corrected even with no known author birth", async () => {
    const { judgeYear } = await load();
    expect(judgeYear({ year: 0, editionYears: [0, 1898, 1906] }, NOW)).toEqual({
      kind: "corrected",
      year: 1898,
    });
  });

  it("an 1800 placeholder becomes the first edition year after the author turned 20", async () => {
    const { judgeYear } = await load();
    // Persuasion: Jane Austen born 1775, stored 1789, editions 1789, 1818, 1821.
    expect(
      judgeYear({ year: 1789, editionYears: [1789, 1818, 1821, 1892], authorBirthYear: 1775 }, NOW),
    ).toEqual({ kind: "corrected", year: 1818 });
  });

  it("skips edition years below the floor when choosing the replacement", async () => {
    const { judgeYear } = await load();
    // Step on a Crack also has a stray 1947 edition (the author's birth year).
    const v = judgeYear(
      { year: 1658, editionYears: [1658, 1947, 2007], authorBirthYear: 1947 },
      NOW,
    );
    expect(v).toEqual({ kind: "corrected", year: 2007 });
  });

  it("never picks an edition year after the current year", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear({ year: 1658, editionYears: [1658, 2030], authorBirthYear: 1947 }, NOW),
    ).toEqual({ kind: "unresolved", floor: 1967 });
  });
});

describe("judgeYear — possible: credible, never changed (AC 2)", () => {
  it.each([
    ["Gulliver's Travels", 1726, [1726, 1727, 1730], 1667],
    ["Hamlet", 1603, [1603, 1604, 1605, 1611], 1564],
    ["The Canterbury Tales", 1478, [1478, 1737, 1740], 1343],
  ] as const)("%s stays %i", async (_title, year, editionYears, authorBirthYear) => {
    const { judgeYear } = await load();
    expect(judgeYear({ year, editionYears, authorBirthYear }, NOW)).toEqual({ kind: "credible" });
  });

  it("Homer's Odyssey (1488, no known birth) stays 1488", async () => {
    const { judgeYear } = await load();
    expect(judgeYear({ year: 1488, editionYears: [1488, 1535, 1538] }, NOW)).toEqual({
      kind: "credible",
    });
  });

  it("a year exactly at the floor is credible", async () => {
    const { judgeYear } = await load();
    expect(judgeYear({ year: 1967, editionYears: [1967], authorBirthYear: 1947 }, NOW)).toEqual({
      kind: "credible",
    });
    expect(judgeYear({ year: 1450, editionYears: [1450] }, NOW)).toEqual({ kind: "credible" });
  });

  it("a credible year needs no edition evidence at all", async () => {
    const { judgeYear } = await load();
    expect(judgeYear({ year: 2001, editionYears: [] }, NOW)).toEqual({ kind: "credible" });
  });
});

describe("judgeYear — impossible but with company: kept (AC 3)", () => {
  it("Emma Darcy's Jack's Baby stays 1996 (recorded birth 1983, reprinted 1997)", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear({ year: 1996, editionYears: [1996, 1997, 2011, 2012], authorBirthYear: 1983 }, NOW),
    ).toEqual({ kind: "kept", floor: 2003 });
  });

  it("The Outsiders stays 1967 (S. E. Hinton, born 1948)", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear({ year: 1967, editionYears: [1967, 1968, 1971], authorBirthYear: 1948 }, NOW),
    ).toEqual({ kind: "kept", floor: 1968 });
  });

  it("an edition 9 years later is company; 10 years later is not", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear({ year: 1950, editionYears: [1950, 1959, 1990], authorBirthYear: 1947 }, NOW),
    ).toEqual({ kind: "kept", floor: 1967 });
    expect(
      judgeYear({ year: 1950, editionYears: [1950, 1960, 1990], authorBirthYear: 1947 }, NOW),
    ).toEqual({ kind: "corrected", year: 1990 });
  });

  it("company may itself be below the floor (Little Dorrit's 1800 and 1802 stay)", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear({ year: 1800, editionYears: [1800, 1802, 1850, 1855], authorBirthYear: 1812 }, NOW),
    ).toEqual({ kind: "kept", floor: 1832 });
  });

  it("the stored year's own duplicate is not company", async () => {
    const { judgeYear } = await load();
    expect(
      judgeYear({ year: 1658, editionYears: [1658, 1658, 2007], authorBirthYear: 1947 }, NOW),
    ).toEqual({ kind: "corrected", year: 2007 });
  });
});

describe("judgeYear — impossible with nothing to replace it: unresolved (AC 4)", () => {
  it("Old Yeller 1920 with no edition years (Fred Gipson, born 1908)", async () => {
    const { judgeYear } = await load();
    expect(judgeYear({ year: 1920, editionYears: [], authorBirthYear: 1908 }, NOW)).toEqual({
      kind: "unresolved",
      floor: 1928,
    });
  });
});

describe("authorBirthFor — evidence must name the record's author (ADR 0092 §2)", () => {
  it("uses the birth year when the author record's name is the record's author", async () => {
    const { authorBirthFor } = await load();
    expect(authorBirthFor("James Patterson", { name: "James Patterson", birthYear: 1947 })).toBe(
      1947,
    );
  });

  it("ignores surrounding whitespace", async () => {
    const { authorBirthFor } = await load();
    expect(authorBirthFor("H. G. Wells", { name: " H. G. Wells ", birthYear: 1866 })).toBe(1866);
  });

  it("ignores the birth year when Open Library now names someone else (Homer re-spelled)", async () => {
    const { authorBirthFor } = await load();
    expect(authorBirthFor("Όμηρος", { name: "Ὅμηρος", birthYear: 1900 })).toBeUndefined();
  });

  it("gives none without an author record or a birth year", async () => {
    const { authorBirthFor } = await load();
    expect(authorBirthFor("Homer", undefined)).toBeUndefined();
    expect(authorBirthFor("Homer", { name: "Homer" })).toBeUndefined();
  });
});
