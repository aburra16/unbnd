// FAILING TESTS — Story 81 / ADR 0079 (the contested read-time flag).
//
// `aggregateBookTagsWeighted` marks a surfaced tag `contested: true` when the
// trusted graph does NOT net-apply it: >=1 positively-trusted asserter AND
// trustedDisputes >= trustedApplies (tie included — a tied tag is not
// settled). Never on the raw/no-trust view (untrusted weight is 0 and cannot
// trigger it), never on an accusatory tag (revealed/gated treatments own
// those), omitted (not false) on every other tag — additive like
// revealed/gated.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
  type TagType,
} from "@unbnd/schemas";
import { FixtureTrustProvider, type FixtureSpec } from "../../src/trust";
import {
  aggregateBookTagsWeighted,
  type TaxonomyElement,
} from "../../src/tags/aggregate";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };

const CURATOR = "a".repeat(64); // trusted
const CURATOR2 = "b".repeat(64); // trusted
const RANDO1 = "c".repeat(64); // untrusted
const RANDO2 = "d".repeat(64); // untrusted
const OBSERVER = "f".repeat(64);

function hex(pubkey: string) {
  return asHexPubkey(pubkey);
}

function assertion(opts: {
  tagSlug: string;
  tagType: TagType;
  polarity: 1 | -1;
  asserter: string;
}): SignedNostrEvent {
  const a = {
    bookSlug: "b1",
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: "b1" },
    tagSlug: opts.tagSlug,
    tagType: opts.tagType,
    polarity: opts.polarity,
    asserterPubkey: hex(opts.asserter),
    parentHeader: HDR_ASSERT,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), 1);
  return {
    id: `b1-${opts.tagSlug}-${opts.asserter.slice(0, 4)}-${opts.polarity}`,
    pubkey: hex(opts.asserter),
    sig: "x",
    ...t,
  } as SignedNostrEvent;
}

const TAXONOMY: TaxonomyElement[] = [
  { slug: "space-opera", type: "genre", name: "Space opera", sensitivity: "normal" },
  { slug: "ai-generated", type: "signal", name: "AI generated", sensitivity: "accusatory" },
];

async function fixtureWeights(spec: FixtureSpec, asserters: string[]) {
  return new FixtureTrustProvider(spec).weights(OBSERVER, asserters.map(hex));
}

describe("aggregateBookTagsWeighted — contested (Story 81 / ADR 0079)", () => {
  it("trusted net-disputed → contested: true (still surfaced, counts unchanged)", async () => {
    const assertions = [
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: CURATOR2 }),
    ];
    // CURATOR applies at 0.3; CURATOR2 disputes at 0.9 → trusted net-disputed.
    const spec: FixtureSpec = {
      weights: { [OBSERVER]: { [hex(CURATOR)]: 0.3, [hex(CURATOR2)]: 0.9 } },
    };
    const weights = await fixtureWeights(spec, [CURATOR, CURATOR2]);
    const out = aggregateBookTagsWeighted(assertions, TAXONOMY, weights);
    const so = out.genres.find((g) => g.slug === "space-opera");
    expect(so?.contested).toBe(true);
    expect(so?.trusted).toBe(true);
    expect(so?.applies).toBe(1); // raw counts untouched
    expect(so?.disputes).toBe(1);
  });

  it("a trusted TIE is contested (equal weight both ways is not a settled tag)", async () => {
    const assertions = [
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: CURATOR2 }),
    ];
    const spec: FixtureSpec = {
      weights: { [OBSERVER]: { [hex(CURATOR)]: 0.6, [hex(CURATOR2)]: 0.6 } },
    };
    const weights = await fixtureWeights(spec, [CURATOR, CURATOR2]);
    const so = aggregateBookTagsWeighted(assertions, TAXONOMY, weights).genres[0];
    expect(so?.contested).toBe(true);
  });

  it("trusted net-applied → the contested key is OMITTED (not false)", async () => {
    const assertions = [
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: CURATOR2 }),
    ];
    const spec: FixtureSpec = {
      weights: { [OBSERVER]: { [hex(CURATOR)]: 0.9, [hex(CURATOR2)]: 0.3 } },
    };
    const weights = await fixtureWeights(spec, [CURATOR, CURATOR2]);
    const so = aggregateBookTagsWeighted(assertions, TAXONOMY, weights).genres[0];
    expect(so?.contested).toBeUndefined();
    expect(so ? "contested" in so : true).toBe(false);
  });

  it("the raw / no-trust view never marks contested, even under heavy raw disputes", async () => {
    const assertions = [
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: 1, asserter: RANDO1 }),
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: RANDO2 }),
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: CURATOR }),
    ];
    const weights = await fixtureWeights({ weights: {} }, [RANDO1, RANDO2, CURATOR]);
    const so = aggregateBookTagsWeighted(assertions, TAXONOMY, weights).genres[0];
    expect(so?.contested).toBeUndefined();
    expect(so?.trusted).toBe(false);
  });

  it("untrusted dispute volume cannot make a trusted-applied tag contested", async () => {
    const assertions = [
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: RANDO1 }),
      assertion({ tagSlug: "space-opera", tagType: "genre", polarity: -1, asserter: RANDO2 }),
    ];
    const spec: FixtureSpec = { weights: { [OBSERVER]: { [hex(CURATOR)]: 0.5 } } };
    const weights = await fixtureWeights(spec, [CURATOR, RANDO1, RANDO2]);
    const so = aggregateBookTagsWeighted(assertions, TAXONOMY, weights).genres[0];
    expect(so?.contested).toBeUndefined();
  });

  it("an accusatory tag never carries contested (revealed/gated own that surface)", async () => {
    const assertions = [
      assertion({ tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
      assertion({ tagSlug: "ai-generated", tagType: "signal", polarity: -1, asserter: CURATOR2 }),
    ];
    const spec: FixtureSpec = {
      weights: { [OBSERVER]: { [hex(CURATOR)]: 0.3, [hex(CURATOR2)]: 0.9 } },
    };
    const weights = await fixtureWeights(spec, [CURATOR, CURATOR2]);
    // Revealed, so the accusatory tag IS surfaced — and still never contested.
    const out = aggregateBookTagsWeighted(
      assertions,
      TAXONOMY,
      weights,
      new Set(["ai-generated"]),
    );
    const ai = out.signals.find((s) => s.slug === "ai-generated");
    expect(ai?.revealed).toBe(true);
    expect(ai?.contested).toBeUndefined();
  });
});
