// Story 35 / ADR 0036 §3 — the serve-from-cache API `GET /api/homepage/shelves`.
//
// Read-only, public. It reads the `homepage_shelves` cache rows for the house
// observer (injected fake `readShelfCache`), batch-hydrates the distinct slugs
// in ONE book read (the existing `query` path / `parseBook`), and shapes the
// response `{ computedAt, trending, favorites, genres }`. It NEVER computes on a
// request: no relay rating/weights read, no trust call on the serve path. Honest
// empty when the cache is empty (empty arrays + `computedAt: null`).
//
// DI like the other route tests (express + supertest + vi.fn fakes), NO intra-
// module vi.mock. FAILING until `apps/api/src/routes/homepage-shelves.ts` exists.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import type { NostrFilter } from "../../src/nostr/query";
import { FixtureTrustProvider } from "../../src/trust";
// The module UNDER TEST — does not exist yet (intentionally red).
import {
  buildHomepageShelvesRouter,
  type HomepageShelvesDeps,
  type CachedShelfSet,
} from "../../src/routes/homepage-shelves";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    ...overrides,
  } as unknown as Config;
}

/** A catalog kind-39999 book record event the hydrate `query` returns. */
function bookEvent(slug: string, title: string): SignedNostrEvent {
  const rec: BookRecord = {
    slug,
    title,
    authorName: `Author of ${title}`,
    format: "reference",
    source: "openlibrary",
    parentHeader: { kind: 39998, pubkey: LIB, dTag: "books" },
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: `book-${slug}`, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

/** A fake catalog hydrate `query`: returns the book record for each requested
 * `#d` slug. Records calls so we can assert it is the ONLY read and is batched. */
function makeQuery(known: Record<string, SignedNostrEvent>) {
  return vi.fn(async (filter: NostrFilter) => {
    const slugs = (filter["#d"] as string[] | undefined) ?? [];
    return slugs.map((s) => known[s]).filter(Boolean) as SignedNostrEvent[];
  });
}

/** A fake cache read returning the cached ordered slugs per shelf kind. */
function makeReadShelfCache(set: CachedShelfSet) {
  return vi.fn(async (_observerHex: string) => set);
}

function makeApp(extra: Partial<HomepageShelvesDeps> = {}) {
  const deps: HomepageShelvesDeps = {
    config: baseConfig(),
    query: makeQuery({}),
    readShelfCache: makeReadShelfCache({
      computedAt: null,
      trending: [],
      favorites: [],
      genres: [],
    }),
    ...extra,
  };
  const app = express();
  app.use("/", buildHomepageShelvesRouter(deps));
  return { app, deps };
}

describe("GET /api/homepage/shelves — honest empty when the cache is empty (AC-5)", () => {
  it("returns empty arrays and computedAt:null when no rows are cached", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/homepage/shelves");
    expect(res.status).toBe(200);
    expect(res.body.computedAt).toBeNull();
    expect(res.body.trending).toEqual({ books: [] });
    expect(res.body.favorites).toEqual({ books: [] });
    expect(res.body.genres).toEqual([]);
  });
});

describe("GET /api/homepage/shelves — Hidden Gems (Story 71 / ADR 0069)", () => {
  it("hydrates the cached Hidden Gems slugs in order", async () => {
    const known = {
      g1: bookEvent("g1", "Gem One"),
      g2: bookEvent("g2", "Gem Two"),
    };
    const set: CachedShelfSet = {
      computedAt: "2026-06-02T10:00:00Z",
      trending: [],
      favorites: [],
      hiddenGems: ["g1", "g2"],
      genres: [],
    };
    const { app } = makeApp({
      query: makeQuery(known),
      readShelfCache: makeReadShelfCache(set),
    });
    const res = await request(app).get("/api/homepage/shelves");
    expect(res.status).toBe(200);
    expect(res.body.hiddenGems.books.map((b: { slug: string }) => b.slug)).toEqual(["g1", "g2"]);
  });

  it("returns an empty Hidden Gems shelf when the cache has none", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/homepage/shelves");
    expect(res.body.hiddenGems).toEqual({ books: [] });
  });
});

