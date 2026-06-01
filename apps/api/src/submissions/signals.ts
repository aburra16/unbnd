// Per-submission trust signals (Story 30 / ADR 0031 §3). Decision support
// computed from the HOUSE observer's vantage, reusing the shipped weighted view
// (ADR 0025) — no new trust math:
//   - curatorRatingCount: distinct raters at/above the curator threshold
//   - curatorTagCount: tag-asserters at/above the threshold (rated reads share
//     the same kind-39999 #a query; tag aggregation is a future extension and is
//     0 here until a separate assertions read is wired)
//   - trustedAverage: the trust-WEIGHTED average rating (weightedRatings), null
//     when no rater is trusted
//   - curators: the distinct above-threshold identities as NPUBS (npub-out at the
//     boundary; the web resolves npub→display)
//
// Honest degrade (AC-6): no above-threshold curator → the whole `signals` object
// is null ("no trusted signal yet"). Never a fabricated count, never a raw average
// presented as trusted, never a raw GrapeRank number on the wire.
import { npubEncode } from "nostr-tools/nip19";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { TrustProvider } from "../trust";
import { dedupeRatings, weightedRatings } from "../ratings/summary";

export type SubmissionSignals = {
  readonly trustedAverage: number | null;
  readonly curatorRatingCount: number;
  readonly curatorTagCount: number;
  readonly curators: string[];
};

export async function computeSubmissionSignals(input: {
  readonly trust: TrustProvider;
  readonly houseObserverHex: string;
  readonly threshold: number;
  readonly ratingEvents: SignedNostrEvent[];
}): Promise<SubmissionSignals | null> {
  const { trust, houseObserverHex, threshold, ratingEvents } = input;

  const deduped = dedupeRatings(ratingEvents);
  if (deduped.length === 0) return null;

  let weights: Map<string, number>;
  try {
    weights = await trust.weights(
      houseObserverHex,
      deduped.map((r) => r.pubkey),
    );
  } catch {
    return null; // honest degrade: the seam never throws, but be defensive
  }

  // Above-gate raters: distinct raters whose house-PoV weight ≥ the threshold.
  const aboveGate = deduped.filter((r) => (weights.get(r.pubkey) ?? 0) >= threshold);
  if (aboveGate.length === 0) return null;

  const weighted = weightedRatings(deduped, weights, npubEncode(houseObserverHex));

  return {
    trustedAverage: weighted ? weighted.average : null,
    curatorRatingCount: aboveGate.length,
    curatorTagCount: 0,
    curators: aboveGate.map((r) => npubEncode(r.pubkey)),
  };
}
