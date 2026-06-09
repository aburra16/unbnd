// FAILING TESTS (red) — Story 33 / ADR 0034 §3. The read-filter gains an
// OPTIONAL `revealedTagSlugs: ReadonlySet<string>` (default empty = today's
// behavior). Line ~172 becomes: unknown still dropped; accusatory dropped
// UNLESS its slug is in `revealedTagSlugs`. A revealed accusatory tag flows into
// `signals` carrying a marker (`revealed: true`) so the web renders it honestly.
// Default-empty keeps EVERY existing caller (and `aggregateBookTags`) unchanged.
//
// AC-3: default-empty set → accusatory dropped.
// AC-4: (book,tag) in the set → that accusatory tag surfaces in `signals`,
//   marked `revealed`, while a non-revealed accusatory tag stays hidden.
// AC-6: canonical assertions are never mutated — the same assertion array is
//   passed before and after a reveal; only the injected set changes; raw
//   applies/disputes counts and trusted-weighting are untouched.
//
// RED until aggregate.ts adds the optional `revealedTagSlugs` parameter and the
// `revealed` marker on the surfaced TagConsensus.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
  type TagType,
} from "@unbnd/schemas";
import {
  aggregateBookTags,
  aggregateBookTagsWeighted as aggregateBookTagsWeightedBase,
  type TaxonomyElement,
} from "../../src/tags/aggregate";

// Story 33 widens this to take an optional 4th `revealedTagSlugs` arg (ADR 0034
// §3). The test calls it with that arg now; this local alias types the
// still-to-be-widened signature so the RED set fails the ASSERTION, not tsc
// (the PR-#74 rule). The Implementer's widening makes the alias a no-op.
const aggregateBookTagsWeighted = aggregateBookTagsWeightedBase as (
  assertions: Parameters<typeof aggregateBookTagsWeightedBase>[0],
  taxonomy: Parameters<typeof aggregateBookTagsWeightedBase>[1],
  weights: Parameters<typeof aggregateBookTagsWeightedBase>[2],
  revealedTagSlugs?: ReadonlySet<string>,
) => ReturnType<typeof aggregateBookTagsWeightedBase>;

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };
const CURATOR = "a".repeat(64);

function assertion(opts: {
  bookSlug: string;
  tagSlug: string;
  tagType: TagType;
  polarity: 1 | -1;
  asserter: string;
}): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    tagSlug: opts.tagSlug,
    tagType: opts.tagType,
    polarity: opts.polarity,
    asserterPubkey: asHexPubkey(opts.asserter),
    parentHeader: HDR_ASSERT,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), 1);
  return { id: `${opts.tagSlug}-${opts.asserter.slice(0, 4)}`, pubkey: asHexPubkey(opts.asserter), sig: "x", ...t } as SignedNostrEvent;
}

const TAXONOMY: TaxonomyElement[] = [
  { slug: "literary-fiction", type: "genre", name: "Literary fiction", sensitivity: "normal" },
  { slug: "ai-generated", type: "signal", name: "AI generated", sensitivity: "accusatory" },
  { slug: "possibly-ai-generated", type: "signal", name: "Possibly AI generated", sensitivity: "accusatory" },
];

describe("aggregateBookTagsWeighted — default-empty revealedTagSlugs (AC-3, callers unchanged)", () => {
  it("with NO revealedTagSlugs argument, accusatory tags are dropped (existing behavior)", () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
    ];
    const out = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map());
    expect(out.genres.find((g) => g.slug === "literary-fiction")).toBeDefined();
    expect(JSON.stringify(out)).not.toContain("ai-generated");
  });

  it("an empty set behaves identically to omitting the argument", () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
    ];
    const omitted = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map());
    const empty = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map(), new Set());
    expect(JSON.stringify(empty)).toBe(JSON.stringify(omitted));
  });

  it("the raw aggregateBookTags path (default-empty) still drops accusatory", () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
    ];
    const raw = aggregateBookTags(assertions, TAXONOMY);
    expect(raw.genres.find((g) => g.slug === "literary-fiction")).toBeDefined();
    expect(JSON.stringify(raw)).not.toContain("ai-generated");
  });
});

