// Failing tests (red) for Story 32 / ADR 0033 §7 — the new config key
// VERIFIED_AUTHOR_MIN_CURATORS (the `N` head count for the verification
// count-gate). Distinct from CURATOR_THRESHOLD (the per-curator floor reuses
// curatorThreshold; no new weight env). Validated as a positive integer ≥ 1,
// parsed like PORT / PERSONALIZE_MIN_FOLLOWS. Default 2.
//
// Red until loadConfig adds `verifiedAuthorMinCurators` (env
// VERIFIED_AUTHOR_MIN_CURATORS).
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const ALL_REQUIRED = {
  NEO4J_PASSWORD: "tapestry-local-dev",
  SEARCH_API_KEY: "local-dev-search-key",
  DATABASE_URL: "postgres://unbnd:unbnd@localhost:5432/unbnd",
  BACKUP_ENCRYPTION_KEY: "a".repeat(64),
};

describe("loadConfig — VERIFIED_AUTHOR_MIN_CURATORS (ADR 0033 §7)", () => {
  it("defaults to 2 (two distinct trusted curators, author excluded)", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).verifiedAuthorMinCurators).toBe(2);
  });

  it("respects a numeric override and parses it as a number", () => {
    const c = loadConfig({ ...ALL_REQUIRED, VERIFIED_AUTHOR_MIN_CURATORS: "3" });
    expect(c.verifiedAuthorMinCurators).toBe(3);
    expect(typeof c.verifiedAuthorMinCurators).toBe("number");
  });

  it("accepts the minimum of 1 curator", () => {
    expect(
      loadConfig({ ...ALL_REQUIRED, VERIFIED_AUTHOR_MIN_CURATORS: "1" })
        .verifiedAuthorMinCurators,
    ).toBe(1);
  });

  it("throws on zero (must be a positive integer ≥ 1)", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, VERIFIED_AUTHOR_MIN_CURATORS: "0" }),
    ).toThrow(/VERIFIED_AUTHOR_MIN_CURATORS/);
  });

  it("throws on a negative value", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, VERIFIED_AUTHOR_MIN_CURATORS: "-2" }),
    ).toThrow(/VERIFIED_AUTHOR_MIN_CURATORS/);
  });

  it("throws on a non-integer", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, VERIFIED_AUTHOR_MIN_CURATORS: "1.5" }),
    ).toThrow(/VERIFIED_AUTHOR_MIN_CURATORS/);
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, VERIFIED_AUTHOR_MIN_CURATORS: "abc" }),
    ).toThrow(/VERIFIED_AUTHOR_MIN_CURATORS/);
  });
});
