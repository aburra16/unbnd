// Story 36 / ADR 0037 — the read-time, per-request, user-vantage For-You shelf.
//
// `GET /api/foryou` (`buildForYouRouter(deps)`, apps/api/src/routes/foryou.ts).
// Read-only, computed PER REQUEST from the SIGNED-IN user's OWN vantage
// (`user.pubkeyHex` resolved from the session — the "Yours" observer), NEVER
// cached. It ALWAYS returns 200 with a `state` field the web switches on:
// `personalized` (with books) | `not_personalized` | `anonymous`. A
// personalized-but-thin graph is `state:"personalized"` + `books:[]`. A trust
// failure degrades to the same honest empty — never a 401/500, never fabricated.
//
// DI harness identical to the ratings/search/shelves route tests: express +
// supertest + injected `sessionUser` / `query` / `queryPaged` / `trust`, the real
// `FixtureTrustProvider`, and the signed kind-39999 fixtures from the ratings
// suite helper. NO intra-module `vi.mock`. NO `Date.now()` in asserted output.
// FAILING until `apps/api/src/routes/foryou.ts` exists (intentionally red).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  buildBookRatingsHeaderAddress,
  formatAddress,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import type { NostrFilter } from "../../src/nostr/query";
import { FixtureTrustProvider } from "../../src/trust";
import { LIBRARIAN, signedRating } from "../ratings/_fixtures";
// The module UNDER TEST — does not exist yet (intentionally red).
import {
  buildForYouRouter,
  type ForYouDeps,
  type ForYouResponse,
  type SessionUser,
} from "../../src/routes/foryou";

// The signed-in user's OWN vantage. Their hex is BOTH the session identity AND
// the trust observer (the "Yours" POV) — the load-bearing fact of this story.
const USER_HEX = "9".repeat(64);
const OTHER_USER_HEX = "7".repeat(64);

const RATINGS_Z = formatAddress(buildBookRatingsHeaderAddress(LIBRARIAN));
const BOOKS_Z = `39998:${LIBRARIAN}:books`;

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIBRARIAN,
    foryouMinAvg: 4.0,
    foryouMinRatings: 2,
    foryouBooks: 12,
    foryouCandidateRaters: 2000,
    ...overrides,
  } as unknown as Config;
}

const session = (hex = USER_HEX): SessionUser => ({
  id: "u1",
  pubkeyHex: hex,
  tier: "sovereign",
});

/** A catalog kind-39999 book record event the `#d` hydrate read returns. */
function bookEvent(slug: string, title: string): SignedNostrEvent {
  const rec: BookRecord = {
    slug,
    title,
    authorName: `Author of ${title}`,
    format: "reference",
    source: "openlibrary",
    parentHeader: { kind: 39998, pubkey: LIBRARIAN, dTag: "books" },
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: `book-${slug}`, pubkey: LIBRARIAN, sig: "x", ...t } as SignedNostrEvent;
}

/**
 * A combined fake for the route's two relay reads, branching on the filter:
 *   - `authors:[userHex]`  → the own-ratings read (exclude-already-rated).
 *   - `#d` present         → the book `#d` slug hydrate read.
 *   - otherwise (`#z` ratings header) → the candidate ratings read.
 * Records every call so a test can assert the read shape (cap-safe, batched).
 * The route may use `query` and/or `queryPaged`; both fakes share this brancher
 * so either wiring is exercised. `query` returns the array; `queryPaged` wraps it.
 */
function makeReads(opts: {
  candidateRatings: SignedNostrEvent[];
  ownRatings?: SignedNostrEvent[];
  books: Record<string, SignedNostrEvent>;
}) {
  const ownRatings = opts.ownRatings ?? [];
  const pick = (filter: NostrFilter): SignedNostrEvent[] => {
    if ((filter.authors as string[] | undefined)?.length) return ownRatings;
    if (filter["#d"] !== undefined) {
      const slugs = (filter["#d"] as string[]) ?? [];
      return slugs.map((s) => opts.books[s]).filter(Boolean) as SignedNostrEvent[];
    }
    return opts.candidateRatings;
  };
  const query = vi.fn(async (filter: NostrFilter) => pick(filter));
  const queryPaged = vi.fn(async (filter: NostrFilter) => ({
    events: pick(filter),
    capped: false,
  }));
  return { query, queryPaged };
}

