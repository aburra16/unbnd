// Failing tests (red) for Story 19 AC-7 — the own-applied-tags count helper.
// Mirrors apps/api/test/tags/aggregate.test.ts fixture pattern. Targets a new
// `countOwnAppliedTags` export in apps/api/src/tags/aggregate.ts, which does not
// exist yet.
//
// ADR 0019 Decision 2: this is a single-author read, so the events are all the
// user's own. The latest-wins key is the (bookSlug, tagSlug) PAIR (author is
// fixed), NOT (author, tagSlug) as in aggregateBookTags. Count pairs whose
// latest polarity is +1 (apply). Disputes (latest -1) and retractions are
// excluded by construction.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
  type TagType,
} from "@unbnd/schemas";
import { countOwnAppliedTags } from "../../src/tags/aggregate";

const LIB = asHexPubkey("1".repeat(63) + "a");
const OWNER = asHexPubkey(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };

function assertion(opts: {
  bookSlug: string;
  tagSlug: string;
  tagType?: TagType;
  polarity: 1 | -1;
  createdAt?: number;
}): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    tagSlug: opts.tagSlug,
    tagType: opts.tagType ?? ("genre" as const),
    polarity: opts.polarity,
    asserterPubkey: OWNER,
    parentHeader: HDR_ASSERT,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), opts.createdAt ?? 1);
  return {
    id: `${opts.bookSlug}-${opts.tagSlug}-${opts.createdAt ?? 1}`,
    pubkey: OWNER,
    sig: "x",
    ...t,
  } as SignedNostrEvent;
}

describe("countOwnAppliedTags — applied pairs (AC-7)", () => {
  it("counts distinct (book, tag) pairs whose latest polarity is +1", () => {
    const n = countOwnAppliedTags([
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 }),
      assertion({ bookSlug: "orbital", tagSlug: "space", polarity: 1 }),
      assertion({ bookSlug: "north-woods", tagSlug: "literary-fiction", polarity: 1 }),
    ]);
    expect(n).toBe(3);
  });

  it("counts the same (book, tag) pair once even when re-applied (latest-wins per pair)", () => {
    const n = countOwnAppliedTags([
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1, createdAt: 1 }),
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1, createdAt: 9 }),
    ]);
    expect(n).toBe(1);
  });

  it("counts the SAME tag on two different books as two pairs", () => {
    const n = countOwnAppliedTags([
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 }),
      assertion({ bookSlug: "north-woods", tagSlug: "literary-fiction", polarity: 1 }),
    ]);
    expect(n).toBe(2);
  });

  it("returns zero for a user with no assertions (true, honest zero)", () => {
    expect(countOwnAppliedTags([])).toBe(0);
  });
});

describe("countOwnAppliedTags — disputes and retractions excluded (AC-7)", () => {
  it("does not count a pair whose latest assertion is a dispute (-1)", () => {
    const n = countOwnAppliedTags([
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1, createdAt: 1 }),
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: -1, createdAt: 9 }),
    ]);
    expect(n).toBe(0);
  });

  it("counts a pair re-applied after a dispute (latest apply wins)", () => {
    const n = countOwnAppliedTags([
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1, createdAt: 1 }),
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: -1, createdAt: 5 }),
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1, createdAt: 9 }),
    ]);
    expect(n).toBe(1);
  });

  it("counts only the still-applied pairs in a mixed set", () => {
    const n = countOwnAppliedTags([
      assertion({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 }), // applied
      assertion({ bookSlug: "orbital", tagSlug: "space", polarity: 1, createdAt: 1 }),
      assertion({ bookSlug: "orbital", tagSlug: "space", polarity: -1, createdAt: 9 }), // disputed away
      assertion({ bookSlug: "north-woods", tagSlug: "nature", polarity: 1 }), // applied
    ]);
    expect(n).toBe(2);
  });
});
