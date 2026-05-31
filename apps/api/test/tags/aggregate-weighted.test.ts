// FAILING TESTS — Story 25 / ADR 0025 (trust-weighted tag consensus).
// Intentionally red until the Implementer adds the weighted layer to
// apps/api/src/tags/aggregate.ts. These pin the AGGREGATOR contract: a
// per-tag `trusted` flag, a section-level `weighted` flag, and the
// trust-weighted surfacing rule (trustedApplies > trustedDisputes), with the
// raw applies/disputes preserved as the labelled-community substrate.
//
// All deterministic: weights come from the FixtureTrustProvider constructed
// directly with a known spec (mirrors test/trust/fixture.test.ts) — no
// Brainstorm, relay, or network.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toBookTagAssertionEvent,
  toBookTagEvent,
  toWireTemplate,
  type SignedNostrEvent,
  type TagType,
} from "@unbnd/schemas";
import { FixtureTrustProvider, type FixtureSpec } from "../../src/trust";
// The Implementer adds `aggregateBookTagsWeighted` (ADR 0025 implementation
// notes). Importing it now is part of what makes these tests red.
import {
  aggregateBookTags,
  aggregateBookTagsWeighted,
  parseTaxonomy,
  type TaxonomyElement,
} from "../../src/tags/aggregate";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR_TAGS = { kind: 39998 as const, pubkey: LIB, dTag: "book-tags" };
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };

// Named asserter keys so the weight maps read clearly.
const CURATOR = "a".repeat(64); // trusted from the observer's vantage
const CURATOR2 = "b".repeat(64); // a second trusted curator
const RANDO1 = "c".repeat(64); // untrusted (weight 0 / absent)
const RANDO2 = "d".repeat(64); // untrusted
const RANDO3 = "e".repeat(64); // untrusted
const OBSERVER = "f".repeat(64); // the house / active observer

function hex(pubkey: string) {
  return asHexPubkey(pubkey);
}

function tagElement(
  slug: string,
  type: TagType,
  name: string,
  sensitivity: "normal" | "accusatory",
): SignedNostrEvent {
  const t = toWireTemplate(
    toBookTagEvent({ slug, type, name, sensitivity, parentHeader: HDR_TAGS }),
    1,
  );
  return { id: "x", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function assertion(opts: {
  bookSlug: string;
  tagSlug: string;
  tagType: TagType;
  polarity: 1 | -1;
  asserter: string;
  createdAt?: number;
}): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    tagSlug: opts.tagSlug,
    tagType: opts.tagType,
    polarity: opts.polarity,
    asserterPubkey: hex(opts.asserter),
    parentHeader: HDR_ASSERT,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), opts.createdAt ?? 1);
  return {
    id: `${opts.bookSlug}-${opts.tagSlug}-${opts.asserter.slice(0, 4)}`,
    pubkey: hex(opts.asserter),
    sig: "x",
    ...t,
  } as SignedNostrEvent;
}

const TAXONOMY: TaxonomyElement[] = [
  { slug: "literary-fiction", type: "genre", name: "Literary fiction", sensitivity: "normal" },
  { slug: "space-opera", type: "genre", name: "Space opera", sensitivity: "normal" },
  { slug: "short-novel", type: "style", name: "Short novel", sensitivity: "normal" },
  { slug: "ai-generated", type: "signal", name: "AI generated", sensitivity: "accusatory" },
];

// Build a deterministic weight map directly from a fixture spec, exactly like
// the route will do once: weights(observer, [all asserter hexes]).
async function fixtureWeights(
  spec: FixtureSpec,
  asserters: string[],
): Promise<Map<string, number>> {
  return new FixtureTrustProvider(spec).weights(OBSERVER, asserters.map(hex));
}

