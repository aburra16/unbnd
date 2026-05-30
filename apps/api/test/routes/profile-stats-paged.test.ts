// Failing tests (red) for Story 21 — honest author-scoped counts past the 500 cap
// on the stats surfaces. Mirrors apps/api/test/routes/profile-stats.test.ts and
// profile-stats-public.test.ts, but exercises the NEW `queryPaged` dep on
// ProfileStatsDeps (a paginating, PagedResult-returning read) that ADR 0021
// Decision 4 introduces. Neither `queryPaged` on the deps nor the `capped` field
// on the response exists yet → intended red.
//
// ADR 0021: statsFor swaps its two author-scoped reads from deps.query (one-shot,
// caps at 500) to deps.queryPaged (pages past the cap). It reads `.events` into
// the unchanged countOwn* helpers and sets the additive `capped` array from
// `.capped`. Over-cap authors yield the TRUE count (AC-1); reaching MAX_PAGES sets
// the key in `capped` and the count is the floor, never a wrong exact (AC-6); the
// 60s TTL cache still collapses repeats so the multi-page walk runs once (AC-7);
// an overall-budget throw still omits the field (omit-on-throw).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  toBookRatingEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookRating,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import {
  buildProfileStatsRouter,
  type ProfileStatsDeps,
  type ProfileStatsSessionUser,
} from "../../src/routes/profile-stats";

const LIB = asHexPubkey("1".repeat(63) + "a");
const USER = asHexPubkey(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const TARGET_SK = generateSecretKey();
const TARGET_HEX = asHexPubkey(getPublicKey(TARGET_SK));
const TARGET_NPUB = npubEncode(TARGET_HEX);

const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x", librarianPubkey: LIB,
} as Config;

const RATINGS_HDR = { kind: 39998 as const, pubkey: LIB, dTag: "book-ratings" };
const TAGS_HDR = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };

function ratingEvent(pubkey: string, opts: { bookSlug: string; score: number; reviewText?: string; createdAt?: number }): SignedNostrEvent {
  const r: BookRating = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    raterPubkey: asHexPubkey(pubkey),
    score: opts.score as BookRating["score"],
    reviewText: opts.reviewText,
    reviewDate: "2026-05-27",
    parentHeader: RATINGS_HDR,
  };
  const t = toWireTemplate(toBookRatingEvent(r), opts.createdAt ?? 1);
  return { id: `${opts.bookSlug}-${opts.createdAt ?? 1}`, pubkey, sig: "x", ...t } as SignedNostrEvent;
}

function tagEvent(pubkey: string, opts: { bookSlug: string; tagSlug: string; polarity: 1 | -1; createdAt?: number }): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    tagSlug: opts.tagSlug,
    tagType: "genre" as const,
    polarity: opts.polarity,
    asserterPubkey: asHexPubkey(pubkey),
    parentHeader: TAGS_HDR,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), opts.createdAt ?? 1);
  return { id: `${opts.bookSlug}-${opts.tagSlug}-${opts.createdAt ?? 1}`, pubkey, sig: "x", ...t } as SignedNostrEvent;
}

// Generate N distinct rated books for an author (one rating each).
function manyRatings(pubkey: string, n: number): SignedNostrEvent[] {
  return Array.from({ length: n }, (_, i) =>
    ratingEvent(pubkey, { bookSlug: `book-${i}`, score: 5, createdAt: 1000 + i }),
  );
}
// Generate N distinct applied (book, tag) pairs for an author.
function manyTags(pubkey: string, n: number): SignedNostrEvent[] {
  return Array.from({ length: n }, (_, i) =>
    tagEvent(pubkey, { bookSlug: `book-${i}`, tagSlug: "genre-x", polarity: 1, createdAt: 1000 + i }),
  );
}

const sovereign: ProfileStatsSessionUser = { id: "u", pubkeyHex: USER, tier: "sovereign" };

// A PagedResult-returning queryPaged routed by concept. `capped` is settable per
// concept so AC-6 can be exercised. The events arrays here are the FULL author
// set (the paginator's job of getting past 500 is simulated by handing the route
// the whole set in one PagedResult).
type Paged = { events: SignedNostrEvent[]; capped: boolean };
function queryPagedByConcept(handlers: {
  ratings?: () => Paged | Promise<Paged>;
  tags?: () => Paged | Promise<Paged>;
}) {
  return vi.fn(async (filter: Record<string, unknown>): Promise<Paged> => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-ratings")) return handlers.ratings ? handlers.ratings() : { events: [], capped: false };
    if (z.endsWith("book-tag-assertions")) return handlers.tags ? handlers.tags() : { events: [], capped: false };
    return { events: [], capped: false };
  });
}

function makeApp(over: Partial<ProfileStatsDeps> & { now?: () => number; queryPaged?: unknown } = {}) {
  const deps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    query: vi.fn(async () => []),
    queryPaged: vi.fn(async () => ({ events: [], capped: false })),
    ...over,
  } as unknown as ProfileStatsDeps;
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileStatsRouter(deps));
  return { app, deps };
}

