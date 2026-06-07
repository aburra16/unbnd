// Story 30 / ADR 0031 §3 — per-submission trust SIGNALS (read). Decision
// support surfaced on a submission from the HOUSE observer's vantage:
//   - curatorRatingCount: raters at/above the gate
//   - curatorTagCount: tag-asserters at/above the gate
//   - trustedAverage: the trust-WEIGHTED average (weightedRatings, ADR 0025), not raw
//   - curators: the distinct above-gate identities as NPUBS (web resolves npub→name)
// Honest degrade (AC-6): no above-threshold curators / trust unavailable →
// `signals: null` ("no trusted signal yet"). No raw GrapeRank numbers leak.
//
// RED until the route gains `GET /api/submissions/:slug/signals` (or the signal
// helper) + the `trust` dep. DI-driven, fixture trust, no relay.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  toBookRatingEvent,
  toWireTemplate,
  buildBookRatingsHeaderAddress,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import {
  buildSubmissionsRouter,
  type SubmissionsDeps,
} from "../../src/routes/submissions";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
const SLUG = "some-submitted-book";
// The submission's canonical book address (the `a`-tag ratings point at).
const BOOK_ADDRESS: DListAddress<39999> = { kind: 39999, pubkey: LIB, dTag: SLUG };
const RATINGS_HEADER = buildBookRatingsHeaderAddress(LIB);

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    ...over,
  } as unknown as Config;
}

// Sign a rating event from a given secret key, score, so the event's author hex
// is the rater (matches how the ratings route reads `event.pubkey`).
function signedRating(sk: Uint8Array, score: 1 | 2 | 3 | 4 | 5): SignedNostrEvent {
  const tmpl = toWireTemplate(
    toBookRatingEvent({
      bookSlug: SLUG,
      bookAddress: BOOK_ADDRESS,
      raterPubkey: asHexPubkey(getPublicKey(sk)),
      score,
      reviewDate: "2026-06-01",
      parentHeader: RATINGS_HEADER,
    }),
    1_700_000_000,
  );
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

function makeApp(over: Partial<SubmissionsDeps> = {}, config: Config = cfg()) {
  const deps = {
    config,
    sessionUser: vi.fn(async () => null),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => [] as SignedNostrEvent[]),
    custodialSign: vi.fn(async () => null),
    trust: new FixtureTrustProvider({ weights: {} }),
    enqueuePromotion: vi.fn(async () => ({ status: "queued" as const })),
    ...over,
  } as unknown as SubmissionsDeps;
  const app = express();
  app.use(express.json());
  app.use("/", buildSubmissionsRouter(deps as SubmissionsDeps));
  return { app, deps };
}

describe("GET /api/submissions/:slug/signals — above-threshold curator signals (AC-2)", () => {
  it("surfaces curator rating COUNT, IDENTITIES (npubs), and the trust-WEIGHTED average", async () => {
    const skAbove = generateSecretKey();
    const skBelow = generateSecretKey();
    const hexAbove = getPublicKey(skAbove);
    const hexBelow = getPublicKey(skBelow);

    // HOUSE trusts ABOVE at 0.9 (clears 0.5); BELOW absent (weight 0).
    const trust = new FixtureTrustProvider({ weights: { [HOUSE]: { [hexAbove]: 0.9 } } });

    const ratings = [signedRating(skAbove, 4), signedRating(skBelow, 2)];
    const { app } = makeApp({
      trust,
      query: vi.fn(async () => ratings),
    });

    const res = await request(app).get(`/api/submissions/${SLUG}/signals`);
    expect(res.status).toBe(200);
    expect(res.body.signals).not.toBeNull();
    // Only the above-gate rater is counted.
    expect(res.body.signals.curatorRatingCount).toBe(1);
    // Identity is the above-gate curator's NPUB (npub-out at the boundary).
    expect(res.body.signals.curators).toContain(npubEncode(hexAbove));
    expect(res.body.signals.curators).not.toContain(npubEncode(hexBelow));
    // Trust-weighted average is the above-gate rater's score (the only trusted one).
    expect(res.body.signals.trustedAverage).toBeCloseTo(4, 5);
  });

  it("never leaks a raw GrapeRank number in the signals payload", async () => {
    const skAbove = generateSecretKey();
    const trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [getPublicKey(skAbove)]: 0.9 } },
    });
    const { app } = makeApp({ trust, query: vi.fn(async () => [signedRating(skAbove, 5)]) });
    const res = await request(app).get(`/api/submissions/${SLUG}/signals`);
    // The weight (0.9) must not appear as a surfaced field; only counts +
    // identities + the weighted AVERAGE (a rating-scale number) are honest.
    const json = JSON.stringify(res.body.signals);
    expect(json).not.toContain("0.9");
  });
});

