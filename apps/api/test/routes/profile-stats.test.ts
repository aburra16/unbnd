// Failing tests (red) for Story 19 AC-5–AC-8 — the session-gated own-profile
// stats endpoint. Mirrors apps/api/test/routes/shelves.test.ts (the /mine
// session-gated read) and ratings.test.ts. Targets a new
// apps/api/src/routes/profile-stats.ts exporting buildProfileStatsRouter /
// ProfileStatsDeps / ProfileStatsSessionUser, which does not exist yet.
//
// ADR 0019 Decision 2 (chosen Option A): one combined GET /api/profile/me/stats
// runs three author-scoped reads in parallel, each wrapped so a single failing
// source omits ONLY its field. A field is PRESENT when its read succeeded (a
// true 0 is a present 0) and ABSENT when that read threw — that absence is the
// AC-8 "never a fabricated zero" rule expressed in the wire shape.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
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
    raterPubkey: USER,
    score: opts.score as BookRating["score"],
    reviewText: opts.reviewText,
    reviewDate: "2026-05-27",
    parentHeader: RATINGS_HDR,
  };
  const t = toWireTemplate(toBookRatingEvent(r), opts.createdAt ?? 1);
  return { id: `${opts.bookSlug}-${opts.createdAt ?? 1}`, pubkey: USER, sig: "x", ...t } as SignedNostrEvent;
}

function tagEvent(opts: { bookSlug: string; tagSlug: string; polarity: 1 | -1; createdAt?: number }): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    tagSlug: opts.tagSlug,
    tagType: "genre" as const,
    polarity: opts.polarity,
    asserterPubkey: USER,
    parentHeader: TAGS_HDR,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), opts.createdAt ?? 1);
  return { id: `${opts.bookSlug}-${opts.tagSlug}-${opts.createdAt ?? 1}`, pubkey: USER, sig: "x", ...t } as SignedNostrEvent;
}

const sovereign: ProfileStatsSessionUser = { id: "u", pubkeyHex: USER, tier: "sovereign" };

// Route the query mock by which concept (#z) is being read, so each of the
// three author-scoped reads can be controlled (and made to throw) independently.
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

function makeApp(over: Partial<ProfileStatsDeps> = {}) {
  const deps: ProfileStatsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    query: vi.fn(async () => []),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileStatsRouter(deps));
  return { app, deps };
}

describe("GET /api/profile/me/stats — session gating (AC-8)", () => {
  it("401 for an anonymous caller", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(401);
  });

  it("reads each concept author-scoped to the signed-in user", async () => {
    const query = queryByConcept({
      ratings: () => [ratingEvent({ bookSlug: "orbital", score: 5 })],
      tags: () => [tagEvent({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 })],
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    for (const call of query.mock.calls) {
      const filter = (call[0] ?? {}) as Record<string, unknown>;
      expect(filter.authors).toEqual([USER]);
      expect(filter.kinds).toContain(39999);
    }
  });
});

describe("GET /api/profile/me/stats — real counts (AC-5, AC-6, AC-7)", () => {
  it("returns booksRated, reviews, and tagsApplied computed from the user's events", async () => {
    const query = queryByConcept({
      ratings: () => [
        ratingEvent({ bookSlug: "orbital", score: 5, reviewText: "Luminous." }),
        ratingEvent({ bookSlug: "north-woods", score: 4 }), // rated, no review
        ratingEvent({ bookSlug: "orbital", score: 3, createdAt: 9, reviewText: "Reconsidered." }), // re-rate, latest-wins per book
      ],
      tags: () => [
        tagEvent({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 }),
        tagEvent({ bookSlug: "orbital", tagSlug: "space", polarity: 1, createdAt: 1 }),
        tagEvent({ bookSlug: "orbital", tagSlug: "space", polarity: -1, createdAt: 9 }), // disputed away
      ],
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(2); // orbital + north-woods, re-rate counts once
    expect(res.body.stats.reviews).toBe(1); // only orbital's latest carries review text
    expect(res.body.stats.tagsApplied).toBe(1); // literary-fiction applied; space disputed away
  });

  it("shows a true zero as a PRESENT 0 (AC-8 — a genuine none is not hidden)", async () => {
    const { app } = makeApp({ query: vi.fn(async () => []) });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(0);
    expect(res.body.stats.reviews).toBe(0);
    expect(res.body.stats.tagsApplied).toBe(0);
    // present, not absent
    expect("booksRated" in res.body.stats).toBe(true);
    expect("tagsApplied" in res.body.stats).toBe(true);
  });
});

describe("GET /api/profile/me/stats — honesty rule (AC-8)", () => {
  it("OMITS a stat whose underlying read throws, while keeping the others", async () => {
    // The tag read throws; ratings succeed. tagsApplied must be ABSENT (so the
    // web hides it), booksRated/reviews present.
    const query = queryByConcept({
      ratings: () => [ratingEvent({ bookSlug: "orbital", score: 5, reviewText: "Yes." })],
      tags: () => {
        throw new Error("relay boom on tags");
      },
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.booksRated).toBe(1);
    expect(res.body.stats.reviews).toBe(1);
    expect("tagsApplied" in res.body.stats).toBe(false); // hidden, never a fabricated 0
  });

  it("OMITS booksRated and reviews together when the ratings read throws", async () => {
    const query = queryByConcept({
      ratings: () => {
        throw new Error("relay boom on ratings");
      },
      tags: () => [tagEvent({ bookSlug: "orbital", tagSlug: "literary-fiction", polarity: 1 })],
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get("/api/profile/me/stats");
    expect(res.status).toBe(200);
    expect("booksRated" in res.body.stats).toBe(false);
    expect("reviews" in res.body.stats).toBe(false);
    expect(res.body.stats.tagsApplied).toBe(1); // the surviving read still reports
  });
});
