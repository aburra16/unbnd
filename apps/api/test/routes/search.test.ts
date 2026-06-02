import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { SearchProvider, SearchResult, SearchHit } from "@unbnd/search";
import type { Config } from "../../src/config";
import type { NostrFilter } from "../../src/nostr/query";
import { FixtureTrustProvider } from "../../src/trust";
import { signedRating, LIBRARIAN } from "../ratings/_fixtures";
import { buildSearchRouter, type SearchDeps } from "../../src/routes/search";

const RESULT: SearchResult = {
  hits: [
    { slug: "ol-a", title: "Alpha", authorName: "Ada", format: "reference", score: 0.9 },
  ],
  total: 1,
  offset: 0,
  limit: 20,
};

// Story 34 / ADR 0035: the route now resolves the house observer and re-ranks
// after the provider read. `SearchDeps` gains `config`, `query`, and `trust?`.
// MIGRATION: the original `makeApp(search)` supplied only `{ searchProvider }`.
// It now wires the additive deps so the existing contract tests still build and
// pass; trust is OFF (no `trust` dep / no observer) so re-ranking is a no-op and
// the pre-Story-34 assertions remain faithful (pure text order, 503, short-q 200).
const HOUSE = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIBRARIAN,
    houseObserverPubkey: HOUSE,
    searchTrustBlend: 0.25,
    ...overrides,
  } as unknown as Config;
}

const addr = (slug: string) => `39999:${LIBRARIAN}:${slug}`;

function makeApp(
  search = vi.fn(async () => RESULT),
  extra: Partial<SearchDeps> = {},
) {
  const provider = {
    name: "meili",
    health: vi.fn(),
    configureIndex: vi.fn(),
    index: vi.fn(),
    deleteAll: vi.fn(),
    search,
  } as unknown as SearchProvider;
  const deps: SearchDeps = {
    searchProvider: provider,
    config: baseConfig(),
    query: vi.fn(async () => [] as never),
    ...extra,
  };
  const app = express();
  app.use("/", buildSearchRouter(deps));
  return { app, search, deps };
}

describe("GET /api/search", () => {
  it("returns provider results for a real query", async () => {
    const { app, search } = makeApp();
    const res = await request(app).get("/api/search?q=alpha");
    expect(res.status).toBe(200);
    expect(res.body.hits[0].slug).toBe("ol-a");
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: "alpha", limit: 20, offset: 0 }));
  });

  it("returns an empty result for a too-short query without hitting the provider", async () => {
    const { app, search } = makeApp();
    const res = await request(app).get("/api/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hits: [], total: 0, offset: 0, limit: 20 });
    expect(search).not.toHaveBeenCalled();
  });

  it("passes a genre filter and clamps limit", async () => {
    const { app, search } = makeApp();
    await request(app).get("/api/search?q=alpha&genre=mystery&limit=999");
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { genre: "mystery" }, limit: 50 }),
    );
  });

  it("503s when the provider throws (index missing / backend down)", async () => {
    const { app } = makeApp(vi.fn(async () => {
      throw new Error("index not found");
    }));
    const res = await request(app).get("/api/search?q=alpha");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("search_unavailable");
  });
});

// ── Story 34 / ADR 0035 — trust-weighted re-ranking, route-level (end to end) ──
//
// With trust wired (fixture provider + house observer), the route blends the
// trust-weighted rating into the order AFTER the provider read. These exercise
// the wiring + the AC-5 degrade contract end to end. FAILING until the route
// resolves the house observer and calls `rerankByTrust`.

function hit(slug: string, score: number): SearchHit {
  return { slug, title: slug, authorName: "x", format: "reference", score };
}

function withTrust(opts: {
  hits: SearchHit[];
  byAddr: Record<string, unknown[]>;
  weightsRow: Record<string, number>;
  config?: Partial<Config>;
}) {
  const provider: SearchResult = {
    hits: opts.hits,
    total: opts.hits.length,
    offset: 0,
    limit: 20,
  };
  const search = vi.fn(async () => provider);
  const query = vi.fn(async (filter: NostrFilter) => {
    const a = filter["#a"]?.[0];
    return ((a ? opts.byAddr[a] : undefined) ?? []) as never;
  });
  const trust = new FixtureTrustProvider({ weights: { [HOUSE]: opts.weightsRow } });
  return makeApp(search, {
    query,
    trust,
    config: baseConfig(opts.config),
  });
}