describe("GET /api/submissions/:slug/signals — honest degrade (AC-6)", () => {
  it("no above-threshold curators → signals: null (no trusted signal yet)", async () => {
    const skBelow = generateSecretKey();
    // HOUSE trusts nobody over our keys.
    const { app } = makeApp({
      trust: new FixtureTrustProvider({ weights: {} }),
      query: vi.fn(async () => [signedRating(skBelow, 3)]),
    });
    const res = await request(app).get(`/api/submissions/${SLUG}/signals`);
    expect(res.status).toBe(200);
    expect(res.body.signals).toBeNull();
  });

  it("trust provider absent → signals: null, never a fabricated count", async () => {
    const sk = generateSecretKey();
    const { app } = makeApp({ trust: undefined, query: vi.fn(async () => [signedRating(sk, 5)]) });
    const res = await request(app).get(`/api/submissions/${SLUG}/signals`);
    expect(res.status).toBe(200);
    expect(res.body.signals).toBeNull();
  });

  it("no house observer configured → signals: null", async () => {
    const sk = generateSecretKey();
    const { app } = makeApp(
      {
        trust: new FixtureTrustProvider({ weights: { [HOUSE]: { [getPublicKey(sk)]: 0.9 } } }),
        query: vi.fn(async () => [signedRating(sk, 5)]),
      },
      cfg({ houseObserverPubkey: undefined }),
    );
    const res = await request(app).get(`/api/submissions/${SLUG}/signals`);
    expect(res.status).toBe(200);
    expect(res.body.signals).toBeNull();
  });

  it("a throwing trust seam degrades to signals: null without a 500", async () => {
    const sk = generateSecretKey();
    const throwing = {
      name: "fixture" as const,
      weights: vi.fn(async () => {
        throw new Error("down");
      }),
      hasScores: vi.fn(async () => false),
      followers: vi.fn(async () => new Map()),
      authChallenge: vi.fn(async () => null),
      personalize: vi.fn(async () => false),
    };
    const { app } = makeApp({ trust: throwing as never, query: vi.fn(async () => [signedRating(sk, 5)]) });
    const res = await request(app).get(`/api/submissions/${SLUG}/signals`);
    expect(res.status).toBe(200);
    expect(res.body.signals).toBeNull();
  });
});

describe("GET /api/submissions/:slug/signals — configurable threshold drives the curator set (AC-5)", () => {
  it("lowering the threshold pulls a mid-weight rater into the curator count", async () => {
    const skMid = generateSecretKey();
    const hexMid = getPublicKey(skMid);
    const trust = new FixtureTrustProvider({ weights: { [HOUSE]: { [hexMid]: 0.4 } } });
    const ratings = [signedRating(skMid, 5)];

    const high = makeApp({ trust, query: vi.fn(async () => ratings) }, cfg({ curatorThreshold: 0.7 }));
    const resHigh = await request(high.app).get(`/api/submissions/${SLUG}/signals`);
    expect(resHigh.body.signals).toBeNull(); // 0.4 < 0.7 → no curator

    const low = makeApp({ trust, query: vi.fn(async () => ratings) }, cfg({ curatorThreshold: 0.3 }));
    const resLow = await request(low.app).get(`/api/submissions/${SLUG}/signals`);
    expect(resLow.body.signals.curatorRatingCount).toBe(1); // 0.4 ≥ 0.3 → counted
    expect(resLow.body.signals.curators).toContain(npubEncode(hexMid));
  });
});
