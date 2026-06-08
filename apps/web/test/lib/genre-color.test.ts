// Story 75 / ADR 0073 (web) — the 16 genres get distinct, intentional browse-card
// colors via GENRE_COLORS, decoupled from the cover-gradient hash. FAILING until
// GENRE_COLORS is populated and genreColor() reads it.
import { describe, expect, it } from "vitest";
import { GENRE_COLORS } from "@unbnd/ui";
import { genreColor, coverGradient } from "../../src/lib/view-model";

const GENRES = [
  "literary-fiction", "science-fiction", "mystery", "romance", "fantasy",
  "thriller", "biography", "history", "horror", "poetry", "young-adult",
  "graphic-novels", "philosophy", "science", "self-help", "memoir",
];

describe("GENRE_COLORS — a distinct color per genre", () => {
  it("has an entry for all 16 genres", () => {
    for (const slug of GENRES) {
      expect(GENRE_COLORS[slug], `missing color for ${slug}`).toBeTruthy();
    }
  });

  it("assigns 16 distinct colors (no collisions)", () => {
    const colors = GENRES.map((slug) => GENRE_COLORS[slug]);
    expect(new Set(colors).size).toBe(16);
  });
});

describe("genreColor — reads GENRE_COLORS first", () => {
  it("returns the mapped color for each genre", () => {
    for (const slug of GENRES) {
      expect(genreColor(slug)).toBe(GENRE_COLORS[slug]);
    }
  });

  it("yields 16 distinct genre-card colors", () => {
    expect(new Set(GENRES.map(genreColor)).size).toBe(16);
  });
});

describe("cover gradients are untouched by the genre-color change", () => {
  it("coverGradient still returns a stable {from,to,ink} for a book seed", () => {
    const g = coverGradient("some-book-slug");
    expect(g).toMatchObject({
      from: expect.any(String),
      to: expect.any(String),
      ink: expect.any(String),
    });
  });
});
