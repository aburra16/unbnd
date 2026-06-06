// Failing tests (red) for Story 66 / ADR 0065 — GET /api/books/:slug/taste-matches.
// Observer-relative, read-time: for the signed-in viewer, the taste match against
// each of a book's raters, keyed by npub (self excluded), honest below the overlap
// threshold; signed out → { signedIn:false }; two bounded reads (book raters via
// #a, then ONE batched author-scoped read over [viewer, ...raters]); best-effort.
// The route returns 501 (stub) → these fail red.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import type { NostrFilter, PagedResult } from "../../src/nostr/query";
import { LIBRARIAN, signedRating } from "../ratings/_fixtures";
import {
  buildBookTasteMatchesRouter,
  type BookTasteMatchesDeps,
  type BookTasteMatchesSessionUser,
} from "../../src/routes/book-taste-matches";

const V_SK = new Uint8Array(32).fill(9);
const R1_SK = new Uint8Array(32).fill(1);
const R2_SK = new Uint8Array(32).fill(2);
const VIEWER_HEX = asHexPubkey(getPublicKey(V_SK));
const R1_HEX = asHexPubkey(getPublicKey(R1_SK));
const R2_HEX = asHexPubkey(getPublicKey(R2_SK));
const R1_NPUB = npubEncode(R1_HEX);
const R2_NPUB = npubEncode(R2_HEX);
const VIEWER_NPUB = npubEncode(VIEWER_HEX);

const FIVE = ["alpha", "beta", "gamma", "delta", "epsilon"];
const rate = (sk: Uint8Array, slug: string, score: number): SignedNostrEvent =>
  signedRating({ sk, bookSlug: slug, score }).event;

// Viewer + R1 rate the same five books identically (→ 100% over 5 co-rated).
// R2 rates only three of them (→ below the min-5 overlap).
const viewerRatings = FIVE.map((s) => rate(V_SK, s, 5));
const r1Ratings = FIVE.map((s) => rate(R1_SK, s, 5));
const r2Ratings = ["alpha", "beta", "gamma"].map((s) => rate(R2_SK, s, 5));
const allHistories = [...viewerRatings, ...r1Ratings, ...r2Ratings];
// The book under view is "alpha"; its raters are viewer, R1, R2 (one #a rating each).
const alphaRaters = [viewerRatings[0]!, r1Ratings[0]!, r2Ratings[0]!];

function baseConfig(overrides: Record<string, unknown> = {}): Config {
  return {
    librarianPubkey: LIBRARIAN,
    tasteMatchMinOverlap: 5,
    ...overrides,
  } as unknown as Config;
}

const session = (hex = VIEWER_HEX): BookTasteMatchesSessionUser => ({
  id: "u1",
  pubkeyHex: hex,
  tier: "sovereign",
});

// A batched author-scoped read fake that returns each requested author's full
// rating history. Kept as a named factory so a test can hold the Mock reference
// and assert the batched author set.
function historiesQueryPaged(histories: SignedNostrEvent[] = allHistories) {
  return vi.fn(async (filter: NostrFilter): Promise<PagedResult> => {
    const authors = (filter.authors as string[] | undefined) ?? [];
    return { events: histories.filter((e) => authors.includes(e.pubkey)), capped: false };
  });
}

function ratersQuery(raters: SignedNostrEvent[] = alphaRaters) {
  return vi.fn(async (filter: NostrFilter): Promise<SignedNostrEvent[]> =>
    filter["#a"] !== undefined ? raters : [],
  );
}

function makeApp(opts: {
  user?: BookTasteMatchesSessionUser | null;
  config?: Record<string, unknown>;
  raters?: SignedNostrEvent[];
  histories?: SignedNostrEvent[];
  query?: BookTasteMatchesDeps["query"];
  queryPaged?: BookTasteMatchesDeps["queryPaged"];
}) {
  const query = opts.query ?? ratersQuery(opts.raters ?? alphaRaters);
  const queryPaged = opts.queryPaged ?? historiesQueryPaged(opts.histories ?? allHistories);
  const deps: BookTasteMatchesDeps = {
    config: baseConfig(opts.config),
    sessionUser: vi.fn(async () =>
      opts.user === undefined ? session() : opts.user,
    ),
    query,
    queryPaged,
  };
  const app = express();
  app.use("/", buildBookTasteMatchesRouter(deps));
  return { app, query, queryPaged };
}

describe("GET /api/books/:slug/taste-matches — AC-1: per-rater match keyed by npub", () => {
  it("returns a match for each rater, honest below the overlap threshold, self excluded", async () => {
    const { app } = makeApp({});
    const res = await request(app).get("/api/books/alpha/taste-matches");
    expect(res.status).toBe(200);
    expect(res.body.signedIn).toBe(true);
    const m = res.body.matches as Record<string, unknown>;
    expect(m[R1_NPUB]).toMatchObject({ commonBooks: 5, thresholdMet: true, percentage: 100 });
    expect(m[R2_NPUB]).toMatchObject({ commonBooks: 3, thresholdMet: false });
    expect(m[VIEWER_NPUB]).toBeUndefined(); // the viewer never matches themselves
  });

  it("resolves the viewer + the book's raters in ONE batched author-scoped read", async () => {
    const queryPaged = historiesQueryPaged();
    const { app } = makeApp({ queryPaged });
    await request(app).get("/api/books/alpha/taste-matches");
    const authorCalls = queryPaged.mock.calls.map(
      (c) => (c[0].authors as string[] | undefined) ?? [],
    );
    const batched = authorCalls.find((a) => a.includes(VIEWER_HEX));
    expect(batched).toBeDefined();
    expect(batched).toEqual(expect.arrayContaining([VIEWER_HEX, R1_HEX, R2_HEX]));
  });

  it("honors a configurable TASTE_MATCH_MIN_OVERLAP (min 10 → R1's 5 co-rated not met)", async () => {
    const { app } = makeApp({ config: { tasteMatchMinOverlap: 10 } });
    const res = await request(app).get("/api/books/alpha/taste-matches");
    expect((res.body.matches as Record<string, { thresholdMet: boolean }>)[R1_NPUB]).toMatchObject({
      thresholdMet: false,
    });
  });
});

describe("GET /api/books/:slug/taste-matches — signed out + best-effort", () => {
  it("signed out → { signedIn:false } and no reads", async () => {
    const query = vi.fn(async (): Promise<SignedNostrEvent[]> => []);
    const queryPaged = vi.fn(async (): Promise<PagedResult> => ({ events: [], capped: false }));
    const { app } = makeApp({ user: null, query, queryPaged });
    const res = await request(app).get("/api/books/alpha/taste-matches");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signedIn: false });
    expect(query).not.toHaveBeenCalled();
    expect(queryPaged).not.toHaveBeenCalled();
  });

  it("a read failure degrades to empty matches (200), never a 500", async () => {
    const queryPaged = vi.fn(async (): Promise<PagedResult> => {
      throw new Error("relay down");
    });
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get("/api/books/alpha/taste-matches");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signedIn: true, matches: {} });
  });
});
