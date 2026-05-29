import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { SearchProvider, SearchResult } from "@unbnd/search";
import { buildSearchRouter } from "../../src/routes/search";

const RESULT: SearchResult = {
  hits: [
    { slug: "ol-a", title: "Alpha", authorName: "Ada", format: "reference", score: 0.9 },
  ],
  total: 1,
  offset: 0,
  limit: 20,
};

function makeApp(search = vi.fn(async () => RESULT)) {
  const provider = {
    name: "meili",
    health: vi.fn(),
    configureIndex: vi.fn(),
    index: vi.fn(),
    deleteAll: vi.fn(),
    search,
  } as unknown as SearchProvider;
  const app = express();
  app.use("/", buildSearchRouter({ searchProvider: provider }));
  return { app, search };
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
