// Story 28 / ADR 0029 §3: the single owner of a book's rating data. It absorbs
// the two `api.ratings.list` effects that used to race across RatingsPanel and
// RatingControl, derives the signed-in user's OWN rating from the house/raw read
// (trust-view-independent — the honesty seam), and exposes `applyWrite` to
// reconcile the aggregate + own-rating slices from a single source after a write
// (the POST already returns the refreshed summary — no double-fetch).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type PublicRating,
  type RatingsSummary,
  type BylineTasteMatch,
} from "../lib/api";
import { useSession } from "./useSession";
import { useTrustView } from "./useTrustView";

export type RatingSort = "trusted" | "match";

export type UseBookRatings = {
  house: RatingsSummary | null;
  yours: RatingsSummary | null;
  yourRating: PublicRating | null;
  status: "loading" | "ready" | "error";
  // Story 79: `ownRating` may be null after a removal (the own slice clears).
  applyWrite: (summary: RatingsSummary, ownRating: PublicRating | null) => void;
  reload: () => Promise<void>;
  // Story 66 / ADR 0065: per-rater taste match (signed-in only) + the byline sort.
  tasteMatches: Record<string, BylineTasteMatch> | null;
  sortBy: RatingSort;
  setSortBy: (sort: RatingSort) => void;
};

/**
 * Derive the caller's own rating from the house/raw read, NEVER the trust-
 * weighted subset (AC-3 honesty rule). Prefer the cap-safe additive
 * `yourRating` field; otherwise scan the raw `ratings` list by npub.
 */
function deriveYourRating(
  house: RatingsSummary | null,
  npub: string | undefined,
): PublicRating | null {
  if (!house) return null;
  // No signed-in identity → no own rating, regardless of what the read carries.
  if (!npub) return null;
  if (house.yourRating !== undefined) return house.yourRating;
  return house.ratings.find((r) => r.npub === npub) ?? null;
}

export function useBookRatings(slug: string): UseBookRatings {
  const session = useSession();
  const { view, npub } = useTrustView();

  const [house, setHouse] = useState<RatingsSummary | null>(null);
  const [yours, setYours] = useState<RatingsSummary | null>(null);
  const [yourRating, setYourRating] = useState<PublicRating | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tasteMatches, setTasteMatches] = useState<Record<string, BylineTasteMatch> | null>(null);
  const [sortBy, setSortBy] = useState<RatingSort>("trusted");

  // The own-rating slice is held separately from the aggregate slices so that
  // toggling House⇄Yours never re-derives it from `weighted` (the honesty seam).
  const ownNpub = session.status === "signed-in" ? session.user.npub : undefined;

  const loadHouse = useCallback(async () => {
    try {
      const h = await api.ratings.list(slug);
      setHouse(h);
      setYourRating(deriveYourRating(h, ownNpub));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [slug, ownNpub]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api.ratings
      .list(slug)
      .then((h) => {
        if (cancelled) return;
        setHouse(h);
        setYourRating(deriveYourRating(h, ownNpub));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, ownNpub]);

  // Story 66 / ADR 0065: the per-rater taste matches for this book's raters,
  // observer-relative to the signed-in viewer. Fetched once per (slug, viewer);
  // absent when signed out (the panel hides the chips + the sort control).
  useEffect(() => {
    if (!ownNpub) {
      setTasteMatches(null);
      return;
    }
    let cancelled = false;
    api.ratings
      .tasteMatches(slug)
      .then((r) => {
        if (!cancelled) setTasteMatches(r.signedIn ? r.matches : null);
      })
      .catch(() => {
        if (!cancelled) setTasteMatches(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, ownNpub]);

  // The "Yours" vantage is fetched only when the active view is Yours and an
  // npub is present (the trust-weighted observer read).
  const fetchedYoursFor = useRef<string | null>(null);
  useEffect(() => {
    if (view !== "yours" || !npub) return;
    if (fetchedYoursFor.current === `${slug}:${npub}` && yours) return;
    let cancelled = false;
    api.ratings
      .list(slug, npub)
      .then((y) => {
        if (cancelled) return;
        fetchedYoursFor.current = `${slug}:${npub}`;
        setYours(y);
      })
      .catch(() => {
        /* keep the prior vantage on a refresh failure */
      });
    return () => {
      cancelled = true;
    };
  }, [view, npub, slug, yours]);

  // ADR 0029 §4: reconcile both slices from the single saved source after a
  // write. The POST returns the refreshed aggregate; the own rating is the value
  // we just published under our own d-tag. No extra fetch on the happy path.
  const applyWrite = useCallback(
    (summary: RatingsSummary, ownRating: PublicRating | null) => {
      setHouse(summary);
      setYourRating(ownRating);
    },
    [],
  );

  return {
    house,
    yours,
    yourRating,
    status,
    applyWrite,
    reload: loadHouse,
    tasteMatches,
    sortBy,
    setSortBy,
  };
}
