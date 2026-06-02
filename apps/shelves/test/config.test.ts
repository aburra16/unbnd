// Story 35 / ADR 0036 §4 — the SHELF_* definition envs, validated in the WORKER
// (not the API config). Defaults 7 / 3 / 5 / 10; overrides; positive-integer
// validation (a bad env fails the run loudly rather than caching a malformed
// shelf). FAILING until `apps/shelves/src/config.ts` exports `loadShelfDefs`.
import { describe, expect, it } from "vitest";
import { loadShelfDefs } from "../src/config";

describe("loadShelfDefs — defaults (ADR 0036 §4)", () => {
  it("defaults SHELF_TRENDING_WINDOW_DAYS to 7", () => {
    expect(loadShelfDefs({}).trendingWindowDays).toBe(7);
  });

  it("defaults SHELF_FAVORITES_MIN_RATINGS to 3", () => {
    expect(loadShelfDefs({}).favoritesMinRatings).toBe(3);
  });

  it("defaults SHELF_GENRE_COUNT to 5", () => {
    expect(loadShelfDefs({}).genreCount).toBe(5);
  });

  it("defaults SHELF_BOOKS_PER_ROW to 10", () => {
    expect(loadShelfDefs({}).booksPerRow).toBe(10);
  });
});

describe("loadShelfDefs — overrides", () => {
  it("respects explicit numeric overrides", () => {
    const d = loadShelfDefs({
      SHELF_TRENDING_WINDOW_DAYS: "14",
      SHELF_FAVORITES_MIN_RATINGS: "5",
      SHELF_GENRE_COUNT: "8",
      SHELF_BOOKS_PER_ROW: "12",
    });
    expect(d).toMatchObject({
      trendingWindowDays: 14,
      favoritesMinRatings: 5,
      genreCount: 8,
      booksPerRow: 12,
    });
  });
});

describe("loadShelfDefs — validation (positive integers)", () => {
  it("throws on a non-integer SHELF_TRENDING_WINDOW_DAYS", () => {
    expect(() =>
      loadShelfDefs({ SHELF_TRENDING_WINDOW_DAYS: "lots" }),
    ).toThrow(/SHELF_TRENDING_WINDOW_DAYS/);
  });

  it("throws when SHELF_TRENDING_WINDOW_DAYS is zero or negative", () => {
    expect(() => loadShelfDefs({ SHELF_TRENDING_WINDOW_DAYS: "0" })).toThrow(
      /SHELF_TRENDING_WINDOW_DAYS/,
    );
    expect(() => loadShelfDefs({ SHELF_TRENDING_WINDOW_DAYS: "-7" })).toThrow(
      /SHELF_TRENDING_WINDOW_DAYS/,
    );
  });

  it("throws when SHELF_FAVORITES_MIN_RATINGS is not a positive integer", () => {
    expect(() => loadShelfDefs({ SHELF_FAVORITES_MIN_RATINGS: "0" })).toThrow(
      /SHELF_FAVORITES_MIN_RATINGS/,
    );
    expect(() => loadShelfDefs({ SHELF_FAVORITES_MIN_RATINGS: "2.5" })).toThrow(
      /SHELF_FAVORITES_MIN_RATINGS/,
    );
  });

  it("throws when SHELF_GENRE_COUNT is not a positive integer", () => {
    expect(() => loadShelfDefs({ SHELF_GENRE_COUNT: "-1" })).toThrow(
      /SHELF_GENRE_COUNT/,
    );
  });

  it("throws when SHELF_BOOKS_PER_ROW is not a positive integer", () => {
    expect(() => loadShelfDefs({ SHELF_BOOKS_PER_ROW: "nope" })).toThrow(
      /SHELF_BOOKS_PER_ROW/,
    );
  });
});