describe("GET /api/profile/me/stats — over-cap author, true count (AC-1, AC-5)", () => {
  it("returns the TRUE booksRated/reviews/tagsApplied for an author with >500 events of a kind", async () => {
    const queryPaged = queryPagedByConcept({
      ratings: () => ({ events: manyRatings(USER, 1960), capped: false }),
      tags: () => ({ events: manyTags(USER, 1960), capped: false }),
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(1960); // not 500
    expect(res.body.stats.tagsApplied).toBe(1960); // not 500
  });

  it("uses the paginating read (queryPaged), not the one-shot query, for the counts", async () => {
    const query = vi.fn(async () => []);
    const queryPaged = queryPagedByConcept({
      ratings: () => ({ events: manyRatings(USER, 600), capped: false }),
    });
    const { app } = makeApp({ query, queryPaged });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(600);
    expect(queryPaged.mock.calls.length).toBeGreaterThan(0);
    // every paged read is author-scoped to the signed-in user
    for (const call of queryPaged.mock.calls) {
      const filter = (call[0] ?? {}) as Record<string, unknown>;
      expect(filter.authors).toEqual([USER]);
      expect(filter.kinds).toContain(39999);
    }
  });
});

describe("GET /api/profile/me/stats — under-cap unchanged (AC-2)", () => {
  it("a ≤500 author yields the same numbers as the single-page count, capped absent", async () => {
    const queryPaged = queryPagedByConcept({
      ratings: () => ({
        events: [
          ratingEvent(USER, { bookSlug: "orbital", score: 5, reviewText: "Luminous." }),
          ratingEvent(USER, { bookSlug: "north-woods", score: 4 }),
          ratingEvent(USER, { bookSlug: "orbital", score: 3, createdAt: 9, reviewText: "Reconsidered." }),
        ],
        capped: false,
      }),
      tags: () => ({
        events: [
          tagEvent(USER, { bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 }),
          tagEvent(USER, { bookSlug: "orbital", tagSlug: "space", polarity: 1, createdAt: 1 }),
          tagEvent(USER, { bookSlug: "orbital", tagSlug: "space", polarity: -1, createdAt: 9 }),
        ],
        capped: false,
      }),
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(2);
    expect(res.body.stats.reviews).toBe(1);
    expect(res.body.stats.tagsApplied).toBe(1);
    expect("capped" in res.body.stats ? res.body.stats.capped : undefined).toBeUndefined();
  });
});

describe("GET /api/profile/me/stats — honest N+ under the guard (AC-6)", () => {
  it("lists the over-the-ceiling stat key in `capped` and returns the floor, never a wrong exact", async () => {
    const queryPaged = queryPagedByConcept({
      // tags hit MAX_PAGES: 10,000 floor, capped flag set by the paginator
      tags: () => ({ events: manyTags(USER, 10000), capped: true }),
      ratings: () => ({ events: manyRatings(USER, 12), capped: false }),
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.tagsApplied).toBe(10000); // the floor
    expect(res.body.stats.capped).toContain("tagsApplied");
    // a non-capped read does NOT appear in `capped`
    expect(res.body.stats.capped).not.toContain("booksRated");
    expect(res.body.stats.booksRated).toBe(12);
  });

  it("capped is absent (or empty) when no read hit the ceiling", async () => {
    const queryPaged = queryPagedByConcept({
      ratings: () => ({ events: manyRatings(USER, 30), capped: false }),
      tags: () => ({ events: manyTags(USER, 30), capped: false }),
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get("/api/profile/me/stats");
    // Real counts come from the paged read (pins queryPaged wiring), and nothing
    // is flagged capped.
    expect(res.body.stats.booksRated).toBe(30);
    expect(res.body.stats.tagsApplied).toBe(30);
    const capped = res.body.stats.capped as string[] | undefined;
    expect(capped === undefined || capped.length === 0).toBe(true);
  });

  it("booksRated and reviews are capped together when the ratings read hits the ceiling", async () => {
    const queryPaged = queryPagedByConcept({
      ratings: () => ({ events: manyRatings(USER, 10000), capped: true }),
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.body.stats.capped).toContain("booksRated");
    expect(res.body.stats.capped).toContain("reviews");
  });
});

describe("GET /api/profile/me/stats — overall-budget throw omits the field (Timeout → omit)", () => {
  it("OMITS the field whose paged read throws (never a partial as exact)", async () => {
    const queryPaged = queryPagedByConcept({
      ratings: () => ({ events: manyRatings(USER, 12), capped: false }),
      tags: () => {
        throw new Error("total budget exhausted");
      },
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(12);
    expect("tagsApplied" in res.body.stats).toBe(false);
    // a thrown read contributes nothing to capped
    const capped = res.body.stats.capped as string[] | undefined;
    expect(capped === undefined || !capped.includes("tagsApplied")).toBe(true);
  });
});

describe("GET /api/profile/:npub/stats — public over-cap surface (AC-1, AC-5, AC-6)", () => {
  it("returns the TRUE count for an over-cap public target via the paged read", async () => {
    const queryPaged = queryPagedByConcept({
      tags: () => ({ events: manyTags(TARGET_HEX, 1960), capped: false }),
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.tagsApplied).toBe(1960);
    for (const call of queryPaged.mock.calls) {
      const filter = (call[0] ?? {}) as Record<string, unknown>;
      expect(filter.authors).toEqual([TARGET_HEX]);
    }
  });

  it("surfaces the capped key on the public twin too", async () => {
    const queryPaged = queryPagedByConcept({
      tags: () => ({ events: manyTags(TARGET_HEX, 10000), capped: true }),
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.body.stats.capped).toContain("tagsApplied");
  });
});

describe("GET /api/profile/:npub/stats — pagination amortized by the 60s cache (AC-7)", () => {
  it("runs the multi-page paged read at most once per TTL window per target", async () => {
    let clock = 1_000_000;
    const queryPaged = queryPagedByConcept({
      tags: () => ({ events: manyTags(TARGET_HEX, 600), capped: false }),
    });
    const { app } = makeApp({ queryPaged, now: () => clock });
    await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    const after = queryPaged.mock.calls.length;
    expect(after).toBeGreaterThan(0);

    clock += 30_000; // inside the 60s window
    await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(queryPaged.mock.calls.length).toBe(after); // served from cache, no re-walk
  });
});
