// Story 30 / ADR 0031 §3b (2026-06-01 remediation) — the REAL `GET /api/submissions`
// list endpoint must ENRICH each row with the three server-computed fields the web
// (`CommunitySubmissions.tsx`) renders per row: `canPromote`, `promotionStatus`,
// `signals`. This is the load-bearing test whose ABSENCE let the B1 masking gap
// through: the web tests fed pre-enriched mock rows, so nobody noticed the real
// handler never produced these fields.
//
// All DI-driven (no intra-module vi.mock): the fixture TrustProvider, a fake
// session, a fake injected `readPromotionStatuses` DB seam (the batched
// `WHERE slug = ANY(...)` read), and a fake `query` that returns the submission
// events for the list filter and the rating events for each per-row signals read.
//
// RED until the list handler:
//   (a) computes `canPromote` ONCE per request (same fail-closed houseWeightOf
//       degrade as the promote gate) and stamps the SAME value on every row,
//   (b) reads `promotionStatus` per row from a single batched
//       `readPromotionStatuses(slugs)` map (one call over the page's slugs, NOT N),
//   (c) computes `signals` per row via `computeSubmissionSignals` (honest null).
// The current handler returns only the bare `toSubmission` fields, and there is no
// `readPromotionStatuses` seam in `SubmissionsDeps` — so every assertion below is
// "field undefined / seam missing", not a test bug.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  toBookRecordEvent,
  toBookRatingEvent,
  toWireTemplate,
  buildBookSubmissionsHeaderAddress,
  buildBookRatingsHeaderAddress,
  formatAddress,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import type { NostrFilter } from "../../src/nostr/query";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import {
  buildSubmissionsRouter,
  type SubmissionsDeps,
  type SubmissionsSessionUser,
} from "../../src/routes/submissions";

const KIND = 39999;
const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
// A session user above the curator gate; a user below it.
const ABOVE = "c".repeat(64);
const BELOW = "e".repeat(64);

const SUB_HEADER = formatAddress(buildBookSubmissionsHeaderAddress(LIB));
const RATINGS_HEADER = buildBookRatingsHeaderAddress(LIB);

// Three known slugs so we can pin per-row promotionStatus + signals deterministically.
const SLUG_DONE = "ol-the-done-book";
const SLUG_PENDING = "ol-the-pending-book";
const SLUG_NONE = "ol-the-never-enqueued-book";
const ALL_SLUGS = [SLUG_DONE, SLUG_PENDING, SLUG_NONE];

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    ...over,
  } as unknown as Config;
}

// HOUSE trusts ABOVE at 0.9 (clears 0.5); BELOW absent (weight 0).
function fixtureTrust() {
  return new FixtureTrustProvider({ weights: { [HOUSE]: { [ABOVE]: 0.9 } } });
}

const userAbove: SubmissionsSessionUser = { id: "u1", pubkeyHex: ABOVE, tier: "sovereign" };
const userBelow: SubmissionsSessionUser = { id: "u2", pubkeyHex: BELOW, tier: "sovereign" };

