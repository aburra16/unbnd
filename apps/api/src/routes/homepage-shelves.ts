// Homepage trust-shelf serve API (Story 35 / ADR 0036 §3). Read-only, public,
// SERVE-FROM-CACHE ONLY: it reads the `homepage_shelves` cache rows for the
// house observer (the off-path `apps/shelves` worker computes + writes them),
// batch-hydrates the distinct slugs in ONE book read (the existing `#d` slug
// path / `parseBook`), and shapes the response. It NEVER computes on a request —
// no relay rating/weights read, no trust call. Honest empty when the cache is
// empty (empty arrays + `computedAt: null`). No trust score / tier / "trusted"
// flag crosses the wire (CLAUDE.md — shelves only select + order books).
//
// Named `homepage/shelves` to avoid colliding with the user-shelf namespace
// (`/api/shelves/*`, ADR 0018).
import express, { type Router } from "express";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import { parseBook, type PublicBook } from "../books/effective";

const KIND = 39999;

/** A genre row as held in the cache: ordered member slugs (display hydrated). */
export type CachedShelfGenre = {
  readonly slug: string;
  readonly name: string;
  readonly books: string[];
};

/** The cached shelf set for one observer — ordered slugs only, never display
 * fields (the API hydrates). `computedAt` is null when the cache is empty. */
export type CachedShelfSet = {
  readonly computedAt: string | null;
  readonly trending: string[];
  readonly favorites: string[];
  readonly genres: CachedShelfGenre[];
};

export type HomepageShelvesDeps = {
  readonly config: Config;
  /** The existing live book read — used ONLY for the `#d` slug batch hydrate. */
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /** Reads the cached ordered slugs per shelf kind for the house observer. */
  readonly readShelfCache: (observerHex: string) => Promise<CachedShelfSet>;
  /** The trust seam may be wired in deps; the serve path must NEVER call it. */
  readonly trust?: unknown;
};

export function buildHomepageShelvesRouter(deps: HomepageShelvesDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const booksConcept = () => `39998:${lib()}:books`;

  router.get("/api/homepage/shelves", async (_req, res, next) => {
    try {
      const observer = deps.config.houseObserverPubkey;
      // No house vantage / catalog configured → honest empty (never computes).
      if (!observer || !lib()) {
        return void res.status(200).json({
          computedAt: null,
          trending: { books: [] },
          favorites: { books: [] },
          genres: [],
        });
      }

      const set = await deps.readShelfCache(observer);

      // Collect the UNION of distinct slugs across every shelf, then hydrate them
      // in ONE batched `#d` book read (never per-book, never a rating `#a` read).
      const distinct: string[] = [];
      const seen = new Set<string>();
      const collect = (slug: string) => {
        if (!seen.has(slug)) {
          seen.add(slug);
          distinct.push(slug);
        }
      };
      for (const s of set.trending) collect(s);
      for (const s of set.favorites) collect(s);
      for (const g of set.genres) for (const s of g.books) collect(s);

      const bySlug = new Map<string, PublicBook>();
      if (distinct.length > 0) {
        const events = await deps.query({
          kinds: [KIND],
          "#z": [booksConcept()],
          "#d": distinct,
        });
        for (const e of events) {
          const b = parseBook(e);
          if (b && !bySlug.has(b.slug)) bySlug.set(b.slug, b);
        }
      }

      // Hydrate each shelf in its cached order, dropping any slug that no longer
      // resolves to a catalog book.
      const hydrate = (slugs: string[]): PublicBook[] =>
        slugs.map((s) => bySlug.get(s)).filter((b): b is PublicBook => Boolean(b));

      res.status(200).json({
        computedAt: set.computedAt,
        trending: { books: hydrate(set.trending) },
        favorites: { books: hydrate(set.favorites) },
        genres: set.genres.map((g) => ({
          slug: g.slug,
          name: g.name,
          books: hydrate(g.books),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
