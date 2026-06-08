import { describe, expect, it } from "vitest";
import { STARTER_TAXONOMY } from "../src/taxonomy";

describe("STARTER_TAXONOMY", () => {
  it("defines the expanded 16 UI genres (Story 75 / ADR 0073)", () => {
    const genres = STARTER_TAXONOMY.filter((t) => t.type === "genre").map((t) => t.slug);
    expect(genres.length).toBeGreaterThanOrEqual(14);
    // The original 8 are preserved…
    for (const slug of [
      "biography", "fantasy", "history", "literary-fiction",
      "mystery", "romance", "science-fiction", "thriller",
    ]) {
      expect(genres).toContain(slug);
    }
    // …plus the 8 additions (16 total).
    for (const slug of [
      "horror", "poetry", "young-adult", "graphic-novels",
      "philosophy", "science", "self-help", "memoir",
    ]) {
      expect(genres).toContain(slug);
    }
  });

  it("flags AI-related signals as accusatory and editorial signals as normal", () => {
    const bySlug = Object.fromEntries(STARTER_TAXONOMY.map((t) => [t.slug, t]));
    expect(bySlug["ai-generated"]!.sensitivity).toBe("accusatory");
    expect(bySlug["possibly-ai-generated"]!.sensitivity).toBe("accusatory");
    expect(bySlug["well-edited"]!.sensitivity).toBe("normal");
  });

  it("uses unique slugs and only known types/sensitivities", () => {
    const slugs = STARTER_TAXONOMY.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of STARTER_TAXONOMY) {
      expect(["genre", "style", "signal"]).toContain(t.type);
      expect(["normal", "accusatory"]).toContain(t.sensitivity);
    }
  });
});
