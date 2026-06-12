// FAILING TESTS — Story 84 / ADR 0081 (the content loader).
import { describe, expect, it } from "vitest";
import { loadGuide } from "../../src/guide/load";

const entry = (anchor: string, name: string, order = 1, extra = "") =>
  `---\nanchor: ${anchor}\nname: ${name}\norder: ${order}\n${extra}---\n\nBody text here.\n`;

describe("loadGuide — authored frontmatter, published sections (ADR 0081 §1)", () => {
  it("groups entries by section directory, ordered by `order`, sections in manifest order", () => {
    const raw = {
      "./content/finding-books/2-search.md": entry("search", "Search", 2),
      "./content/finding-books/1-hidden-gems.md": entry("hidden-gems", "Hidden Gems", 1),
      "./content/getting-started/1-your-first-session.md": entry("your-first-session", "Your first session", 1),
    };
    const guide = loadGuide(raw);
    expect(guide.published.map((s) => s.slug)).toEqual(["getting-started", "finding-books"]);
    const finding = guide.published[1]!;
    expect(finding.entries.map((e) => e.anchor)).toEqual(["hidden-gems", "search"]);
    expect(finding.entries[0]!.name).toBe("Hidden Gems");
    expect(finding.entries[0]!.body).toContain("Body text here.");
  });

  it("published means at least one entry: empty sections are absent", () => {
    const guide = loadGuide({
      "./content/for-curators/1-vouching.md": entry("vouching", "Vouching"),
    });
    expect(guide.published).toHaveLength(1);
    expect(guide.published[0]!.slug).toBe("for-curators");
  });

  it("parses related refs; defaults to none", () => {
    const guide = loadGuide({
      "./content/finding-books/1-x.md": entry("x", "X", 1, "related: [ratings-you-can-trust#taste-match]\n"),
    });
    expect(guide.published[0]!.entries[0]!.related).toEqual(["ratings-you-can-trust#taste-match"]);
  });

  it("fails loudly on a file missing anchor or name (anchors are authored, never derived)", () => {
    expect(() =>
      loadGuide({ "./content/finding-books/1-bad.md": "---\nname: No anchor\n---\nBody.\n" }),
    ).toThrow(/anchor/i);
    expect(() =>
      loadGuide({ "./content/finding-books/1-bad.md": "---\nanchor: bad\n---\nBody.\n" }),
    ).toThrow(/name/i);
  });

  it("fails loudly on an unknown section directory", () => {
    expect(() =>
      loadGuide({ "./content/not-a-section/1-x.md": entry("x", "X") }),
    ).toThrow(/section/i);
  });

  it("empty content is a valid, empty guide", () => {
    expect(loadGuide({}).published).toEqual([]);
  });
});
