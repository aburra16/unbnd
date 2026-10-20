// Story 66 / ADR 0065 — GET /api/books/:slug/taste-matches. Observer-relative,
// read-time (never cached): for the SIGNED-IN viewer, returns the taste match
// against each of the book's raters, keyed by npub. Two bounded reads (the
// book's raters via #a, then ONE batched author-scoped read over
// [viewer, ...raters]), grouped in memory (scoresByAuthor) and run through the
// reused computeTasteMatch — the For-You pattern, never N+1. Signed out →
// { signedIn:false }. Best-effort: a read failure degrades to empty matches.
// v1 raw agreement, independent of the House/Yours toggle.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import { npubEncode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  formatAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { computeTasteMatch } from "@unbnd/trust";
import type { Config } from "../config";
import type { NostrFilter, PagedResult } from "../nostr/query";
import { dedupeRatings, reviewScope, scoresByAuthor } from "../ratings/summary";
import { readBookReviews, readBookReviewsPaged } from "../reviews/read";

const COOKIE_NAME = "session";
const DEFAULT_MIN_OVERLAP = 5;
// Bound the batched authors read (tracks strfry's maxFilterLimit). A book with
// more distinct raters computes matches for the first 500 in read order.
const RATER_CAP = 500;

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export type BookTasteMatchesSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type BookTasteMatchesDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<BookTasteMatchesSessionUser | null>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
};

export type BylineMatch = {
  readonly commonBooks: number;
  readonly thresholdMet: boolean;
  readonly percentage?: number;
};

export type BookTasteMatchesResponse =
  | { readonly signedIn: false }
  | { readonly signedIn: true; readonly matches: Record<string, BylineMatch> };

export function buildBookTasteMatchesRouter(deps: BookTasteMatchesDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const minOverlap = () => deps.config.tasteMatchMinOverlap ?? DEFAULT_MIN_OVERLAP;

  router.get("/api/books/:slug/taste-matches", async (req, res, next) => {
    try {
      const viewer = await deps.sessionUser(cookieOf(req));
      if (!viewer) return void res.status(200).json({ signedIn: false });

      const librarian = lib();
      if (!librarian) return void res.status(200).json({ signedIn: true, matches: {} });

      const bookAddr = formatAddress({
        kind: 39999,
        pubkey: asHexPubkey(librarian),
        dTag: req.params.slug,
      });

      try {
        // 1. The book's raters: authors of its standing reviews, viewer excluded, capped.
        const scope = reviewScope(deps.config);
        const standing = dedupeRatings(await readBookReviews(deps.query, { book: bookAddr }), scope);
        const raterHexes = standing
          .map((r) => r.pubkey)
          .filter((p) => p !== viewer.pubkeyHex)
          .slice(0, RATER_CAP);
        if (raterHexes.length === 0)
          return void res.status(200).json({ signedIn: true, matches: {} });

        // 2. ONE batched author-scoped read over the viewer + the raters.
        const paged = await readBookReviewsPaged(deps.queryPaged, {
          authors: [viewer.pubkeyHex, ...raterHexes],
        });

        // 3. Group by author, compute the viewer vs each rater (pure).
        const byAuthor = scoresByAuthor(paged.events, scope);
        const viewerMap = byAuthor.get(viewer.pubkeyHex) ?? new Map<string, number>();
        const matches: Record<string, BylineMatch> = {};
        for (const raterHex of raterHexes) {
          const raterMap = byAuthor.get(raterHex) ?? new Map<string, number>();
          matches[npubEncode(raterHex)] = computeTasteMatch(viewerMap, raterMap, minOverlap());
        }
        res.status(200).json({ signedIn: true, matches });
      } catch {
        // Best-effort: a read failure degrades to an honest empty match set.
        res.status(200).json({ signedIn: true, matches: {} });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