describe("aggregateBookTagsWeighted — revealedTagSlugs surfaces the revealed tag (AC-4)", () => {
  it("a (book,tag) in revealedTagSlugs surfaces that accusatory tag in signals, marked revealed", () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "possibly-ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
    ];
    const out = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map(), new Set(["ai-generated"]));
    const revealed = out.signals.find((s) => s.slug === "ai-generated");
    expect(revealed).toBeDefined();
    expect((revealed as { revealed?: boolean }).revealed).toBe(true);
    // The sibling accusatory tag, NOT revealed, stays hidden.
    expect(out.signals.find((s) => s.slug === "possibly-ai-generated")).toBeUndefined();
  });

  it("a revealed accusatory tag is NOT auto-marked trusted/consensus by the reveal", () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
    ];
    const out = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map(), new Set(["ai-generated"]));
    const revealed = out.signals.find((s) => s.slug === "ai-generated")!;
    // No trust weighting was applied (empty weights map) → not trusted.
    expect(revealed.trusted).toBe(false);
  });

  it("a NORMAL tag is never marked revealed even if its slug somehow appears in the set", () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1, asserter: CURATOR }),
    ];
    const out = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map(), new Set(["literary-fiction"]));
    const lf = out.genres.find((g) => g.slug === "literary-fiction")!;
    expect((lf as { revealed?: boolean }).revealed).not.toBe(true);
  });
});

describe("aggregateBookTagsWeighted — canonical assertions never mutated (AC-6)", () => {
  it("the same assertion array yields hidden (no reveal) then surfaced (reveal) with raw counts intact", () => {
    const assertions = [
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
      assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: "b".repeat(64) }),
    ];
    const snapshot = JSON.stringify(assertions);

    const hidden = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map());
    expect(JSON.stringify(hidden)).not.toContain("ai-generated");

    const surfaced = aggregateBookTagsWeighted(assertions, TAXONOMY, new Map(), new Set(["ai-generated"]));
    const sig = surfaced.signals.find((s) => s.slug === "ai-generated")!;
    expect(sig.applies).toBe(2); // raw substrate intact

    // The input assertion events were not mutated by either call.
    expect(JSON.stringify(assertions)).toBe(snapshot);
  });
});

// Story 78 / ADR 0076 — the curator-only gated view (5th param). Cast-alias so
// the RED set fails the ASSERTION, not tsc, until the param is honored.
const aggregateWithGated = aggregateBookTagsWeightedBase as (
  assertions: Parameters<typeof aggregateBookTagsWeightedBase>[0],
  taxonomy: Parameters<typeof aggregateBookTagsWeightedBase>[1],
  weights: Parameters<typeof aggregateBookTagsWeightedBase>[2],
  revealedTagSlugs?: ReadonlySet<string>,
  includeGatedAccusatory?: boolean,
) => ReturnType<typeof aggregateBookTagsWeightedBase>;

describe("aggregateBookTagsWeighted — curator-only gated view (Story 78 / ADR 0076)", () => {
  const gatedAssertions = [
    assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: CURATOR }),
    assertion({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1, asserter: "b".repeat(64) }),
  ];

  it("includeGatedAccusatory=true surfaces an UNREVEALED accusatory tag marked gated, not revealed", () => {
    const out = aggregateWithGated(gatedAssertions, TAXONOMY, new Map(), new Set(), true);
    const sig = out.signals.find((s) => s.slug === "ai-generated");
    expect(sig).toBeDefined();
    expect((sig as { gated?: boolean }).gated).toBe(true);
    expect((sig as { revealed?: boolean }).revealed).toBeUndefined(); // not a public reveal
    expect(sig!.applies).toBe(2); // real substantiation shown to the curator
  });

  it("a revealed accusatory tag stays 'revealed' (not 'gated') even with the flag on", () => {
    const out = aggregateWithGated(gatedAssertions, TAXONOMY, new Map(), new Set(["ai-generated"]), true);
    const sig = out.signals.find((s) => s.slug === "ai-generated")!;
    expect((sig as { revealed?: boolean }).revealed).toBe(true);
    expect((sig as { gated?: boolean }).gated).toBeUndefined();
  });

  it("the default (flag off) keeps the public gate: an unrevealed accusatory tag is hidden", () => {
    const out = aggregateWithGated(gatedAssertions, TAXONOMY, new Map(), new Set(), false);
    expect(out.signals.find((s) => s.slug === "ai-generated")).toBeUndefined();
  });
});
