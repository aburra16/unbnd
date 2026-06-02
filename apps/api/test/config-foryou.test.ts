// Story 36 / ADR 0037 §7 — the four For-You config knobs, following the
// `searchTrustBlend` / `curatorThreshold` convention: optional-in-`Config`,
// `loadConfig` ALWAYS sets them from a default + a validated range, throwing the
// house-style `config: <NAME> must be …; got …` on a bad value.
//
//   FORYOU_MIN_AVG          → foryouMinAvg          default 4.0   finite, in [1,5]
//   FORYOU_MIN_RATINGS      → foryouMinRatings      default 2     integer ≥ 1
//   FORYOU_BOOKS            → foryouBooks           default 12    integer ≥ 1
//   FORYOU_CANDIDATE_RATERS → foryouCandidateRaters default 2000  integer ≥ 1
//
// FAILING until loadConfig parses + validates these four onto Config.
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const ALL_REQUIRED = {
  NEO4J_PASSWORD: "tapestry-local-dev",
  SEARCH_API_KEY: "local-dev-search-key",
  DATABASE_URL: "postgres://unbnd:unbnd@localhost:5432/unbnd",
  BACKUP_ENCRYPTION_KEY: "a".repeat(64),
};

describe("loadConfig — FORYOU_MIN_AVG (ADR 0037)", () => {
  it("defaults to 4.0 (a high, honest 'highly rated' bar on the 1–5 scale)", () => {
    const c = loadConfig({ ...ALL_REQUIRED });
    expect(c.foryouMinAvg).toBe(4.0);
    expect(typeof c.foryouMinAvg).toBe("number");
  });

  it("respects a numeric override", () => {
    expect(loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_AVG: "4.5" }).foryouMinAvg).toBe(4.5);
  });

  it("accepts the scale boundary values 1 and 5", () => {
    expect(loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_AVG: "1" }).foryouMinAvg).toBe(1);
    expect(loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_AVG: "5" }).foryouMinAvg).toBe(5);
  });

  it("throws below 1 (off the rating scale)", () => {
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_AVG: "0.9" })).toThrow(/FORYOU_MIN_AVG/);
  });

  it("throws above 5 (off the rating scale)", () => {
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_AVG: "5.1" })).toThrow(/FORYOU_MIN_AVG/);
  });

  it("throws on a non-numeric value", () => {
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_AVG: "high" })).toThrow(/FORYOU_MIN_AVG/);
  });
});

describe("loadConfig — FORYOU_MIN_RATINGS (ADR 0037)", () => {
  it("defaults to 2 (a lone trusted 5-star never qualifies a book)", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).foryouMinRatings).toBe(2);
  });

  it("respects a positive-integer override", () => {
    const c = loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_RATINGS: "3" });
    expect(c.foryouMinRatings).toBe(3);
    expect(typeof c.foryouMinRatings).toBe("number");
  });

  it("throws on zero / negative / non-integer values", () => {
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_RATINGS: "0" })).toThrow(/FORYOU_MIN_RATINGS/);
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_RATINGS: "-1" })).toThrow(/FORYOU_MIN_RATINGS/);
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_RATINGS: "2.5" })).toThrow(/FORYOU_MIN_RATINGS/);
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_MIN_RATINGS: "lots" })).toThrow(/FORYOU_MIN_RATINGS/);
  });
});

describe("loadConfig — FORYOU_BOOKS (ADR 0037)", () => {
  it("defaults to 12 (one Shelf row)", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).foryouBooks).toBe(12);
  });

  it("respects a positive-integer override", () => {
    expect(loadConfig({ ...ALL_REQUIRED, FORYOU_BOOKS: "6" }).foryouBooks).toBe(6);
  });

  it("throws on zero / negative / non-integer values", () => {
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_BOOKS: "0" })).toThrow(/FORYOU_BOOKS/);
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_BOOKS: "-4" })).toThrow(/FORYOU_BOOKS/);
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_BOOKS: "12.5" })).toThrow(/FORYOU_BOOKS/);
  });
});

describe("loadConfig — FORYOU_CANDIDATE_RATERS (ADR 0037)", () => {
  it("defaults to 2000 (bounds the single batched weights array on a dense graph)", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).foryouCandidateRaters).toBe(2000);
  });

  it("respects a positive-integer override", () => {
    expect(loadConfig({ ...ALL_REQUIRED, FORYOU_CANDIDATE_RATERS: "500" }).foryouCandidateRaters).toBe(500);
  });

  it("throws on zero / negative / non-integer values", () => {
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_CANDIDATE_RATERS: "0" })).toThrow(/FORYOU_CANDIDATE_RATERS/);
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_CANDIDATE_RATERS: "-1" })).toThrow(/FORYOU_CANDIDATE_RATERS/);
    expect(() => loadConfig({ ...ALL_REQUIRED, FORYOU_CANDIDATE_RATERS: "20.5" })).toThrow(/FORYOU_CANDIDATE_RATERS/);
  });
});
