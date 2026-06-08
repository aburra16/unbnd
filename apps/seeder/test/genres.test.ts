// Story 75 / ADR 0073 — the subjects → genres derivation + the recast assertion
// builder. PURE; no relay/fetch. FAILING until apps/seeder/src/genres.ts is
// implemented (it currently stubs both to []).
import { describe, expect, it } from "vitest";
import { asHexPubkey } from "@unbnd/schemas";
import { subjectsToGenres, buildRecastAssertions } from "../src/genres";

const LIB = asHexPubkey("1".repeat(63) + "a");

describe("subjectsToGenres — derivation from preserved OL subjects", () => {
  it("maps each new genre's signature subjects", () => {
    expect(subjectsToGenres(["Horror tales"])).toContain("horror");
    expect(subjectsToGenres(["Poetry"])).toContain("poetry");
    expect(subjectsToGenres(["Young adult fiction"])).toContain("young-adult");
    expect(subjectsToGenres(["Juvenile fiction"])).toContain("young-adult");
    expect(subjectsToGenres(["Comic books, strips, etc."])).toContain("graphic-novels");
    expect(subjectsToGenres(["Graphic novels"])).toContain("graphic-novels");
    expect(subjectsToGenres(["Philosophy"])).toContain("philosophy");
    expect(subjectsToGenres(["Self-help techniques"])).toContain("self-help");
    expect(subjectsToGenres(["Memoir"])).toContain("memoir");
    expect(subjectsToGenres(["Autobiography"])).toContain("memoir");
  });

  it("maps the existing genres too", () => {
    expect(subjectsToGenres(["Detective and mystery stories"])).toContain("mystery");
    expect(subjectsToGenres(["Romance fiction"])).toContain("romance");
    expect(subjectsToGenres(["Fantasy fiction"])).toContain("fantasy");
  });

  it("is case-insensitive", () => {
    expect(subjectsToGenres(["HORROR"])).toContain("horror");
  });

  it("disambiguates 'science fiction' (not science, not literary-fiction)", () => {
    const g = subjectsToGenres(["Science fiction"]);
    expect(g).toContain("science-fiction");
    expect(g).not.toContain("science");
    expect(g).not.toContain("literary-fiction");
  });

  it("maps non-fiction science subjects to science", () => {
    expect(subjectsToGenres(["Physics"])).toContain("science");
    expect(subjectsToGenres(["Science"])).toContain("science");
  });

  it("treats literary-fiction as a fiction FALLBACK", () => {
    // Plain fiction with no more-specific narrative genre → literary-fiction.
    expect(subjectsToGenres(["Fiction"])).toEqual(["literary-fiction"]);
    // But a specific narrative genre suppresses the fallback.
    const g = subjectsToGenres(["Fiction", "Fantasy"]);
    expect(g).toContain("fantasy");
    expect(g).not.toContain("literary-fiction");
  });

  it("supports multi-genre and returns [] when nothing matches", () => {
    const g = subjectsToGenres(["Fantasy fiction", "Romance"]);
    expect(g).toEqual(expect.arrayContaining(["fantasy", "romance"]));
    expect(subjectsToGenres(["Cooking", "Gardening"])).toEqual([]);
    expect(subjectsToGenres([])).toEqual([]);
  });
});

describe("buildRecastAssertions — librarian genre assertions for one record", () => {
  it("builds one librarian, polarity-1 genre assertion per derived genre", () => {
    const out = buildRecastAssertions(
      { slug: "the-shining", subjects: ["Horror tales", "Fiction"] },
      LIB,
    );
    const genres = out.map((a) => a.tagSlug).sort();
    expect(genres).toContain("horror");
    for (const a of out) {
      expect(a.bookSlug).toBe("the-shining");
      expect(a.tagType).toBe("genre");
      expect(a.polarity).toBe(1);
      expect(a.asserterPubkey).toBe(LIB);
      expect(a.bookAddress).toMatchObject({ kind: 39999, pubkey: LIB, dTag: "the-shining" });
    }
  });

  it("is deterministic (idempotent): same record → same genres", () => {
    const rec = { slug: "dune", subjects: ["Science fiction"] };
    const a = buildRecastAssertions(rec, LIB).map((x) => x.tagSlug).sort();
    const b = buildRecastAssertions(rec, LIB).map((x) => x.tagSlug).sort();
    expect(a).toEqual(b);
    expect(a).toContain("science-fiction");
  });

  it("produces no assertions for a record whose subjects match no genre", () => {
    expect(buildRecastAssertions({ slug: "cookbook", subjects: ["Cooking"] }, LIB)).toEqual([]);
    expect(buildRecastAssertions({ slug: "x" }, LIB)).toEqual([]);
  });
});
