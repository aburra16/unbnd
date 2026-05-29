// Catalog search endpoint (ADR 0013). Provider-neutral: delegates to whatever
// SearchProvider was resolved at startup. The web (dropdown + results page)
// talks only to this route — never to the search backend directly.
import express, { type Router } from "express";
import type { SearchProvider } from "@unbnd/search";

const MIN_Q = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type SearchDeps = {
  readonly searchProvider: SearchProvider;
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function buildSearchRouter(deps: SearchDeps): Router {
  const router = express.Router();

  router.get("/api/search", async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const limit = clampInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
      const offset = clampInt(req.query.offset, 0, 0, 100_000);
      const genre =
        typeof req.query.genre === "string" && req.query.genre.length > 0
          ? req.query.genre
          : undefined;

      // Too short to be meaningful — empty result, not an error.
      if (q.length < MIN_Q) {
        return void res.status(200).json({ hits: [], total: 0, offset, limit });
      }

      const result = await deps.searchProvider.search({
        q,
        limit,
        offset,
        ...(genre ? { filters: { genre } } : {}),
      });
      res.status(200).json(result);
    } catch (err) {
      // Backend down / index not built yet — degrade, don't 500.
      res.status(503).json({
        error: { code: "search_unavailable", message: "Search is temporarily unavailable." },
      });
    }
  });

  return router;
}
