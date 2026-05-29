import { describe, expect, it } from "vitest";
import { buildConceptHeaderTemplate } from "../src/headers";

describe("buildConceptHeaderTemplate", () => {
  it("builds a kind-39998 header with a d-tag and a conceptHeader json tag", () => {
    const t = buildConceptHeaderTemplate({
      slug: "books",
      name: "books",
      title: "Books",
      createdAt: 1_716_800_000,
    });
    expect(t.kind).toBe(39998);
    expect(t.created_at).toBe(1_716_800_000);
    expect(t.tags).toContainEqual(["d", "books"]);
    const jsonTag = t.tags.find((tag) => tag[0] === "json");
    expect(jsonTag).toBeDefined();
    const parsed = JSON.parse(jsonTag![1]!);
    expect(parsed.word.wordTypes).toEqual(["word", "conceptHeader"]);
    expect(parsed.conceptHeader.slug).toBe("books");
  });
});
