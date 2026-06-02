// Catalog search endpoint (ADR 0013). Provider-neutral: delegates to whatever
// SearchProvider was resolved at startup. The web (dropdown + results page)
// talks only to this route — never to the search backend directly.
import express, { type Router } from "express";
import type { SearchProvider } from "@unbnd/search";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import type { TrustProvider } from "../trust";
import { rerankByTrust } from "../search/rerank";

const MIN_Q = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type SearchDeps = {
  readonly searchProvider: SearchProvider;
  /** Needs `houseObserverPubkey` (vantage), `librarianPubkey`, `searchTrustBlend`. */
  readonly config: Config;
  /** Per-book-address rating read for the trust-weighted re-rank (ADR 0035). */
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /** Trust-weighting source. Absent → pure text relevance (no re-rank). */
  readonly trust?: TrustProvider;
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

      // Story 34 / ADR 0035: blend a trust-weighted rating signal into the order
      // AFTER the provider read (so a provider failure still 503s above). House
      // vantage for v1 (`?observer=` is a thin later add — Story 36). The re-rank
      // is internally degrade-safe: any trust failure returns pure text order.
      const observerHex = deps.config.houseObserverPubkey ?? null;
      const reranked = await rerankByTrust(result, {
        observerHex,
        blend: deps.config.searchTrustBlend ?? 0,
        trust: deps.trust,
        query: deps.query,
        config: deps.config,
      });
      res.status(200).json(reranked);
    } catch (err) {
      // Backend down / index not built yet — degrade, don't 500.
      res.status(503).json({
        error: { code: "search_unavailable", message: "Search is temporarily unavailable." },
      });
    }
  });

  return router;
}
