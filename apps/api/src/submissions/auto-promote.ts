// Automatic threshold promotion (Story 77 / ADR 0075). A periodic, pure pass: it
// lists submissions, skips any already in the promotions table, and enqueues the
// ones whose trust signal has crossed the threshold (enough distinct above-gate
// curators AND a positive trust-weighted average). It REUSES the manual promote
// path — `enqueuePromotion` into the same table; the off-path promoter worker
// publishes. No new catalog surface, no trust math beyond `computeSubmissionSignals`.
//
// STUB (Test Design phase): signature is final; the body is a no-op so the red
// tests compile and fail. Real logic lands in Implementation.
import { asHexPubkey, buildBookSubmissionsHeaderAddress, formatAddress, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import type { PromotionStatus } from "../db";
import type { TrustProvider } from "../trust";
import { computeSubmissionSignals } from "./signals";

export type AutoPromoteDeps = {
  readonly config: Pick<
    Config,
    | "curatorThreshold"
    | "houseObserverPubkey"
    | "librarianPubkey"
    | "autoPromoteCuratorCount"
    | "autoPromoteMinAvg"
  >;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly trust?: TrustProvider;
  readonly readPromotionStatuses: (slugs: string[]) => Promise<Map<string, PromotionStatus>>;
  readonly enqueuePromotion: (slug: string, requestedBy: string) => Promise<unknown>;
  /** Max submissions evaluated per pass (bounded read). */
  readonly limit?: number;
};

/** Evaluate all submissions and enqueue the threshold-crossers. Returns the
 * slugs enqueued this pass. No-op (honest) when disabled or unconfigured. */
export async function evaluateAutoPromotions(
  _deps: AutoPromoteDeps,
): Promise<{ enqueued: string[] }> {
  // STUB. (References the reused helpers so the imports are real.)
  void asHexPubkey;
  void buildBookSubmissionsHeaderAddress;
  void formatAddress;
  void computeSubmissionSignals;
  return { enqueued: [] };
}