describe("GET /api/homepage/shelves — hydrates cached slugs in order (AC-3/AC-4)", () => {
  it("groups by kind, orders by position, and hydrates each slug to a PublicBook", async () => {
    const known = {
      alpha: bookEvent("alpha", "Alpha"),
      beta: bookEvent("beta", "Beta"),
      gamma: bookEvent("gamma", "Gamma"),
    };
    const set: CachedShelfSet = {
      computedAt: "2026-06-02T10:00:00Z",
      trending: ["beta", "alpha"], // position order: beta first
      favorites: ["gamma"],
      genres: [{ slug: "sci-fi", name: "Science Fiction", books: ["alpha", "gamma"] }],
    };
    const { app } = makeApp({
      query: makeQuery(known),
      readShelfCache: makeReadShelfCache(set),
    });

    const res = await request(app).get("/api/homepage/shelves");

    expect(res.status).toBe(200);
    expect(res.body.computedAt).toBe("2026-06-02T10:00:00Z");
    expect(res.body.trending.books.map((b: { slug: string }) => b.slug)).toEqual([
      "beta",
      "alpha",
    ]);
    expect(res.body.favorites.books.map((b: { slug: string }) => b.slug)).toEqual([
      "gamma",
    ]);
    expect(res.body.genres[0]).toMatchObject({ slug: "sci-fi", name: "Science Fiction" });
    expect(
      res.body.genres[0].books.map((b: { slug: string }) => b.slug),
    ).toEqual(["alpha", "gamma"]);
  });

  it("drops a cached slug that no longer resolves to a catalog book", async () => {
    const known = { alpha: bookEvent("alpha", "Alpha") };
    const set: CachedShelfSet = {
      computedAt: "2026-06-02T10:00:00Z",
      trending: ["alpha", "deleted"], // `deleted` has no catalog record anymore
      favorites: [],
      genres: [],
    };
    const { app } = makeApp({
      query: makeQuery(known),
      readShelfCache: makeReadShelfCache(set),
    });

    const res = await request(app).get("/api/homepage/shelves");

    expect(res.body.trending.books.map((b: { slug: string }) => b.slug)).toEqual([
      "alpha",
    ]);
  });
});

describe("GET /api/homepage/shelves — NEVER computes on the request path (AC-4)", () => {
  it("makes no relay rating/weights read and no trust call when serving", async () => {
    const known = { alpha: bookEvent("alpha", "Alpha") };
    const query = makeQuery(known);
    const trust = new FixtureTrustProvider({ weights: { [HOUSE]: {} } });
    const trustSpy = vi.spyOn(trust, "weights");
    const set: CachedShelfSet = {
      computedAt: "2026-06-02T10:00:00Z",
      trending: ["alpha"],
      favorites: [],
      genres: [],
    };
    // Even when a trust provider is wired into deps, the serve path must not call it.
    const { app } = makeApp({
      query,
      readShelfCache: makeReadShelfCache(set),
      trust,
    });

    await request(app).get("/api/homepage/shelves");

    // The trust seam is never touched on a serve request.
    expect(trustSpy).not.toHaveBeenCalled();
    // The ONLY relay read is the batch slug hydrate (a `#d` book read), not a
    // per-book rating `#a` read (kind-39999 ratings are never queried here).
    for (const [filter] of query.mock.calls) {
      expect(filter["#a"]).toBeUndefined();
      expect(filter["#d"]).toBeDefined();
    }
  });

  it("hydrates ALL shelves' slugs in a single batched book read (one #d query)", async () => {
    const known = {
      a: bookEvent("a", "A"),
      b: bookEvent("b", "B"),
      c: bookEvent("c", "C"),
    };
    const query = makeQuery(known);
    const set: CachedShelfSet = {
      computedAt: "2026-06-02T10:00:00Z",
      trending: ["a"],
      favorites: ["b"],
      genres: [{ slug: "sci-fi", name: "Science Fiction", books: ["c"] }],
    };
    const { app } = makeApp({ query, readShelfCache: makeReadShelfCache(set) });

    await request(app).get("/api/homepage/shelves");

    // One batched hydrate over the union of distinct slugs across all shelves.
    expect(query).toHaveBeenCalledTimes(1);
    const slugs = (query.mock.calls[0]![0]["#d"] as string[]).slice().sort();
    expect(slugs).toEqual(["a", "b", "c"]);
  });
});

describe("GET /api/homepage/shelves — no trust score/tier on the wire (CLAUDE.md)", () => {
  it("returns only book display fields, never a trust number/tier/'trusted' flag", async () => {
    const known = { alpha: bookEvent("alpha", "Alpha") };
    const set: CachedShelfSet = {
      computedAt: "2026-06-02T10:00:00Z",
      trending: ["alpha"],
      favorites: [],
      genres: [],
    };
    const { app } = makeApp({
      query: makeQuery(known),
      readShelfCache: makeReadShelfCache(set),
    });

    const res = await request(app).get("/api/homepage/shelves");
    const wire = JSON.stringify(res.body);
    expect(wire).not.toMatch(/graperank/i);
    expect(wire).not.toMatch(/"trusted"/);
    expect(wire).not.toMatch(/"tier"/);
    expect(wire).not.toMatch(/"weight"/);
    const book = res.body.trending.books[0];
    expect(book).toMatchObject({ slug: "alpha", title: "Alpha" });
    expect(book).not.toHaveProperty("trusted");
  });
});