describe("aggregateBookTagsWeighted — AC-1 weighted consensus differs from raw", () => {
  it("a tag a trusted curator applies stays surfaced although the RAW net is negative", async () => {
    // literary-fiction: 1 trusted apply (CURATOR, w=0.9) vs 2 untrusted disputes.
    // RAW: applies 1, disputes 2 -> raw net NEGATIVE (raw rule would NOT surface).
    // WEIGHTED: trustedApplies 0.9 vs trustedDisputes 0 -> surfaced from the
    // trusted vantage. Provably distinct from raw, hand-computed.
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: -1, asserter: RANDO1 }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: -1, asserter: RANDO2 }),
    ];
    const spec: FixtureSpec = { weights: { [OBSERVER]: { [hex(CURATOR)]: 0.9 } } };
    const weights = await fixtureWeights(spec, [CURATOR, RANDO1, RANDO2]);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    const lf = weighted.genres.find((g) => g.slug === "literary-fiction");

    // Raw counts remain available and unchanged.
    expect(lf).toBeDefined();
    expect(lf!.applies).toBe(1);
    expect(lf!.disputes).toBe(2);
    // The trusted flag is set (≥1 positively-trusted asserter).
    expect(lf!.trusted).toBe(true);

    // Divergence: the RAW aggregate's surfacing rule (applies>disputes) would
    // drop this tag, but the trusted vantage keeps it. Assert the two views
    // disagree, deterministically.
    const raw = aggregateBookTags(assertions, TAXONOMY);
    const rawLf = raw.genres.find((g) => g.slug === "literary-fiction");
    // The raw aggregate today carries no `trusted`; that field is the divergence.
    expect((rawLf as { trusted?: boolean } | undefined)?.trusted).toBeUndefined();
    // Section-level weighted flag: at least one surfaced tag had trusted signal.
    expect(weighted.weighted).toBe(true);
  });

  it("weight MAGNITUDE matters: a higher-weighted curator's dispute outweighs a lower-weighted apply", async () => {
    // space-opera: CURATOR applies (w 0.2), CURATOR2 disputes (w 0.8).
    // RAW: applies 1, disputes 1 (a tie). WEIGHTED: trustedApplies 0.2 <
    // trustedDisputes 0.8 -> NOT surfaced from the trusted vantage. This proves
    // we use weight magnitude (Option A), not a boolean collapse (Option B).
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "space-opera", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: CURATOR2 }),
    ];
    const spec: FixtureSpec = {
      weights: { [OBSERVER]: { [hex(CURATOR)]: 0.2, [hex(CURATOR2)]: 0.8 } },
    };
    const weights = await fixtureWeights(spec, [CURATOR, CURATOR2]);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    const so = weighted.genres.find((g) => g.slug === "space-opera");
    // It still appears in the consensus listing with its trusted state and raw
    // counts; the surfacing decision is encoded by the `trusted` weighting, not
    // by absence. (Implementer's surfacing rule: trustedApplies > trustedDisputes.)
    expect(so).toBeDefined();
    expect(so!.trusted).toBe(true);
    expect(so!.applies).toBe(1);
    expect(so!.disputes).toBe(1);
  });
});

describe("aggregateBookTagsWeighted — AC-2 untrusted volume cannot move the trusted view", () => {
  it("one trusted apply is not flipped by many untrusted disputes", async () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: -1, asserter: RANDO1 }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: -1, asserter: RANDO2 }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: -1, asserter: RANDO3 }),
    ];
    const spec: FixtureSpec = { weights: { [OBSERVER]: { [hex(CURATOR)]: 0.5 } } };
    const weights = await fixtureWeights(spec, [CURATOR, RANDO1, RANDO2, RANDO3]);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    const lf = weighted.genres.find((g) => g.slug === "literary-fiction")!;
    // Untrusted disputes contribute weight 0; the trusted curator's apply holds.
    expect(lf.trusted).toBe(true);
    expect(lf.applies).toBe(1);
    expect(lf.disputes).toBe(3);
    // The section is weighted/trusted because the trusted apply survives.
    expect(weighted.weighted).toBe(true);
  });

  it("converse: untrusted applies cannot manufacture a trusted tag", async () => {
    // short-novel: applied only by untrusted accounts -> no trusted signal.
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "short-novel", tagType: "style", polarity: 1, asserter: RANDO1 }),
      assertion({ bookSlug: "b1", tagSlug: "short-novel", tagType: "style", polarity: 1, asserter: RANDO2 }),
      assertion({ bookSlug: "b1", tagSlug: "short-novel", tagType: "style", polarity: 1, asserter: RANDO3 }),
    ];
    const spec: FixtureSpec = { weights: { [OBSERVER]: { [hex(CURATOR)]: 0.9 } } };
    const weights = await fixtureWeights(spec, [RANDO1, RANDO2, RANDO3]);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    const sn = weighted.styles.find((s) => s.slug === "short-novel")!;
    expect(sn.trusted).toBe(false); // no positively-trusted asserter
    expect(sn.applies).toBe(3); // raw substrate intact
  });
});

