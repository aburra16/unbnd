import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toBookTagAssertionEvent,
  toBookTagEvent,
  toWireTemplate,
  type SignedNostrEvent,
  type TagType,
} from "@unbnd/schemas";
import {
  aggregateBookTags,
  aggregateGenreBooks,
  parseTaxonomy,
  type TaxonomyElement,
} from "../../src/tags/aggregate";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR_TAGS = { kind: 39998 as const, pubkey: LIB, dTag: "book-tags" };
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };
const author = (n: number) => asHexPubkey(n.toString(16).padStart(64, "0"));

function tagElement(slug: string, type: TagType, name: string, sensitivity: "normal" | "accusatory"): SignedNostrEvent {
  const t = toWireTemplate(toBookTagEvent({ slug, type, name, sensitivity, parentHeader: HDR_TAGS }), 1);
  return { id: "x", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function assertion(opts: {
  bookSlug: string; tagSlug: string; tagType: TagType; polarity: 1 | -1; asserter: number; createdAt?: number;
}): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    tagSlug: opts.tagSlug,
    tagType: opts.tagType,
    polarity: opts.polarity,
    asserterPubkey: author(opts.asserter),
    parentHeader: HDR_ASSERT,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), opts.createdAt ?? 1);
  return { id: `${opts.bookSlug}-${opts.tagSlug}-${opts.asserter}`, pubkey: author(opts.asserter), sig: "x", ...t } as SignedNostrEvent;
}

const TAXONOMY: TaxonomyElement[] = [
  { slug: "literary-fiction", type: "genre", name: "Literary fiction", sensitivity: "normal" },
  { slug: "short-novel", type: "style", name: "Short novel", sensitivity: "normal" },
  { slug: "ai-generated", type: "signal", name: "AI generated", sensitivity: "accusatory" },
];

describe("parseTaxonomy", () => {
  it("parses tag-element events into the taxonomy list", () => {
    const els = parseTaxonomy([
      tagElement("literary-fiction", "genre", "Literary fiction", "normal"),
      tagElement("ai-generated", "signal", "AI generated", "accusatory"),
    ]);
    expect(els).toContainEqual({ slug: "literary-fiction", type: "genre", name: "Literary fiction", sensitivity: "normal" });
    expect(els.find((e) => e.slug === "ai-generated")!.sensitivity).toBe("accusatory");
  });
});

describe("aggregateBookTags", () => {
  it("counts applies/disputes per tag, dedups by author, excludes accusatory", () => {
    const r = aggregateBookTags(
      [
        assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: 1 }),
        assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: 2 }),
        assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: 2, createdAt: 5 }), // same author, latest wins -> still 1
        assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: -1, asserter: 3 }),
        assertion({ bookSlug: "b1", tagSlug: "short-novel", tagType: "style", polarity: 1, asserter: 1 }),
        assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: 4 }),
      ],
      TAXONOMY,
    );
    const lf = r.genres.find((g) => g.slug === "literary-fiction")!;
    expect(lf.applies).toBe(2);
    expect(lf.disputes).toBe(1);
    expect(r.styles.find((s) => s.slug === "short-novel")!.applies).toBe(1);
    // accusatory excluded from every bucket
    expect(JSON.stringify(r)).not.toContain("ai-generated");
  });
});

describe("aggregateGenreBooks", () => {
  it("returns only net-positive books for the genre", () => {
    const books = aggregateGenreBooks([
      assertion({ bookSlug: "good", tagSlug: "mystery", tagType: "genre", polarity: 1, asserter: 1 }),
      assertion({ bookSlug: "good", tagSlug: "mystery", tagType: "genre", polarity: 1, asserter: 2 }),
      assertion({ bookSlug: "contested", tagSlug: "mystery", tagType: "genre", polarity: 1, asserter: 1 }),
      assertion({ bookSlug: "contested", tagSlug: "mystery", tagType: "genre", polarity: -1, asserter: 2 }),
      assertion({ bookSlug: "contested", tagSlug: "mystery", tagType: "genre", polarity: -1, asserter: 3 }),
    ]);
    expect(books).toContain("good");
    expect(books).not.toContain("contested");
  });
});
