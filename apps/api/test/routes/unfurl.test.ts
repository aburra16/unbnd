// Story 72 / ADR 0070 — the unfurl service routes. DI like the other route
// tests (express + supertest + vi.fn fakes), NO intra-module vi.mock. Covers the
// per-book HTML card (AC-1), the generic no-book fallback (AC-6), the oEmbed JSON
// (AC-3), the same-origin validation (security — no SSRF), and raw-only (AC-4).
//
// FAILING until `apps/api/src/routes/unfurl.ts` is implemented (it currently
// returns an empty router).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import type { PublicBook } from "../../src/books/effective";
import { buildUnfurlRouter, type UnfurlDeps } from "../../src/routes/unfurl";

const BASE = "https://unbnd.test";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return { librarianPubkey: "1".repeat(64), publicOrigin: BASE, ...overrides } as unknown as Config;
}

function book(overrides: Partial<PublicBook> = {}): PublicBook {
  return {
    slug: "orbital",
    title: "Orbital",
    authorName: "Samantha Harvey",
    source: "openlibrary",
    blurb: "A day aboard the ISS.",
    coverUrl: "https://covers.example/orbital.jpg",
    publishYear: 2023,
    pageCount: 207,
    language: "en",
    subjects: ["Fiction"],
    openLibraryId: "OL2W",
    isbn13: "9780000000002",
    purchaseUrl: "https://buy.example/orbital",
    format: "reference",
    ...overrides,
  };
}

function makeApp(extra: Partial<UnfurlDeps> = {}) {
  const deps: UnfurlDeps = {
    config: baseConfig(),
    readBook: vi.fn(async (slug: string) => (slug === "orbital" ? book() : null)),
    readCardRatings: vi.fn(async () => ({ count: 8, trusted: { average: 4.4, count: 3 } })),
    readRawTags: vi.fn(async () => ({
      genres: [{ slug: "litfic", name: "Literary Fiction", type: "genre" as const, applies: 6, disputes: 0 }],
      styles: [],
      signals: [],
    })),
    ...extra,
  };
  const app = express();
  app.use("/", buildUnfurlRouter(deps));
  return { app, deps };
}

describe("GET /unfurl/book/:slug — per-book HTML card (AC-1)", () => {
  it("serves an HTML document with the book's og:title, canonical url, and oEmbed link", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/unfurl/book/orbital");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Orbital");
    expect(res.text).toContain(`${BASE}/book/orbital`);
    expect(res.text).toMatch(/type="application\/json\+oembed"/);
  });

  it("shows the house view's trusted rating and the tags (Story 101 / ADR 0092 §5)", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/unfurl/book/orbital");
    expect(res.text).toContain("4.4");
    expect(res.text).toContain("3 trusted ratings");
    expect(res.text).toContain("Literary Fiction");
    expect(res.text).not.toMatch(/graperank|tier|weighted/i);
  });

  it("with no trusted ratings the card shows the count and no figure", async () => {
    const { app } = makeApp({ readCardRatings: vi.fn(async () => ({ count: 8, trusted: null })) });
    const res = await request(app).get("/unfurl/book/orbital");
    expect(res.text).toContain("8 ratings");
    expect(res.text).not.toMatch(/★/);
  });
});

describe("GET /unfurl/book/:slug — no fabricated card for an unknown slug (AC-6)", () => {
  it("serves the generic site card (not a book-specific card) when the slug has no book", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/unfurl/book/does-not-exist");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Unbnd");
    expect(res.text).not.toContain("Orbital");
  });
});

describe("GET /api/oembed — oEmbed JSON (AC-3)", () => {
  it("returns the oEmbed link payload for a valid same-origin book url", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/oembed")
      .query({ url: `${BASE}/book/orbital`, format: "json" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.type).toBe("link");
    expect(res.body.version).toBe("1.0");
    expect(res.body.title).toBe("Orbital");
    expect(res.body.provider_name).toBe("Unbnd");
  });

  it("returns 404 for a same-origin book url whose slug has no catalog book", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/oembed").query({ url: `${BASE}/book/ghost` });
    expect(res.status).toBe(404);
  });

  it("rejects a foreign-origin url with 400 (no SSRF; we only parse the slug)", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/oembed")
      .query({ url: "https://evil.example/book/orbital" });
    expect(res.status).toBe(400);
  });

  it("rejects a same-origin url that is not a /book/ path with 400", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/oembed").query({ url: `${BASE}/profile/orbital` });
    expect(res.status).toBe(400);
  });

  it("returns 501 for an unsupported xml format", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/oembed")
      .query({ url: `${BASE}/book/orbital`, format: "xml" });
    expect(res.status).toBe(501);
  });
});