// A submission event with a chosen slug, z-tagged to the book-submissions header
// (so the list query `#z:[SUB_HEADER]` returns it). The submitter is a throwaway key.
function signedSubmission(slug: string, title: string): SignedNostrEvent {
  const sk = generateSecretKey();
  const tmpl = toWireTemplate(
    toBookRecordEvent({
      slug,
      title,
      authorName: "Ada",
      format: "reference" as const,
      source: "community" as const,
      parentHeader: buildBookSubmissionsHeaderAddress(LIB),
    }),
    1_700_000_000,
  );
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

// A rating event from a given secret key, pointed at `39999:<lib>:<slug>` (the
// canonical book address the per-row signals read queries on `#a`).
function signedRating(sk: Uint8Array, slug: string, score: 1 | 2 | 3 | 4 | 5): SignedNostrEvent {
  const bookAddress: DListAddress<39999> = { kind: KIND, pubkey: LIB, dTag: slug };
  const tmpl = toWireTemplate(
    toBookRatingEvent({
      bookSlug: slug,
      bookAddress,
      raterPubkey: asHexPubkey(getPublicKey(sk)),
      score,
      reviewDate: "2026-06-01",
      parentHeader: RATINGS_HEADER,
    }),
    1_700_000_000,
  );
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

// A `query` that dispatches by filter: the list read (`#z:[SUB_HEADER]`) returns
// the submission events; each per-row signals read (`#a:[39999:<lib>:<slug>]`)
// returns that slug's ratings. Anything else → [].
function makeQuery(
  submissions: SignedNostrEvent[],
  ratingsBySlug: Record<string, SignedNostrEvent[]> = {},
) {
  return vi.fn(async (filter: NostrFilter): Promise<SignedNostrEvent[]> => {
    const z = filter["#z"];
    if (z && z.includes(SUB_HEADER)) return submissions;
    const a = filter["#a"];
    if (a) {
      for (const [slug, evs] of Object.entries(ratingsBySlug)) {
        if (a.includes(`${KIND}:${LIB}:${slug}`)) return evs;
      }
      return [];
    }
    return [];
  });
}

type PromotionStatus = "pending" | "promoting" | "done" | "failed";

// The NEW batched DB seam (ADR 0031 §3b) the list handler must consume, mirroring
// `enqueuePromotion`: ONE `WHERE slug = ANY(...)` read → Map<slug, status>. It is
// not yet on `SubmissionsDeps` (that absence IS the contract gap under test), so
// the test extends the deps type locally. This compiles today (seam-missing) AND
// after the Implementer adds it to `SubmissionsDeps` (same name/shape) — the test
// fails on the assertions, not on a typecheck wall.
type ReadPromotionStatuses = (slugs: string[]) => Promise<Map<string, PromotionStatus>>;
type EnrichedDeps = Partial<SubmissionsDeps> & {
  readPromotionStatuses?: ReadPromotionStatuses;
};

function makeApp(over: EnrichedDeps = {}, config: Config = cfg()) {
  // The new batched DB seam (mirrors enqueuePromotion). Default: empty map.
  const readPromotionStatuses = vi.fn(
    async (_slugs: string[]): Promise<Map<string, PromotionStatus>> => new Map(),
  );
  const deps = {
    config,
    sessionUser: vi.fn(async () => userAbove),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: makeQuery([]),
    custodialSign: vi.fn(async () => null),
    trust: fixtureTrust(),
    enqueuePromotion: vi.fn(async () => ({ status: "queued" as const })),
    readPromotionStatuses,
    ...over,
  } as unknown as SubmissionsDeps & {
    readPromotionStatuses: typeof readPromotionStatuses;
    trust: ReturnType<typeof fixtureTrust>;
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildSubmissionsRouter(deps as SubmissionsDeps));
  return { app, deps, readPromotionStatuses };
}

// Three submission rows the list returns.
function threeSubmissions(): SignedNostrEvent[] {
  return [
    signedSubmission(SLUG_DONE, "The Done Book"),
    signedSubmission(SLUG_PENDING, "The Pending Book"),
    signedSubmission(SLUG_NONE, "The Never Enqueued Book"),
  ];
}

describe("GET /api/submissions — canPromote enrichment (USER-level, computed once) (AC-1, AC-3, AC-6)", () => {
  it("above-gate session → canPromote:true, stamped identically on EVERY row", async () => {
    const { app } = makeApp({
      sessionUser: vi.fn(async () => userAbove),
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(3);
    for (const row of res.body.submissions) {
      expect(row.canPromote).toBe(true);
    }
  });

  it("below-gate session → canPromote:false on every row", async () => {
    const { app } = makeApp({
      sessionUser: vi.fn(async () => userBelow),
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    for (const row of res.body.submissions) {
      expect(row.canPromote).toBe(false);
    }
  });

  it("anon (no session) → canPromote:false on every row, still 200", async () => {
    const { app } = makeApp({
      sessionUser: vi.fn(async () => null),
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    for (const row of res.body.submissions) {
      expect(row.canPromote).toBe(false);
    }
  });

  it("canPromote is computed ONCE per request: trust.weights hit once, NOT once-per-row", async () => {
    const trust = fixtureTrust();
    const weightsSpy = vi.spyOn(trust, "weights");
    const { app } = makeApp({
      trust: trust as never,
      sessionUser: vi.fn(async () => userAbove),
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(3);
    // The user-level gate is resolved a single time for the session user, NOT
    // re-queried per row. (Per-row signals reads are a SEPARATE concern; the
    // canPromote weight read over the session user must be exactly one.)
    const gateCalls = weightsSpy.mock.calls.filter(
      ([, targets]) => Array.isArray(targets) && (targets as string[]).includes(ABOVE),
    );
    expect(gateCalls).toHaveLength(1);
  });

  describe("fail-closed degrade → canPromote:false on every row, route still 200 (never 500)", () => {
    it("no trust provider injected", async () => {
      const { app } = makeApp({ trust: undefined, query: makeQuery(threeSubmissions()) });
      const res = await request(app).get("/api/submissions");
      expect(res.status).toBe(200);
      for (const row of res.body.submissions) expect(row.canPromote).toBe(false);
    });

    it("no house observer configured", async () => {
      const { app } = makeApp(
        { query: makeQuery(threeSubmissions()) },
        cfg({ houseObserverPubkey: undefined }),
      );
      const res = await request(app).get("/api/submissions");
      expect(res.status).toBe(200);
      for (const row of res.body.submissions) expect(row.canPromote).toBe(false);
    });

    it("empty weights map", async () => {
      const { app } = makeApp({
        trust: new FixtureTrustProvider({ weights: {} }) as never,
        sessionUser: vi.fn(async () => userAbove),
        query: makeQuery(threeSubmissions()),
      });
      const res = await request(app).get("/api/submissions");
      expect(res.status).toBe(200);
      for (const row of res.body.submissions) expect(row.canPromote).toBe(false);
    });

    it("a THROWING trust seam still 200s with canPromote:false (never a 500)", async () => {
      const throwing = {
        name: "fixture" as const,
        weights: vi.fn(async () => {
          throw new Error("trust backend down");
        }),
        hasScores: vi.fn(async () => false),
        authChallenge: vi.fn(async () => null),
        personalize: vi.fn(async () => false),
      };
      const { app } = makeApp({ trust: throwing as never, query: makeQuery(threeSubmissions()) });
      const res = await request(app).get("/api/submissions");
      expect(res.status).toBe(200);
      for (const row of res.body.submissions) expect(row.canPromote).toBe(false);
    });
  });
});

describe("GET /api/submissions — promotionStatus enrichment (batched, one read) (AC-7)", () => {
  it("each row reflects the injected readPromotionStatuses map; absent slug → null", async () => {
    const statuses = new Map<string, PromotionStatus>([
      [SLUG_DONE, "done"],
      [SLUG_PENDING, "pending"],
      // SLUG_NONE intentionally absent → null
    ]);
    const readPromotionStatuses = vi.fn(async (_slugs: string[]) => statuses);
    const { app } = makeApp({
      readPromotionStatuses,
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    const bySlug: Record<string, unknown> = {};
    for (const row of res.body.submissions) bySlug[row.slug] = row.promotionStatus;
    expect(bySlug[SLUG_DONE]).toBe("done");
    expect(bySlug[SLUG_PENDING]).toBe("pending");
    expect(bySlug[SLUG_NONE] ?? null).toBeNull();
  });

  it("readPromotionStatuses is called ONCE with the BATCH of listed slugs (not N times)", async () => {
    const readPromotionStatuses = vi.fn(
      async (_slugs: string[]): Promise<Map<string, PromotionStatus>> => new Map(),
    );
    const { app } = makeApp({
      readPromotionStatuses,
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    // One batched read, NOT once-per-row.
    expect(readPromotionStatuses).toHaveBeenCalledTimes(1);
    const [slugsArg] = readPromotionStatuses.mock.calls[0] as [string[]];
    expect([...slugsArg].sort()).toEqual([...ALL_SLUGS].sort());
  });

  it("route still 200s when readPromotionStatuses is absent (status degrades to null)", async () => {
    const { app } = makeApp({
      readPromotionStatuses: undefined,
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    for (const row of res.body.submissions) {
      expect(row.promotionStatus ?? null).toBeNull();
    }
  });
});

describe("GET /api/submissions — per-row signals enrichment (computed / honest null) (AC-2, AC-6)", () => {
  it("a row with an above-gate rater carries real computed signals; no raw GrapeRank leaks", async () => {
    const skCurator = generateSecretKey();
    const hexCurator = getPublicKey(skCurator);
    // HOUSE trusts ABOVE (the session gate) AND the curator (the rater) at 0.9.
    const trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [ABOVE]: 0.9, [hexCurator]: 0.9 } },
    });
    const { app } = makeApp({
      trust: trust as never,
      sessionUser: vi.fn(async () => userAbove),
      query: makeQuery(threeSubmissions(), {
        [SLUG_DONE]: [signedRating(skCurator, SLUG_DONE, 4)],
      }),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    const done = res.body.submissions.find((r: { slug: string }) => r.slug === SLUG_DONE);
    expect(done.signals).not.toBeNull();
    expect(done.signals.curatorRatingCount).toBe(1);
    expect(done.signals.curators).toContain(npubEncode(hexCurator));
    expect(done.signals.trustedAverage).toBeCloseTo(4, 5);
    // No raw GrapeRank weight (0.9) on the wire — only counts/identities/average.
    expect(JSON.stringify(done.signals)).not.toContain("0.9");
  });

  it("a row with no trusted rater → signals: null (honest)", async () => {
    const { app } = makeApp({
      sessionUser: vi.fn(async () => userAbove),
      // No ratings for any slug → every row's signals is null.
      query: makeQuery(threeSubmissions()),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    for (const row of res.body.submissions) {
      expect(row.signals ?? null).toBeNull();
    }
  });

  it("trust degrade (no provider) → signals: null on every row, route still 200", async () => {
    const skCurator = generateSecretKey();
    const { app } = makeApp({
      trust: undefined,
      query: makeQuery(threeSubmissions(), {
        [SLUG_DONE]: [signedRating(skCurator, SLUG_DONE, 5)],
      }),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    for (const row of res.body.submissions) {
      expect(row.signals ?? null).toBeNull();
    }
  });
});
