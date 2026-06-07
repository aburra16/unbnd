// Failing tests (red) for Story 32 / ADR 0033 §2 — the verification COUNT-GATE
// (`computeVerification`, a pure helper). A claimant (author) is Verified iff
// ≥ N DISTINCT curators C where: C ≠ author (self-excluded, AC-3) AND
// weight(house, C) ≥ floor AND C's latest polarity for that author is APPLY (+1).
// A latest DISPUTE (-1) drops that curator from the count (symmetric, AC-2/Open
// Q5). Untrusted (zero-weight) volume cannot cross the bar (AC-2). Honest degrade:
// empty weights / no observer / a throwing seam → every count 0 → no one Verified,
// never throws (AC-8). The asserter weights are fetched in ONE batched
// `weights(house, [...distinct curators])` call (no N+1).
//
// All DI-driven: inject the FIXTURE TrustProvider (deterministic), build wire
// AuthorVerifiedAssertion events via the schema. No Brainstorm, no relay, no
// human. No intra-module vi.mock; no Date.now in asserted output. N pinned to a
// fixture value, asserted on both sides.
//
// Red until apps/api/src/author-verified/verify.ts exports `computeVerification`.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  toAuthorVerifiedEvent,
  type AuthorVerifiedAssertion,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import { computeVerification } from "../../src/author-verified/verify";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
// The author/claimant being verified.
const AUTHOR = "a".repeat(64);
// Three curators above the floor, one below, one untrusted (absent from the map).
const CUR1 = "c".repeat(64);
const CUR2 = "d".repeat(64);
const CUR3 = "e".repeat(64);
const CUR_LOW = "f".repeat(64); // weight 0.2, below a 0.5 floor
const CUR_UNTRUSTED = "9".repeat(64); // absent from the weight map → weight 0

const VERIFIED_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIB,
  dTag: "author-verified",
};

const FLOOR = 0.5;

// HOUSE trusts CUR1/CUR2/CUR3 above the floor, CUR_LOW below, AUTHOR above (so we
// can prove self-exclusion is structural, not a weight accident), and does NOT
// trust CUR_UNTRUSTED.
function fixtureTrust() {
  return new FixtureTrustProvider({
    weights: {
      [HOUSE]: {
        [CUR1]: 0.9,
        [CUR2]: 0.8,
        [CUR3]: 0.7,
        [CUR_LOW]: 0.2,
        [AUTHOR]: 0.95,
      },
    },
  });
}

// A wire AuthorVerifiedAssertion: curator signs, author is the #p target.
function verifiedEvent(
  curatorHex: string,
  authorHex: string,
  polarity: 1 | -1,
  createdAt: number,
  slug = "orbital",
): SignedNostrEvent {
  const assertion: AuthorVerifiedAssertion = {
    bookSlug: slug,
    bookAddress: { kind: 39999, pubkey: LIB, dTag: slug },
    authorPubkey: asHexPubkey(authorHex),
    curatorPubkey: asHexPubkey(curatorHex),
    polarity,
    parentHeader: VERIFIED_HEADER,
  };
  const unsigned = toAuthorVerifiedEvent(assertion);
  const tags = [
    ...unsigned.tags.map((t: readonly string[]) => [...t]),
    ["json", JSON.stringify(unsigned.payload)],
  ];
  return {
    id: `${curatorHex.slice(0, 6)}-${authorHex.slice(0, 6)}-${createdAt}`,
    pubkey: curatorHex,
    sig: "x",
    created_at: createdAt,
    kind: 39999,
    tags,
    content: "",
  } as unknown as SignedNostrEvent;
}

// computeVerification(events, claimantHexes, houseObserverHex, floor, N, trust)
//   → Promise<string[]> (the claimant hexes that cleared N).
const N = 2;

describe("computeVerification — count-gate ≥ N (AC-2)", () => {
  it("verifies when ≥ N distinct above-floor curators net-apply", async () => {
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR2, AUTHOR, 1, 11),
    ];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, fixtureTrust());
    expect(out).toEqual([AUTHOR]);
  });

  it("does NOT verify with only N-1 above-floor curators (below the bar)", async () => {
    const events = [verifiedEvent(CUR1, AUTHOR, 1, 10)];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, fixtureTrust());
    expect(out).toEqual([]);
  });

  it("pins behavior on both sides of N: raising N above the curator count un-verifies", async () => {
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR2, AUTHOR, 1, 11),
    ];
    expect(await computeVerification(events, [AUTHOR], HOUSE, FLOOR, 2, fixtureTrust())).toEqual([AUTHOR]);
    expect(await computeVerification(events, [AUTHOR], HOUSE, FLOOR, 3, fixtureTrust())).toEqual([]);
  });
});

