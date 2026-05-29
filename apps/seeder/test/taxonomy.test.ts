import { describe, expect, it } from "vitest";
import { STARTER_TAXONOMY } from "../src/taxonomy";

describe("STARTER_TAXONOMY", () => {
  it("defines the 8 UI genres", () => {
    const genres = STARTER_TAXONOMY.filter((t) => t.type === "genre").map((t) => t.slug).sort();
    expect(genres).toEqual(
      [
        "biography", "fantasy", "history", "literary-fiction",
        "mystery", "romance", "science-fiction", "thriller",
      ].sort(),
    );
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