describe("GET /api/search — trust-weighted re-ranking (AC-1, AC-8)", () => {
  it("reorders hits by the blend from the house vantage", async () => {
    // b-book matches text slightly better; a-book is trusted-rated 5, b-book 1.
    // With the default blend (0.25) the house-trusted a-book rises to the top.
    const aRater = signedRating({ bookSlug: "a-book", score: 5 });
    const bRater = signedRating({ bookSlug: "b-book", score: 1 });
    const { app } = withTrust({
      hits: [hit("b-book", 0.82), hit("a-book", 0.8)],
      byAddr: {
        [addr("a-book")]: [aRater.event],
        [addr("b-book")]: [bRater.event],
      },
      weightsRow: { [aRater.pubkey]: 0.9, [bRater.pubkey]: 0.9 },
    });
    const res = await request(app).get("/api/search?q=novels");
    expect(res.status).toBe(200);
    expect(res.body.hits.map((h: SearchHit) => h.slug)).toEqual(["a-book", "b-book"]);
  });
});

describe("GET /api/search — AC-5: honest degrade, never 500; preserved contract", () => {
  it("falls back to pure text order when the trust provider throws (200, not 500)", async () => {
    const aRater = signedRating({ bookSlug: "a-book", score: 5 });
    const { app, deps } = withTrust({
      hits: [hit("b-book", 0.82), hit("a-book", 0.8)],
      byAddr: { [addr("a-book")]: [aRater.event], [addr("b-book")]: [] },
      weightsRow: { [aRater.pubkey]: 0.9 },
    });
    vi.spyOn(deps.trust as FixtureTrustProvider, "weights").mockRejectedValue(
      new Error("trust backend down"),
    );
    const res = await request(app).get("/api/search?q=novels");
    expect(res.status).toBe(200); // never 500
    expect(res.body.hits.map((h: SearchHit) => h.slug)).toEqual(["b-book", "a-book"]);
  });

  it("returns pure text order when no observer is configured", async () => {
    const aRater = signedRating({ bookSlug: "a-book", score: 5 });
    const { app } = withTrust({
      hits: [hit("b-book", 0.82), hit("a-book", 0.8)],
      byAddr: { [addr("a-book")]: [aRater.event], [addr("b-book")]: [] },
      weightsRow: { [aRater.pubkey]: 0.9 },
      config: { houseObserverPubkey: undefined },
    });
    const res = await request(app).get("/api/search?q=novels");
    expect(res.status).toBe(200);
    expect(res.body.hits.map((h: SearchHit) => h.slug)).toEqual(["b-book", "a-book"]);
  });

  it("returns pure text order when weights resolve to an empty map (no trusted raters)", async () => {
    const aRater = signedRating({ bookSlug: "a-book", score: 5 });
    const { app } = withTrust({
      hits: [hit("b-book", 0.82), hit("a-book", 0.8)],
      byAddr: { [addr("a-book")]: [aRater.event], [addr("b-book")]: [] },
      weightsRow: {}, // HOUSE trusts nobody → empty weight map → all NEUTRAL
    });
    const res = await request(app).get("/api/search?q=novels");
    expect(res.status).toBe(200);
    expect(res.body.hits.map((h: SearchHit) => h.slug)).toEqual(["b-book", "a-book"]);
  });

  it("a SEARCH provider error still 503s — only the trust layer degrades", async () => {
    // The trust catch must NOT swallow a provider failure into a no-op 200.
    const { app } = makeApp(
      vi.fn(async () => {
        throw new Error("index not found");
      }),
      { trust: new FixtureTrustProvider({ weights: { [HOUSE]: {} } }) },
    );
    const res = await request(app).get("/api/search?q=alpha");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("search_unavailable");
  });

  it("short query (<2 chars) still returns an empty 200 and never reaches the blend", async () => {
    const query = vi.fn(async () => [] as never);
    const { app } = makeApp(undefined, {
      query,
      trust: new FixtureTrustProvider({ weights: { [HOUSE]: {} } }),
    });
    const res = await request(app).get("/api/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hits: [], total: 0, offset: 0, limit: 20 });
    expect(query).not.toHaveBeenCalled(); // trust read never reached
  });
});
