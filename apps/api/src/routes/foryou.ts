// Story 36 / ADR 0037 — the For-You personalized shelf: a read-time, per-request
// trust read computed from the SIGNED-IN user's OWN vantage (`user.pubkeyHex`
// resolved from the session — the "Yours" observer). NEVER cached.
//
// `GET /api/foryou` always returns 200 with a `state` the web switches on:
//   - "anonymous"        — signed out (web renders nothing).
//   - "not_personalized" — signed in but no own-graph scores (web renders an
//                          invitation). NO compute, NO weights call.
//   - "personalized"     — own-graph scores exist; books computed read-time.
//                          A thin graph / trust failure → "personalized" + [].
//
// The compute is candidate-limited to books the user's TRUSTED curators rated,
// resolved via ONE batched `weights(userHex, raterUnion)` call (the standing
// Story 34/35 pattern — bounded, batched, never per-book/per-rater fan-out),
// qualified by the env bar (avg ≥ FORYOU_MIN_AVG) AND min-count (trustedCount ≥
// FORYOU_MIN_RATINGS), with books the user already rated excluded, ranked by
// average desc (slug tie-break), capped at FORYOU_BOOKS. It reuses the shipped
// `weightedRatings`/`dedupeRatings`/`ownRatedSlugs` — no new trust or ranking math
// — and never reads or writes the Story-35 `homepage_shelves` house cache (ADR
// 0036's invariant-3 boundary: For-You is read-time, NOT a per-POV cache).
//
// NO Brainstorm/NIP-85 specifics live here — it consumes only the neutral
// `@unbnd/trust` surface (the ADR-0014 architecture guard enforces it). No raw
// GrapeRank number / tier / "trusted" badge crosses the wire (CLAUDE.md — the
// shelf only selects + orders books). No new crypto (it signs nothing).
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import { npubEncode } from "nostr-tools/nip19";
import {
  buildBookRatingsHeaderAddress,
  formatAddress,
  fromBookRatingEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import {
  dedupeRatings,
  weightedRatings,
  type ParsedRating,
} from "@unbnd/trust";
import type { Config } from "../config";
import type { NostrFilter, PagedResult } from "../nostr/query";
import type { TrustProvider } from "../trust";
import { ownRatedSlugs } from "../ratings/summary";
import { parseBook, type PublicBook } from "../books/effective";

const KIND = 39999;
const COOKIE_NAME = "session";

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

/** The signed-in user resolved from the session cookie (the For-You vantage). */
export type SessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type ForYouDeps = {
  readonly config: Config;
  readonly sessionUser: (cookie: string | undefined) => Promise<SessionUser | null>;
  /** Live book read — used for the `#d` slug batch hydrate. */
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /** Cap-safe paginating read (ADR 0021) for the candidate ratings + own-ratings. */
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
  /** The neutral trust seam (ADR 0014). Absent → not personalized. */
  readonly trust?: TrustProvider;
};

export type ForYouState = "personalized" | "not_personalized" | "anonymous";

export type ForYouResponse = {
  readonly state: ForYouState;
  readonly books: PublicBook[];
};

/** Thresholds the pure compute reads (the env knobs, ADR 0037 §7). */
export type ForYouDefs = {
  readonly minAvg: number;
  readonly minRatings: number;
  readonly books: number;
  readonly candidateRaters: number;
};

/** A candidate book: its slug + the deduped ratings under it (any rater). */
export type ForYouCandidate = {
  readonly slug: string;
  readonly ratings: ParsedRating[];
};

/** The bookSlug a kind-39999 rating event targets, or null when malformed. */
function ratingBookSlug(event: SignedNostrEvent): string | null {
  try {
    const rating = fromBookRatingEvent(
      fromWireEvent({ kind: event.kind, content: event.content, tags: event.tags }) as never,
    );
    return rating.bookSlug;
  } catch {
    return null;
  }
}

/**
 * Group candidate rating events by book slug, dedup per (rater, book). Returns
 * candidates sorted by slug ascending (deterministic) so the rater-union cap is
 * stable. Ratings with no parseable slug are dropped.
 */
export function buildCandidates(ratingEvents: SignedNostrEvent[]): ForYouCandidate[] {
  const byBook = new Map<string, SignedNostrEvent[]>();
  for (const e of ratingEvents) {
    const slug = ratingBookSlug(e);
    if (!slug) continue;
    const arr = byBook.get(slug) ?? [];
    arr.push(e);
    byBook.set(slug, arr);
  }
  return [...byBook.entries()]
    .map(([slug, events]) => ({ slug, ratings: dedupeRatings(events) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The bounded rater union for the single batched `weights` call (ADR 0037 §2).
 * Collects distinct rater hexes across the candidate books in slug order, capped
 * at `candidateRaters` so the batched array stays O(bounded) on a dense graph (a
 * no-op on today's thin graph). Deterministic: slug-ordered, first-seen kept.
 */
export function boundedRaterUnion(
  candidates: ForYouCandidate[],
  candidateRaters: number,
): string[] {
  const union: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    for (const r of c.ratings) {
      if (union.length >= candidateRaters) return union;
      if (!seen.has(r.pubkey)) {
        seen.add(r.pubkey);
        union.push(r.pubkey);
      }
    }
  }
  return union;
}

/**
 * Pure For-You composition (ADR 0037 §3/§4) — unit-testable without the route,
 * mirroring `apps/api/src/search/rerank.ts`. Qualifies each candidate by the
 * user's-vantage weighted average ≥ `minAvg` AND `trustedCount ≥ minRatings`,
 * drops books in `ownRatedSlugs`, ranks by average desc (slug tie-break), caps at
 * `books`, and returns the ordered qualifying slugs. NEVER fabricates: a thin
 * graph / empty weights yields [].
 */
export function computeForYou(input: {
  readonly observerHex: string;
  readonly candidates: ForYouCandidate[];
  readonly ownRatedSlugs: ReadonlySet<string>;
  readonly weights: Map<string, number>;
  readonly defs: ForYouDefs;
}): string[] {
  const { observerHex, candidates, weights, defs } = input;
  const observerNpub = npubEncode(observerHex);
  const qualifying: Array<{ slug: string; average: number }> = [];
  for (const c of candidates) {
    if (input.ownRatedSlugs.has(c.slug)) continue; // exclude already-rated (AC-3)
    const weighted = weightedRatings(c.ratings, weights, observerNpub);
    if (!weighted) continue; // no trusted signal from this vantage
    if (weighted.average < defs.minAvg) continue; // below the bar
    if (weighted.trustedCount < defs.minRatings) continue; // too few trusted raters
    qualifying.push({ slug: c.slug, average: weighted.average });
  }
  qualifying.sort((a, b) => b.average - a.average || a.slug.localeCompare(b.slug));
  return qualifying.slice(0, defs.books).map((x) => x.slug);
}

export function buildForYouRouter(deps: ForYouDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const booksConcept = () => `39998:${lib()}:books`;
  const ratingsZ = () => formatAddress(buildBookRatingsHeaderAddress(lib() as never));

  const defs = (): ForYouDefs => ({
    minAvg: deps.config.foryouMinAvg ?? 4.0,
    minRatings: deps.config.foryouMinRatings ?? 2,
    books: deps.config.foryouBooks ?? 12,
    candidateRaters: deps.config.foryouCandidateRaters ?? 2000,
  });

  router.get("/api/foryou", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));

      // Signed out → honest silent-absence state (the web renders nothing).
      if (!user) {
        return void res.status(200).json({ state: "anonymous", books: [] });
      }

      // Personalization gate (ADR 0014 / `GET /api/trust/status`): no trust seam,
      // no catalog, or no own-graph scores → not personalized. NO compute.
      if (!deps.trust || !lib() || !(await deps.trust.hasScores(user.pubkeyHex))) {
        return void res.status(200).json({ state: "not_personalized", books: [] });
      }

      // ── Read-time compute from the user's OWN vantage (user.pubkeyHex) ──
      // 1. Candidate ratings (cap-safe) + the user's own ratings, in parallel.
      const [candidatePaged, ownPaged] = await Promise.all([
        deps.queryPaged({ kinds: [KIND], "#z": [ratingsZ()] }),
        // Author-scoped to the session hex on kind 39999 (the established
        // own-ratings read convention; ADR ambiguity resolved to NO `#z` tag,
        // consistent with `countOwnRatings`/profile-stats).
        deps.queryPaged({ kinds: [KIND], authors: [user.pubkeyHex] }),
      ]);

      const candidates = buildCandidates(candidatePaged.events);
      const ownSlugs = ownRatedSlugs(ownPaged.events);
      const raterUnion = boundedRaterUnion(candidates, defs().candidateRaters);

      // 2. ONE batched weights call over the bounded rater union (AC-6). Wrapped
      //    so a surprise rejection degrades to an empty map → honest empty (AC-7).
      let weights: Map<string, number>;
      try {
        weights = await deps.trust.weights(user.pubkeyHex, raterUnion);
      } catch {
        weights = new Map();
      }

      // 3. Qualify + rank + cap (pure).
      const slugs = computeForYou({
        observerHex: user.pubkeyHex,
        candidates,
        ownRatedSlugs: ownSlugs,
        weights,
        defs: defs(),
      });

      // 4. Hydrate the ranked slugs to PublicBook in ONE `#d` batch read,
      //    preserving rank order and dropping any slug that no longer resolves.
      const bySlug = new Map<string, PublicBook>();
      if (slugs.length > 0) {
        const events = await deps.query({
          kinds: [KIND],
          "#z": [booksConcept()],
          "#d": slugs,
        });
        for (const e of events) {
          const b = parseBook(e);
          if (b && !bySlug.has(b.slug)) bySlug.set(b.slug, b);
        }
      }
      const books = slugs
        .map((s) => bySlug.get(s))
        .filter((b): b is PublicBook => Boolean(b));

      res.status(200).json({ state: "personalized", books });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