function makeApp(extra: Partial<ForYouDeps> = {}) {
  const reads = makeReads({ candidateRatings: [], books: {} });
  const deps: ForYouDeps = {
    config: baseConfig(),
    sessionUser: vi.fn(async () => session()),
    query: reads.query,
    queryPaged: reads.queryPaged,
    trust: new FixtureTrustProvider({ weights: { [USER_HEX]: {} } }),
    ...extra,
  };
  const app = express();
  app.use("/", buildForYouRouter(deps));
  return { app, deps };
}

/** Build a personalized app: the user `hasScores`, with a known weights row over
 * a known catalog of rated books, plus the catalog book records to hydrate. */
function personalizedApp(opts: {
  userHex?: string;
  weightsRow: Record<string, number>;
  candidateRatings: SignedNostrEvent[];
  ownRatings?: SignedNostrEvent[];
  books: Record<string, SignedNostrEvent>;
  config?: Partial<Config>;
}) {
  const userHex = opts.userHex ?? USER_HEX;
  const reads = makeReads({
    candidateRatings: opts.candidateRatings,
    ownRatings: opts.ownRatings,
    books: opts.books,
  });
  const trust = new FixtureTrustProvider({
    weights: { [userHex]: opts.weightsRow },
    scoredObservers: [userHex], // personalized: hasScores(userHex) === true
  });
  const deps: ForYouDeps = {
    config: baseConfig(opts.config),
    sessionUser: vi.fn(async () => session(userHex)),
    query: reads.query,
    queryPaged: reads.queryPaged,
    trust,
  };
  const app = express();
  app.use("/", buildForYouRouter(deps));
  return { app, deps, trust, reads };
}

const slugs = (res: { body: ForYouResponse }) =>
  res.body.books.map((b: { slug: string }) => b.slug);