describe("computeVerification — self-verification excluded (AC-3)", () => {
  it("the author's own apply assertion does not count toward their own verification", async () => {
    // CUR1 applies + the AUTHOR applies on their own claim. The author's own
    // assertion is excluded, so only 1 valid curator remains → below N=2.
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(AUTHOR, AUTHOR, 1, 11), // self-verify, must not count
    ];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, fixtureTrust());
    expect(out).toEqual([]);
  });

  it("an author cannot self-verify even with a high own weight (exclusion is structural)", async () => {
    // AUTHOR has weight 0.95 in the fixture; counting it would clear N=1, but it
    // must be excluded regardless of weight.
    const events = [verifiedEvent(AUTHOR, AUTHOR, 1, 11)];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, 1, fixtureTrust());
    expect(out).toEqual([]);
  });
});

describe("computeVerification — symmetric dispute lowers the count (AC-2 / Open Q5)", () => {
  it("a curator's latest DISPUTE drops them from the count (was verified, now not)", async () => {
    // CUR1 + CUR2 apply (would clear N=2); then CUR2 disputes later → net 1 apply.
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR2, AUTHOR, 1, 11),
      verifiedEvent(CUR2, AUTHOR, -1, 20), // CUR2 flips to dispute (latest wins)
    ];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, fixtureTrust());
    expect(out).toEqual([]);
  });

  it("latest-per-(curator,author) wins: a later apply re-counts a previously disputing curator", async () => {
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR2, AUTHOR, -1, 11), // dispute
      verifiedEvent(CUR2, AUTHOR, 1, 20), // later apply (latest)
    ];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, fixtureTrust());
    expect(out).toEqual([AUTHOR]);
  });
});

describe("computeVerification — untrusted volume cannot verify (AC-2)", () => {
  it("a below-floor curator does not count toward N", async () => {
    // CUR1 (above) + CUR_LOW (0.2, below 0.5 floor) → only 1 counts → below N=2.
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR_LOW, AUTHOR, 1, 11),
    ];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, fixtureTrust());
    expect(out).toEqual([]);
  });

  it("many zero-weight (untrusted) asserters cannot push a claim over the bar", async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      verifiedEvent(CUR_UNTRUSTED, AUTHOR, 1, 10 + i),
    );
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, 1, fixtureTrust());
    expect(out).toEqual([]);
  });
});

describe("computeVerification — batched weights fetch, no N+1", () => {
  it("fetches asserter weights in exactly ONE weights() call over the union of curators", async () => {
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR2, AUTHOR, 1, 11),
      verifiedEvent(CUR3, AUTHOR, 1, 12),
    ];
    const fixture = fixtureTrust();
    const spy = vi.spyOn(fixture, "weights");
    await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, fixture);
    expect(spy).toHaveBeenCalledTimes(1);
    // The single call carries the distinct curator hexes (batched).
    const [observerArg, targetsArg] = spy.mock.calls[0]!;
    expect(observerArg).toBe(HOUSE);
    const targets = [...(targetsArg as readonly string[])];
    expect(targets).toEqual(expect.arrayContaining([CUR1, CUR2, CUR3]));
  });
});

describe("computeVerification — honest degrade never fabricates verification (AC-8)", () => {
  it("an empty weight map → every weight 0 → no one verified", async () => {
    const empty = new FixtureTrustProvider({ weights: {} });
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR2, AUTHOR, 1, 11),
    ];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, empty);
    expect(out).toEqual([]);
  });

  it("a throwing trust seam degrades to not-verified without throwing", async () => {
    const throwing = {
      name: "fixture" as const,
      weights: vi.fn(async () => {
        throw new Error("trust backend down");
      }),
      hasScores: vi.fn(async () => false),
      followers: vi.fn(async () => new Map()),
      authChallenge: vi.fn(async () => null),
      personalize: vi.fn(async () => false),
    };
    const events = [
      verifiedEvent(CUR1, AUTHOR, 1, 10),
      verifiedEvent(CUR2, AUTHOR, 1, 11),
    ];
    const out = await computeVerification(events, [AUTHOR], HOUSE, FLOOR, N, throwing as never);
    expect(out).toEqual([]);
  });

  it("returns [] for an empty assertion set (no fabricated verification)", async () => {
    const out = await computeVerification([], [AUTHOR], HOUSE, FLOOR, N, fixtureTrust());
    expect(out).toEqual([]);
  });
});