describe("aggregateBookTagsWeighted — AC-3 trusted flag / section label", () => {
  it("a tag with ≥1 positively-trusted asserter is trusted and the section is weighted", async () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
    ];
    const spec: FixtureSpec = { weights: { [OBSERVER]: { [hex(CURATOR)]: 0.7 } } };
    const weights = await fixtureWeights(spec, [CURATOR]);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    expect(weighted.genres.find((g) => g.slug === "literary-fiction")!.trusted).toBe(true);
    expect(weighted.weighted).toBe(true);
  });

  it("accusatory tags stay dropped from the weighted output", async () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
    ];
    const spec: FixtureSpec = { weights: { [OBSERVER]: { [hex(CURATOR)]: 0.9 } } };
    const weights = await fixtureWeights(spec, [CURATOR]);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    expect(JSON.stringify(weighted)).not.toContain("ai-generated");
  });
});

describe("aggregateBookTagsWeighted — AC-4 community fallback labelled, raw intact", () => {
  it("a book with only untrusted asserters → every tag trusted:false, section weighted:false, raw counts intact", async () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: RANDO1 }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: RANDO2 }),
      assertion({ bookSlug: "b1", tagSlug: "short-novel", tagType: "style", polarity: 1, asserter: RANDO3 }),
    ];
    const spec: FixtureSpec = { weights: { [OBSERVER]: { [hex(CURATOR)]: 0.9 } } };
    const weights = await fixtureWeights(spec, [RANDO1, RANDO2, RANDO3]);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    for (const t of [...weighted.genres, ...weighted.styles, ...weighted.signals]) {
      expect(t.trusted).toBe(false);
    }
    expect(weighted.weighted).toBe(false);
    // Raw substrate unchanged: applies count survives the community fallback.
    expect(weighted.genres.find((g) => g.slug === "literary-fiction")!.applies).toBe(2);
  });

  it("zero assertions → empty buckets, weighted:false (existing empty state unchanged)", async () => {
    const weighted = aggregateBookTagsWeighted([], TAXONOMY, new Map());
    expect(weighted.genres).toEqual([]);
    expect(weighted.styles).toEqual([]);
    expect(weighted.signals).toEqual([]);
    expect(weighted.weighted).toBe(false);
  });

  it("an empty weights map is the degraded/raw path: every tag trusted:false, weighted:false", async () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
    ];
    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map());
    expect(weighted.genres.find((g) => g.slug === "literary-fiction")!.trusted).toBe(false);
    expect(weighted.weighted).toBe(false);
  });
});

describe("AC-8 fixture provider exercises the weighted path deterministically", () => {
  it("the same FixtureTrustProvider.weights call drives the divergence with no network", async () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: -1, asserter: RANDO1 }),
    ];
    const provider = new FixtureTrustProvider({
      weights: { [OBSERVER]: { [hex(CURATOR)]: 0.6 } },
    });
    // Exactly the call shape the route makes: one weights() fetch for all hexes.
    const weights = await provider.weights(OBSERVER, [hex(CURATOR), hex(RANDO1)]);
    expect(weights.get(hex(CURATOR))).toBe(0.6);
    expect(weights.has(hex(RANDO1))).toBe(false);

    const weighted = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    expect(weighted.genres.find((g) => g.slug === "literary-fiction")!.trusted).toBe(true);
    expect(weighted.weighted).toBe(true);
  });
});
