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

// FAILING TESTS: Story 97 / ADR 0087, the declared books header.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildBooksHeaderTemplate,
  seededHeaderTemplates,
  type LinkTemplate,
} from "../src/headers";

const LIB = "6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b";
const COORD = `39998:${LIB}:books`;
const DECLS = new Set(["required", "recommended", "optional"]);
/** Every tag a book item carries besides d/z/t/json (sampled from dcosl, ADR 0087). */
const ITEM_FIELDS = [
  "title", "author", "cover", "isbn", "isbn10", "open-library-id",
  "year", "pages", "lang", "subject", "format", "source",
];
const OL: LinkTemplate = {
  id: "a".repeat(64),
  relay: "wss://dcosl.brainstorm.world",
  placeholder: "id",
  field: "open-library-id",
};
const GR: LinkTemplate = {
  id: "b".repeat(64),
  relay: "wss://dcosl.brainstorm.world",
  placeholder: "isbn",
  field: "isbn",
};

const books = (links: readonly LinkTemplate[] = [OL, GR]) =>
  buildBooksHeaderTemplate({ librarian: LIB, createdAt: 1_790_000_000, links });
const all = (t: { tags: string[][] }, name: string) => t.tags.filter((x) => x[0] === name);

describe("buildBooksHeaderTemplate (ADR 0087)", () => {
  it("is the librarian's books header, with names and a plain description", () => {
    const t = books();
    expect(t.kind).toBe(39998);
    expect(t.created_at).toBe(1_790_000_000);
    expect(all(t, "d")).toEqual([["d", "books"]]);
    expect(all(t, "names")).toEqual([["names", "Book", "Books"]]);
    const desc = all(t, "description");
    expect(desc).toHaveLength(1);
    expect(desc[0]![1]).toMatch(/Open Library/);
    expect(desc[0]![1]).toMatch(/Unbnd/);
    expect(desc[0]![1]).not.toMatch(/[—–!]/);
  });

  it("declares every field the items carry, once each, title first and required", () => {
    const t = books();
    const decls = t.tags.filter((x) => DECLS.has(x[0]!));
    expect(decls[0]).toEqual(["required", "title", expect.any(String)]);
    const names = decls.map((x) => x[1]);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...ITEM_FIELDS].sort());
    for (const d of decls) expect(d[2]?.trim()).toBeTruthy();
  });

  it("uses Brainstorm's optional, never the NIP's allowed, and types the cover", () => {
    const t = books();
    expect(all(t, "allowed")).toEqual([]);
    expect(all(t, "field-type")).toEqual([["field-type", "cover", "url"]]);
  });

  it("display hints name only declared fields, one per role, facts year and pages", () => {
    const t = books();
    const declared = new Set(t.tags.filter((x) => DECLS.has(x[0]!)).map((x) => x[1]));
    const hints = all(t, "display");
    for (const h of hints) expect(declared.has(h[2])).toBe(true);
    const roles = hints.filter((h) => h[1] !== "fact").map((h) => h[1]);
    expect(new Set(roles).size).toBe(roles.length);
    expect(hints).toContainEqual(["display", "title", "title"]);
    expect(hints).toContainEqual(["display", "summary", "author"]);
    expect(hints).toContainEqual(["display", "image", "cover"]);
    expect(hints.filter((h) => h[1] === "fact")).toEqual([
      ["display", "fact", "year", "Published"],
      ["display", "fact", "pages", "Pages"],
    ]);
  });

  it("pins its list image to a commit and links its sources' terms", () => {
    const t = books();
    const img = all(t, "image");
    expect(img).toHaveLength(1);
    expect(img[0]![1]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/aburra16\/unbnd\/[0-9a-f]{7,40}\//);
    const refs = all(t, "r").map((x) => x[1]);
    expect(refs).toContain("https://openlibrary.org/developers/licensing");
  });

  it("pins link templates by id in the given order, and emits none when none are given", () => {
    expect(all(books(), "link")).toEqual([
      ["link", OL.id, OL.relay, "id", "open-library-id"],
      ["link", GR.id, GR.relay, "isbn", "isbn"],
    ]);
    expect(all(books([]), "link")).toEqual([]);
  });

  it("refuses a template id that is not 64 hex or a field that is not declared", () => {
    expect(() => books([{ ...OL, id: "8382b369" }])).toThrow();
    expect(() => books([{ ...OL, field: "goodreads-id" }])).toThrow();
  });

  it("points at itself exactly once and keeps the concept-graph json", () => {
    const t = books();
    expect(all(t, "b")).toEqual([["b", COORD, "pointer"]]);
    expect(all(t, "json")).toHaveLength(1);
  });
});

describe("seededHeaderTemplates: one source for both entrypoints (ADR 0087 §1)", () => {
  it("returns the four seeded headers, books in the declared shape", () => {
    const ts = seededHeaderTemplates(LIB, 1_790_000_000);
    expect(ts.map((t) => t.tags.find((x) => x[0] === "d")![1])).toEqual([
      "books", "book-tags", "book-tag-assertions", "book-submissions",
    ]);
    expect(all(ts[0]!, "names")).toEqual([["names", "Book", "Books"]]);
    for (const t of ts) expect(t.created_at).toBe(1_790_000_000);
  });

  it("the seed and the header-only entrypoint both publish exactly its output", () => {
    const src = (f: string) => readFileSync(join(__dirname, "../src", f), "utf8");
    for (const f of ["index.ts", "publish-headers.ts"]) {
      expect(src(f)).toMatch(/seededHeaderTemplates\(/);
      expect(src(f)).not.toMatch(/buildConceptHeaderTemplate\(/);
    }
  });

  it("the header-only entrypoint ships in the image as headers.js", () => {
    const root = join(__dirname, "..");
    expect(readFileSync(join(root, "esbuild.config.mjs"), "utf8")).toMatch(/src\/publish-headers\.ts/);
    expect(readFileSync(join(root, "Dockerfile"), "utf8")).toMatch(/dist\/publish-headers\.js \.\/headers\.js/);
  });
});
