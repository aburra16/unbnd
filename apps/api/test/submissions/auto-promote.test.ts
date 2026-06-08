// Story 77 / ADR 0075 — the automatic threshold promotion pass. PURE + injected:
// fixture trust, fake query (routed by filter), fake promotions table. FAILING
// until apps/api/src/submissions/auto-promote.ts is implemented (it stubs to []).
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  buildBookRatingsHeaderAddress,
  buildBookSubmissionsHeaderAddress,
  formatAddress,
  toBookRatingEvent,
  toWireTemplate,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import type { PromotionStatus } from "../../src/db";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import { evaluateAutoPromotions, type AutoPromoteDeps } from "../../src/submissions/auto-promote";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
const KIND = 39999;
const SUBMISSIONS_Z = formatAddress(buildBookSubmissionsHeaderAddress(LIB));
const RATINGS_HEADER = buildBookRatingsHeaderAddress(LIB);

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    autoPromoteCuratorCount: 2,
    autoPromoteMinAvg: 4.0,
    ...over,
  } as unknown as Config;
}

/** A minimal submission event — the pass only needs the `d`-tag (the slug). */
function submissionEvent(slug: string): SignedNostrEvent {
  return {
    id: `sub-${slug}`,
    pubkey: "c".repeat(64),
    sig: "x",
    kind: KIND,
    created_at: 1_700_000_000,
    tags: [["d", slug], ["z", SUBMISSIONS_Z]],
    content: "",
  } as SignedNostrEvent;
}

function rating(slug: string, sk: Uint8Array, score: 1 | 2 | 3 | 4 | 5): SignedNostrEvent {
  const tmpl = toWireTemplate(
    toBookRatingEvent({
      bookSlug: slug,
      bookAddress: { kind: KIND, pubkey: LIB, dTag: slug } as DListAddress<39999>,
      raterPubkey: asHexPubkey(getPublicKey(sk)),
      score,
      reviewDate: "2026-06-01",
      parentHeader: RATINGS_HEADER,
    }),
    1_700_000_000,
  );
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

/** Route the query by filter: `#z` → submissions; `#a` → that slug's ratings. */
function makeQuery(subs: SignedNostrEvent[], ratingsBySlug: Record<string, SignedNostrEvent[]>) {
  return vi.fn(async (filter: Record<string, unknown>) => {
    if (filter["#z"]) return subs;
    const a = (filter["#a"] as string[] | undefined)?.[0] ?? "";
    const slug = a.split(":")[2] ?? "";
    return ratingsBySlug[slug] ?? [];
  });
}

function makeDeps(over: Partial<AutoPromoteDeps> = {}): {
  deps: AutoPromoteDeps;
  enqueue: ReturnType<typeof vi.fn>;
} {
  const enqueue = vi.fn(async () => ({ status: "queued" as const }));
  const deps: AutoPromoteDeps = {
    config: cfg(),
    query: vi.fn(async () => []),
    trust: new FixtureTrustProvider({ weights: {} }),
    readPromotionStatuses: vi.fn(async () => new Map<string, PromotionStatus>()),
    enqueuePromotion: enqueue,
    ...over,
  };
  return { deps, enqueue };
}

describe("evaluateAutoPromotions — threshold crossing (AC-1/AC-3/AC-5)", () => {
  it("enqueues a submission with enough above-gate curators and a positive average", async () => {
    const a = generateSecretKey();
    const b = generateSecretKey();
    const trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [getPublicKey(a)]: 0.9, [getPublicKey(b)]: 0.8 } },
    });
    const { deps, enqueue } = makeDeps({
      trust,
      query: makeQuery([submissionEvent("gem")], { gem: [rating("gem", a, 5), rating("gem", b, 4)] }),
    });
    const { enqueued } = await evaluateAutoPromotions(deps);
    expect(enqueued).toEqual(["gem"]);
    // requestedBy is the librarian (the system actor for auto-promotions).
    expect(enqueue).toHaveBeenCalledWith("gem", LIB);
  });

  it("does not enqueue below the curator count", async () => {
    const a = generateSecretKey();
    const trust = new FixtureTrustProvider({ weights: { [HOUSE]: { [getPublicKey(a)]: 0.9 } } });
    const { deps, enqueue } = makeDeps({
      // count default 2; only ONE above-gate curator.
      trust,
      query: makeQuery([submissionEvent("thin")], { thin: [rating("thin", a, 5)] }),
    });
    const { enqueued } = await evaluateAutoPromotions(deps);
    expect(enqueued).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not enqueue when the trusted average is below the floor (panned book)", async () => {
    const a = generateSecretKey();
    const b = generateSecretKey();
    const trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [getPublicKey(a)]: 0.9, [getPublicKey(b)]: 0.9 } },
    });
    const { deps, enqueue } = makeDeps({
      // two above-gate curators, but they rate it 1 and 2 → avg 1.5 < 4.0.
      trust,
      query: makeQuery([submissionEvent("panned")], { panned: [rating("panned", a, 1), rating("panned", b, 2)] }),
    });
    const { enqueued } = await evaluateAutoPromotions(deps);
    expect(enqueued).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("below-gate raters do not count toward the threshold", async () => {
    const trusted = generateSecretKey();
    const crowd1 = generateSecretKey();
    const crowd2 = generateSecretKey();
    // Only `trusted` clears the gate; the crowd is weight 0.
    const trust = new FixtureTrustProvider({ weights: { [HOUSE]: { [getPublicKey(trusted)]: 0.9 } } });
    const { deps, enqueue } = makeDeps({
      trust,
      query: makeQuery([submissionEvent("hyped")], {
        hyped: [rating("hyped", trusted, 5), rating("hyped", crowd1, 5), rating("hyped", crowd2, 5)],
      }),
    });
    const { enqueued } = await evaluateAutoPromotions(deps);
    expect(enqueued).toEqual([]); // 1 above-gate < count 2, despite a 5-star crowd
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("evaluateAutoPromotions — idempotency + off switch", () => {
  it("skips a submission already in the promotions table", async () => {
    const a = generateSecretKey();
    const b = generateSecretKey();
    const trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [getPublicKey(a)]: 0.9, [getPublicKey(b)]: 0.9 } },
    });
    const { deps, enqueue } = makeDeps({
      trust,
      query: makeQuery([submissionEvent("already")], { already: [rating("already", a, 5), rating("already", b, 5)] }),
      readPromotionStatuses: vi.fn(async () => new Map([["already", "done" as PromotionStatus]])),
    });
    const { enqueued } = await evaluateAutoPromotions(deps);
    expect(enqueued).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("off switch: autoPromoteCuratorCount 0 enqueues nothing", async () => {
    const a = generateSecretKey();
    const b = generateSecretKey();
    const trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [getPublicKey(a)]: 0.9, [getPublicKey(b)]: 0.9 } },
    });
    const { deps, enqueue } = makeDeps({
      config: cfg({ autoPromoteCuratorCount: 0 }),
      trust,
      query: makeQuery([submissionEvent("gem")], { gem: [rating("gem", a, 5), rating("gem", b, 5)] }),
    });
    const { enqueued } = await evaluateAutoPromotions(deps);
    expect(enqueued).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