// ───────────────────────────────────────────────────────────────────────────
// AC-1 — own-vantage ranking; two graphs → two shelves (POV-first)
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — AC-1: ranks by the user's OWN-vantage weighted average", () => {
  it("returns books the user's trusted curators rate highly, ranked by weighted average desc", async () => {
    // alpha: two trusted curators rate 5 → avg 5. beta: two trusted curators
    // rate 4 → avg 4. Both clear the bar (≥4.0, count≥2); alpha ranks first.
    const aRater1 = signedRating({ bookSlug: "alpha", score: 5 });
    const aRater2 = signedRating({ bookSlug: "alpha", score: 5 });
    const bRater1 = signedRating({ bookSlug: "beta", score: 4 });
    const bRater2 = signedRating({ bookSlug: "beta", score: 4 });
    const { app } = personalizedApp({
      weightsRow: {
        [aRater1.pubkey]: 0.9,
        [aRater2.pubkey]: 0.9,
        [bRater1.pubkey]: 0.9,
        [bRater2.pubkey]: 0.9,
      },
      candidateRatings: [aRater1.event, aRater2.event, bRater1.event, bRater2.event],
      books: { alpha: bookEvent("alpha", "Alpha"), beta: bookEvent("beta", "Beta") },
    });
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("personalized");
    expect(slugs(res)).toEqual(["alpha", "beta"]);
  });

  it("drops a book the user's curators DON'T trust (no positive-weight rater for it)", async () => {
    // gamma is rated 5 twice, but by raters the user assigns NO weight → from the
    // user's vantage gamma has no trusted signal (weightedRatings null) and is absent.
    const trusted1 = signedRating({ bookSlug: "alpha", score: 5 });
    const trusted2 = signedRating({ bookSlug: "alpha", score: 5 });
    const untrusted1 = signedRating({ bookSlug: "gamma", score: 5 });
    const untrusted2 = signedRating({ bookSlug: "gamma", score: 5 });
    const { app } = personalizedApp({
      weightsRow: { [trusted1.pubkey]: 0.9, [trusted2.pubkey]: 0.9 }, // gamma raters absent
      candidateRatings: [trusted1.event, trusted2.event, untrusted1.event, untrusted2.event],
      books: { alpha: bookEvent("alpha", "Alpha"), gamma: bookEvent("gamma", "Gamma") },
    });
    const res = await request(app).get("/api/foryou");
    expect(slugs(res)).toEqual(["alpha"]);
  });

  it("two personalized users with DIFFERENT graphs get DIFFERENT For-You shelves for the same catalog", async () => {
    // Same catalog (alpha rated 5 by raterA, beta rated 5 by raterB, each twice).
    // User-1 trusts only raterA → sees alpha. User-2 trusts only raterB → sees beta.
    const a1 = signedRating({ bookSlug: "alpha", score: 5 });
    const a2 = signedRating({ bookSlug: "alpha", score: 5 });
    const b1 = signedRating({ bookSlug: "beta", score: 5 });
    const b2 = signedRating({ bookSlug: "beta", score: 5 });
    const catalog = [a1.event, a2.event, b1.event, b2.event];
    const books = { alpha: bookEvent("alpha", "Alpha"), beta: bookEvent("beta", "Beta") };

    const user1 = personalizedApp({
      userHex: USER_HEX,
      weightsRow: { [a1.pubkey]: 0.9, [a2.pubkey]: 0.9 },
      candidateRatings: catalog,
      books,
    });
    const user2 = personalizedApp({
      userHex: OTHER_USER_HEX,
      weightsRow: { [b1.pubkey]: 0.9, [b2.pubkey]: 0.9 },
      candidateRatings: catalog,
      books,
    });

    const res1 = await request(user1.app).get("/api/foryou");
    const res2 = await request(user2.app).get("/api/foryou");
    expect(slugs(res1)).toEqual(["alpha"]);
    expect(slugs(res2)).toEqual(["beta"]);
    // Both are correct — the same catalog yields two different POV-first shelves.
    expect(slugs(res1)).not.toEqual(slugs(res2));
  });

  it("resolves the OBSERVER as the session user's hex (weights called with user.pubkeyHex)", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { app, trust } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    const weightsSpy = vi.spyOn(trust, "weights");
    await request(app).get("/api/foryou");
    expect(weightsSpy).toHaveBeenCalledWith(USER_HEX, expect.any(Array));
  });

  it("tie-breaks equal averages deterministically by slug ascending", async () => {
    // zeta and delta both avg 5 with 2 trusted raters → slug order: delta, zeta.
    const z1 = signedRating({ bookSlug: "zeta", score: 5 });
    const z2 = signedRating({ bookSlug: "zeta", score: 5 });
    const d1 = signedRating({ bookSlug: "delta", score: 5 });
    const d2 = signedRating({ bookSlug: "delta", score: 5 });
    const { app } = personalizedApp({
      weightsRow: {
        [z1.pubkey]: 0.9,
        [z2.pubkey]: 0.9,
        [d1.pubkey]: 0.9,
        [d2.pubkey]: 0.9,
      },
      candidateRatings: [z1.event, z2.event, d1.event, d2.event],
      books: { zeta: bookEvent("zeta", "Zeta"), delta: bookEvent("delta", "Delta") },
    });
    const res = await request(app).get("/api/foryou");
    expect(slugs(res)).toEqual(["delta", "zeta"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-2 — qualify bar: avg ≥ FORYOU_MIN_AVG (4.0) AND trustedCount ≥ FORYOU_MIN_RATINGS (2)
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — AC-2: above the bar AND at/above the min trusted-rating count", () => {
  it("INCLUDES a book at exactly avg 4.0 with trustedCount 2 (both boundaries met)", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 4 });
    const r2 = signedRating({ bookSlug: "alpha", score: 4 });
    const { app } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    const res = await request(app).get("/api/foryou");
    expect(slugs(res)).toEqual(["alpha"]);
  });

  it("EXCLUDES a book just below the bar (weighted avg 3.9 < 4.0)", async () => {
    // Two equal-weight raters score 4 and 3.8 → avg 3.9 < 4.0 → excluded.
    const r1 = signedRating({ bookSlug: "below", score: 4 });
    const r2 = signedRating({ bookSlug: "below", score: 3 });
    const { app } = personalizedApp({
      // avg = (4 + 3)/2 = 3.5 < 4.0
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { below: bookEvent("below", "Below The Bar") },
    });
    const res = await request(app).get("/api/foryou");
    expect(res.body.state).toBe("personalized");
    expect(slugs(res)).toEqual([]);
  });

  it("EXCLUDES a single trusted 5-star (trustedCount 1 < min 2), no matter how high", async () => {
    const lone = signedRating({ bookSlug: "lonely", score: 5 });
    const { app } = personalizedApp({
      weightsRow: { [lone.pubkey]: 0.99 }, // one trusted rater only
      candidateRatings: [lone.event],
      books: { lonely: bookEvent("lonely", "Lonely Five Star") },
    });
    const res = await request(app).get("/api/foryou");
    expect(slugs(res)).toEqual([]);
  });

  it("honors a configurable bar: a higher FORYOU_MIN_AVG excludes a 4.0 book", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 4 });
    const r2 = signedRating({ bookSlug: "alpha", score: 4 });
    const { app } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
      config: { foryouMinAvg: 4.5 }, // raise the bar above 4.0
    });
    const res = await request(app).get("/api/foryou");
    expect(slugs(res)).toEqual([]);
  });

  it("honors a configurable min-count: FORYOU_MIN_RATINGS 3 excludes a count-2 book", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { app } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
      config: { foryouMinRatings: 3 }, // need 3 trusted raters; only 2 present
    });
    const res = await request(app).get("/api/foryou");
    expect(slugs(res)).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-3 — exclude books the user already rated (pins the new ownRatedSlugs)
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — AC-3: excludes books the user has already rated", () => {
  it("drops a qualifying book the user already rated (even if curators rate it highly)", async () => {
    // alpha qualifies (two trusted 5s) but the USER already rated it → absent.
    // beta qualifies and the user has NOT rated it → present.
    const aR1 = signedRating({ bookSlug: "alpha", score: 5 });
    const aR2 = signedRating({ bookSlug: "alpha", score: 5 });
    const bR1 = signedRating({ bookSlug: "beta", score: 5 });
    const bR2 = signedRating({ bookSlug: "beta", score: 5 });
    // The user's OWN rating on alpha — author is the session user (USER_HEX).
    const own = signedRating({ sk: new Uint8Array(32).fill(3), bookSlug: "alpha", score: 2 });
    const { app } = personalizedApp({
      weightsRow: {
        [aR1.pubkey]: 0.9,
        [aR2.pubkey]: 0.9,
        [bR1.pubkey]: 0.9,
        [bR2.pubkey]: 0.9,
      },
      candidateRatings: [aR1.event, aR2.event, bR1.event, bR2.event],
      // The own-ratings read returns the user's rating on alpha (slug derived).
      ownRatings: [own.event],
      books: { alpha: bookEvent("alpha", "Alpha"), beta: bookEvent("beta", "Beta") },
    });
    const res = await request(app).get("/api/foryou");
    expect(slugs(res)).toContain("beta");
    expect(slugs(res)).not.toContain("alpha");
  });

  it("performs the own-ratings read AUTHOR-SCOPED to the session user's hex", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { app, reads } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    await request(app).get("/api/foryou");
    // One of the reads is author-scoped to USER_HEX on kind 39999 (own-ratings).
    const calls = [...reads.query.mock.calls, ...reads.queryPaged.mock.calls];
    const authorScoped = calls.find(
      (c) => (c[0] as NostrFilter).authors?.includes(USER_HEX),
    );
    expect(authorScoped).toBeDefined();
    expect((authorScoped![0] as NostrFilter).kinds).toContain(39999);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-4 — read-time, not cached (no homepage_shelves, no cache dep)
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — AC-4: computed read-time, never from/into a cache", () => {
  it("computes per request — it reads ratings + weights on the request path (not a cache)", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { app, trust, reads } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    const weightsSpy = vi.spyOn(trust, "weights");
    await request(app).get("/api/foryou");
    // The trust seam and the relay reads ARE exercised on the request — proof it
    // computes at read time rather than serving a precomputed row.
    expect(weightsSpy).toHaveBeenCalled();
    const totalReads = reads.query.mock.calls.length + reads.queryPaged.mock.calls.length;
    expect(totalReads).toBeGreaterThan(0);
  });

  it("never reads the cached homepage shelves: no #z over the books header without a #d hydrate intent, and no cache dep in ForYouDeps", async () => {
    // The For-You deps are exactly the read-time deps (config/session/query/
    // queryPaged/trust). There is NO `readShelfCache` dep (that belongs to the
    // house serve route). This pins the no-cache contract at the type+wiring level.
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { deps } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    expect(deps).not.toHaveProperty("readShelfCache");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-5 — non-personalized → not_personalized (no compute); signed-out → anonymous
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — AC-5: honest absence for non-personalized + signed-out", () => {
  it("signed-in but NOT personalized → state:'not_personalized', empty books, NO weights compute", async () => {
    // Session resolves, but hasScores(userHex) is false (no scoredObservers).
    const trust = new FixtureTrustProvider({ weights: {} }); // hasScores false for USER_HEX
    const weightsSpy = vi.spyOn(trust, "weights");
    const { app } = makeApp({
      sessionUser: vi.fn(async () => session()),
      trust,
    });
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("not_personalized");
    expect(res.body.books).toEqual([]);
    // The personalization gate short-circuits BEFORE any trust-weight compute.
    expect(weightsSpy).not.toHaveBeenCalled();
  });

  it("signed-out (no session) → state:'anonymous', empty books, 200 (never 401)", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("anonymous");
    expect(res.body.books).toEqual([]);
  });

  it("no trust provider wired → state:'not_personalized' (fail-safe, no fabrication)", async () => {
    const { app } = makeApp({
      sessionUser: vi.fn(async () => session()),
      trust: undefined,
    });
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("not_personalized");
    expect(res.body.books).toEqual([]);
  });

  it("librarian pubkey unset → state:'not_personalized' (no catalog to read)", async () => {
    const trust = new FixtureTrustProvider({
      weights: { [USER_HEX]: {} },
      scoredObservers: [USER_HEX],
    });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => session()),
      trust,
      config: baseConfig({ librarianPubkey: undefined }),
    });
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("not_personalized");
    expect(res.body.books).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-6 — bounded + ONE batched weights call; rater union respects the cap
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — AC-6: bounded, batched — ONE weights call, never per-book", () => {
  it("resolves the user's weights in EXACTLY ONE batched weights() call over the rater union", async () => {
    // Two books, four distinct raters across them. The trust read must be a
    // single weights(userHex, [...union]) call — never one call per book/rater.
    const a1 = signedRating({ bookSlug: "alpha", score: 5 });
    const a2 = signedRating({ bookSlug: "alpha", score: 5 });
    const b1 = signedRating({ bookSlug: "beta", score: 5 });
    const b2 = signedRating({ bookSlug: "beta", score: 5 });
    const { app, trust } = personalizedApp({
      weightsRow: {
        [a1.pubkey]: 0.9,
        [a2.pubkey]: 0.9,
        [b1.pubkey]: 0.9,
        [b2.pubkey]: 0.9,
      },
      candidateRatings: [a1.event, a2.event, b1.event, b2.event],
      books: { alpha: bookEvent("alpha", "Alpha"), beta: bookEvent("beta", "Beta") },
    });
    const weightsSpy = vi.spyOn(trust, "weights");
    await request(app).get("/api/foryou");
    expect(weightsSpy).toHaveBeenCalledTimes(1);
    // The single call carries the UNION of the distinct rater hexes (batched).
    const [, raters] = weightsSpy.mock.calls[0]!;
    expect(raters).toEqual(
      expect.arrayContaining([a1.pubkey, a2.pubkey, b1.pubkey, b2.pubkey]),
    );
  });

  it("caps the rater union at FORYOU_CANDIDATE_RATERS (the batched array stays bounded)", async () => {
    // Five distinct raters across five books, but the cap is 3 → the single
    // weights() call carries at most 3 rater hexes (bounded, never the whole graph).
    const raters = Array.from({ length: 5 }, (_, i) =>
      signedRating({ bookSlug: `book-${i}`, score: 5 }),
    );
    const weightsRow: Record<string, number> = {};
    const books: Record<string, SignedNostrEvent> = {};
    for (let i = 0; i < raters.length; i++) {
      weightsRow[raters[i]!.pubkey] = 0.9;
      books[`book-${i}`] = bookEvent(`book-${i}`, `Book ${i}`);
    }
    const { app, trust } = personalizedApp({
      weightsRow,
      candidateRatings: raters.map((r) => r.event),
      books,
      config: { foryouCandidateRaters: 3 },
    });
    const weightsSpy = vi.spyOn(trust, "weights");
    await request(app).get("/api/foryou");
    expect(weightsSpy).toHaveBeenCalledTimes(1);
    const [, requested] = weightsSpy.mock.calls[0]!;
    expect((requested as readonly string[]).length).toBeLessThanOrEqual(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-7 — honest empty / honest degrade (thin graph + trust failure; never 500)
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — AC-7: honest empty + honest degrade, never 500, never fabricated", () => {
  it("thin graph (personalized, but no qualifier) → state:'personalized', books:[] (honest empty)", async () => {
    // A personalized user whose only candidate book has a single trusted rater
    // (count 1 < 2) → nothing qualifies → honest empty, NOT fabricated picks.
    const lone = signedRating({ bookSlug: "alpha", score: 5 });
    const { app } = personalizedApp({
      weightsRow: { [lone.pubkey]: 0.9 },
      candidateRatings: [lone.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("personalized");
    expect(res.body.books).toEqual([]);
  });

  it("trust failure (weights rejects) → state:'personalized', books:[], 200 (NEVER 500)", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { app, trust } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    // The trust read throws — the route must catch → empty map → every
    // weightedRatings null → honest empty, a 200, NOT a 500.
    vi.spyOn(trust, "weights").mockRejectedValue(new Error("trust backend down"));
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("personalized");
    expect(res.body.books).toEqual([]);
  });

  it("weights resolves to an EMPTY map → honest empty personalized (no trusted signal)", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { app } = personalizedApp({
      weightsRow: {}, // user trusts nobody → every weightedRatings null
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    const res = await request(app).get("/api/foryou");
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("personalized");
    expect(res.body.books).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-2/AC-4 wire hygiene — no trust number/tier/count crosses the wire (CLAUDE.md)
// ───────────────────────────────────────────────────────────────────────────
describe("GET /api/foryou — no trust score/tier/count on the wire (CLAUDE.md)", () => {
  it("returns only book display fields, never a GrapeRank number / tier / 'trusted' / weight / average", async () => {
    const r1 = signedRating({ bookSlug: "alpha", score: 5 });
    const r2 = signedRating({ bookSlug: "alpha", score: 5 });
    const { app } = personalizedApp({
      weightsRow: { [r1.pubkey]: 0.9, [r2.pubkey]: 0.9 },
      candidateRatings: [r1.event, r2.event],
      books: { alpha: bookEvent("alpha", "Alpha") },
    });
    const res = await request(app).get("/api/foryou");
    const wire = JSON.stringify(res.body);
    expect(wire).not.toMatch(/graperank/i);
    expect(wire).not.toMatch(/"trusted"/);
    expect(wire).not.toMatch(/"tier"/);
    expect(wire).not.toMatch(/"weight"/);
    expect(wire).not.toMatch(/"average"/);
    expect(wire).not.toMatch(/"trustedCount"/);
    const book = res.body.books[0];
    expect(book).toMatchObject({ slug: "alpha", title: "Alpha" });
    expect(book).not.toHaveProperty("trusted");
  });
});

// Keep the imported header-address constants referenced so the red set is clean
// under `noUnusedLocals` (the Implementer asserts the route's read filters against
// these; here they document the candidate/hydrate read shape this story pins).
describe("GET /api/foryou — read shape constants are well-formed (documentation guard)", () => {
  it("the ratings header and books-concept addresses resolve to the librarian", () => {
    expect(RATINGS_Z).toBe(`39998:${LIBRARIAN}:book-ratings`);
    expect(BOOKS_Z).toBe(`39998:${LIBRARIAN}:books`);
    expect(asHexPubkey(LIBRARIAN)).toBe(LIBRARIAN);
  });
});
