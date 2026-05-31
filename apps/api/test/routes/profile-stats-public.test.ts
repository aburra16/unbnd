// Failing tests (red) for Story 20 AC-4 / AC-6 + the Decision-4 TTL cache — the
// PUBLIC by-pubkey stats twin GET /api/profile/:npub/stats. Mirrors
// apps/api/test/routes/profile-stats.test.ts (the session-gated /me/stats twin)
// but UN-GATED and author-scoped by the path npub instead of the session.
//
// ADR 0020 Decision 1 (Option A): a new thin public handler resolves :npub → hex
// (reusing the extracted toHex), runs the SAME countOwnRatings + countOwnAppliedTags
// reads as /me/stats but authors:[targetHex], each wrapped independently so a
// single failing source omits ONLY its field (present-0 vs omit-on-throw). No
// session required. Decision 4 wraps the read in a 60s in-memory TTL cache keyed by
// the resolved hex, with `now` injectable on ProfileStatsDeps for tests. None of
// the public route, the npub→hex on this route, the `now` dep, or the cache exist.
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
} from "../../src/routes/profile-stats";

const LIB = asHexPubkey("1".repeat(63) + "a");
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

function ratingEvent(opts: { bookSlug: string; score: number; reviewText?: string; createdAt?: number }): SignedNostrEvent {
  const r: BookRating = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    raterPubkey: TARGET_HEX,
    score: opts.score as BookRating["score"],
    reviewText: opts.reviewText,
    reviewDate: "2026-05-27",
    parentHeader: RATINGS_HDR,
  };
  const t = toWireTemplate(toBookRatingEvent(r), opts.createdAt ?? 1);
  return { id: `${opts.bookSlug}-${opts.createdAt ?? 1}`, pubkey: TARGET_HEX, sig: "x", ...t } as SignedNostrEvent;
}

function tagEvent(opts: { bookSlug: string; tagSlug: string; polarity: 1 | -1; createdAt?: number }): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    tagSlug: opts.tagSlug,
    tagType: "genre" as const,
    polarity: opts.polarity,
    asserterPubkey: TARGET_HEX,
    parentHeader: TAGS_HDR,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), opts.createdAt ?? 1);
  return { id: `${opts.bookSlug}-${opts.tagSlug}-${opts.createdAt ?? 1}`, pubkey: TARGET_HEX, sig: "x", ...t } as SignedNostrEvent;
}

function queryByConcept(handlers: {
  ratings?: () => SignedNostrEvent[] | Promise<SignedNostrEvent[]>;
  tags?: () => SignedNostrEvent[] | Promise<SignedNostrEvent[]>;
}) {
  return vi.fn(async (filter: Record<string, unknown>) => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-ratings")) return handlers.ratings ? handlers.ratings() : [];
    if (z.endsWith("book-tag-assertions")) return handlers.tags ? handlers.tags() : [];
    return [];
  });
}

function makeApp(over: Partial<ProfileStatsDeps> & { now?: () => number } = {}) {
  const query = over.query ?? vi.fn(async () => []);
  const deps: Partial<ProfileStatsDeps> & { now?: () => number } = {
    config: cfg,
    sessionUser: vi.fn(async () => null), // public route: never consulted
    query,
    // statsFor reads via queryPaged (ADR 0021); wrap the injected one-shot
    // `query` into a PagedResult so these pre-Story-21 fixtures still drive it.
    queryPaged: vi.fn(async (filter) => ({ events: await query(filter), capped: false })),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileStatsRouter(deps as ProfileStatsDeps));
  return { app, deps };
}

describe("GET /api/profile/:npub/stats — public by-pubkey counts (AC-4)", () => {
  it("author-scopes every read to the resolved TARGET hex, no session required", async () => {
    const query = queryByConcept({
      ratings: () => [ratingEvent({ bookSlug: "orbital", score: 5 })],
      tags: () => [tagEvent({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 })],
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(query.mock.calls.length).toBeGreaterThan(0);
    for (const call of query.mock.calls) {
      const filter = (call[0] ?? {}) as Record<string, unknown>;
      expect(filter.authors).toEqual([TARGET_HEX]);
      // Every read is author-scoped to the target. Story 23 (ADR 0023) adds a
      // fourth parallel kind-3 read (the following-count) through this same
      // `query` dep; the 39999 concept reads still carry kind 39999.
      const kinds = (filter.kinds as number[]) ?? [];
      expect(kinds.includes(39999) || kinds.includes(3)).toBe(true);
    }
  });

  it("returns booksRated, reviews, and tagsApplied computed from the target's events", async () => {
    const query = queryByConcept({
      ratings: () => [
        ratingEvent({ bookSlug: "orbital", score: 5, reviewText: "Luminous." }),
        ratingEvent({ bookSlug: "north-woods", score: 4 }),
        ratingEvent({ bookSlug: "orbital", score: 3, createdAt: 9, reviewText: "Reconsidered." }),
      ],
      tags: () => [
        tagEvent({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 }),
        tagEvent({ bookSlug: "orbital", tagSlug: "space", polarity: 1, createdAt: 1 }),
        tagEvent({ bookSlug: "orbital", tagSlug: "space", polarity: -1, createdAt: 9 }),
      ],
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(2);
    expect(res.body.stats.reviews).toBe(1);
    expect(res.body.stats.tagsApplied).toBe(1);
  });

  it("shows a true zero as a PRESENT 0 for a valid target with no activity", async () => {
    const { app } = makeApp({ query: vi.fn(async () => []) });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(0);
    expect(res.body.stats.reviews).toBe(0);
    expect(res.body.stats.tagsApplied).toBe(0);
    expect("booksRated" in res.body.stats).toBe(true);
  });

  it("OMITS a stat whose underlying read throws while keeping the others (never a fabricated 0)", async () => {
    const query = queryByConcept({
      ratings: () => [ratingEvent({ bookSlug: "orbital", score: 5, reviewText: "Yes." })],
      tags: () => {
        throw new Error("relay boom on tags");
      },
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(1);
    expect(res.body.stats.reviews).toBe(1);
    expect("tagsApplied" in res.body.stats).toBe(false);
  });

  it("accepts a 64-char hex pubkey as well as an npub", async () => {
    const query = queryByConcept({ ratings: () => [ratingEvent({ bookSlug: "orbital", score: 5 })] });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_HEX}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(1);
  });
});

describe("GET /api/profile/:npub/stats — invalid npub → 404 (AC-6)", () => {
  it("404s on a segment that is neither npub nor hex", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/profile/not-a-key/stats");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("GET /api/profile/:npub/stats — 60s TTL cache (Decision 4)", () => {
  it("serves a second call within the TTL window from cache without re-querying", async () => {
    let clock = 1_000_000;
    const query = queryByConcept({ ratings: () => [ratingEvent({ bookSlug: "orbital", score: 5 })] });
    const { app } = makeApp({ query: query as never, now: () => clock });
    await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    const callsAfterFirst = query.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    clock += 30_000;
    await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(query.mock.calls.length).toBe(callsAfterFirst);
  });

  it("re-queries once the TTL window has elapsed", async () => {
    let clock = 1_000_000;
    const query = queryByConcept({ ratings: () => [ratingEvent({ bookSlug: "orbital", score: 5 })] });
    const { app } = makeApp({ query: query as never, now: () => clock });
    await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    const callsAfterFirst = query.mock.calls.length;

    clock += 61_000;
    await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(query.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
