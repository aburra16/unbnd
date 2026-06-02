// Story 34 / ADR 0035 — trust-weighted search re-ranking, in apps/api (NOT the
// search adapter — the ADR 0013 seam stays pure text relevance).
//
// A pure, page-bounded re-rank over the adapter's text-relevance hits. For the
// books on the returned page it reads each book's kind-39999 rating events,
// computes a trust-weighted average from the observer's vantage via the shipped
// `weightedRatings` over a SINGLE batched `weights` call (no per-book per-rater
// fan-out), normalizes text + trust to 0..1, blends linearly, and stable-sorts:
//
//   normText(hit)   = clamp01(hit.score ?? 0)
//   normTrust(book) = avg == null ? NEUTRAL(0.5) : (avg − 1) / 4   // avg ∈ [1,5]
//   final(hit)      = (1 − w)·normText + w·normTrust
//
// Equal finals preserve the incoming text order (stable). On ANY trust failure
// (blend ≤ 0, no observer, no librarian address, empty weights, a throw) it
// returns the adapter's order UNCHANGED — pure text relevance, never throws.
// The module reads ONLY the neutral `SearchHit.score`; no Meili specifics.
import { npubEncode } from "nostr-tools/nip19";
import type { SearchHit, SearchResult } from "@unbnd/search";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import type { TrustProvider } from "../trust";
import { dedupeRatings, weightedRatings } from "../ratings/summary";

const BOOK_RATING_KIND = 39999;
const NEUTRAL = 0.5;

export type RerankDeps = {
  /** The vantage. House by default; `?observer=` is a thin later add (Story 36). */
  readonly observerHex: string | null;
  /** The text-vs-trust blend weight `w` ∈ [0,1] (config.searchTrustBlend). */
  readonly blend: number;
  /** Trust-weighting source. Absent → no-op text order. */
  readonly trust?: TrustProvider;
  /** Per-book-address rating read (kind-39999, one `#a`). */
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /** Needs `librarianPubkey` to build the book address. */
  readonly config: Config;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Re-rank the page's hits by blending each book's trust-weighted rating (from
 * `observerHex`'s vantage) into the adapter's text-relevance score. Page-bounded
 * and degrade-safe: any trust failure returns `result` untouched (pure text).
 */
export async function rerankByTrust(
  result: SearchResult,
  deps: RerankDeps,
): Promise<SearchResult> {
  const { observerHex, blend, trust, query, config } = deps;

  // No-op fast paths (the thin-graph default + AC-3 text-only extreme + degrade):
  // never touch the trust seam when the blend can't change the order.
  if (blend <= 0 || !trust || !observerHex || !config.librarianPubkey) {
    return result;
  }

  try {
    const librarian = config.librarianPubkey;
    const hits = result.hits;

    // 1. Page-bounded per-book read: one `#a` filter per hit (≤ limit ≤ MAX_LIMIT).
    const perBook = await Promise.all(
      hits.map(async (hit) => {
        const addr = `${BOOK_RATING_KIND}:${librarian}:${hit.slug}`;
        const events = await query({ kinds: [BOOK_RATING_KIND], "#a": [addr] });
        return dedupeRatings(events);
      }),
    );

    // 2. Union the page's raters into one set.
    const raterSet = new Set<string>();
    for (const deduped of perBook) {
      for (const r of deduped) raterSet.add(r.pubkey);
    }

    // 3. ONE batched weights call over the page's union rater set (no N+1).
    const weights = await trust.weights(observerHex, [...raterSet]);
    const observerNpub = npubEncode(observerHex);

    // 4. Per book, compute the trust-weighted average from the shared weight map.
    const blended = hits.map((hit, i) => {
      const weighted = weightedRatings(perBook[i]!, weights, observerNpub);
      const normTrust = weighted == null ? NEUTRAL : (weighted.average - 1) / 4;
      const normText = clamp01(hit.score ?? 0);
      const final = (1 - blend) * normText + blend * normTrust;
      return { hit, final, index: i };
    });

    // Stable sort by `final` desc; ties preserve the incoming text order.
    blended.sort((a, b) => (b.final - a.final) || (a.index - b.index));

    return { ...result, hits: blended.map((b) => b.hit) as readonly SearchHit[] };
  } catch {
    // Any trust failure degrades silently to the adapter's pure text order.
    return result;
  }
}
