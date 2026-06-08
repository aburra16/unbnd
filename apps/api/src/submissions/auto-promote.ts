// Automatic threshold promotion (Story 77 / ADR 0075). A periodic, pure pass: it
// lists submissions, skips any already in the promotions table, and enqueues the
// ones whose trust signal has crossed the threshold (enough distinct above-gate
// curators AND a positive trust-weighted average). It REUSES the manual promote
// path: `enqueuePromotion` into the same table; the off-path promoter worker
// publishes. No new catalog surface, no trust math beyond `computeSubmissionSignals`.
//
import { asHexPubkey, buildBookSubmissionsHeaderAddress, formatAddress, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import type { PromotionStatus } from "../db";
import type { TrustProvider } from "../trust";
import { computeSubmissionSignals } from "./signals";

const KIND = 39999;
const DEFAULT_LIMIT = 200;
const DEFAULT_MIN_AVG = 4.0;
const DEFAULT_THRESHOLD = 0.5;

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

/** Slug from a submission record's `d`-tag. */
function slugOf(event: SignedNostrEvent): string | null {
  return event.tags.find((t) => t[0] === "d")?.[1] ?? null;
}

/** Evaluate all submissions and enqueue the threshold-crossers. Returns the
 * slugs enqueued this pass. No-op (honest) when disabled or unconfigured. */
export async function evaluateAutoPromotions(
  deps: AutoPromoteDeps,
): Promise<{ enqueued: string[] }> {
  const count = deps.config.autoPromoteCuratorCount ?? 0;
  const house = deps.config.houseObserverPubkey;
  const lib = deps.config.librarianPubkey;
  // Off switch / unconfigured → honest no-op.
  if (count <= 0 || !deps.trust || !house || !lib) return { enqueued: [] };
  const minAvg = deps.config.autoPromoteMinAvg ?? DEFAULT_MIN_AVG;
  const threshold = deps.config.curatorThreshold ?? DEFAULT_THRESHOLD;
  const trust = deps.trust;

  const submissionsZ = formatAddress(buildBookSubmissionsHeaderAddress(asHexPubkey(lib)));
  const events = await deps.query({
    kinds: [KIND],
    "#z": [submissionsZ],
    limit: deps.limit ?? DEFAULT_LIMIT,
  });
  const slugs = [...new Set(events.map(slugOf).filter((s): s is string => Boolean(s)))];
  if (slugs.length === 0) return { enqueued: [] };

  // Skip any submission already in the promotions table (any status): never
  // re-evaluate, never double-enqueue, never fight a failed manual job.
  const statuses = await deps.readPromotionStatuses(slugs);
  const candidates = slugs.filter((s) => !statuses.has(s));

  const enqueued: string[] = [];
  for (const slug of candidates) {
    try {
      const ratingEvents = await deps.query({ kinds: [KIND], "#a": [`${KIND}:${lib}:${slug}`] });
      const signals = await computeSubmissionSignals({
        trust,
        houseObserverHex: house,
        threshold,
        ratingEvents,
      });
      if (
        signals &&
        signals.curatorRatingCount >= count &&
        signals.trustedAverage !== null &&
        signals.trustedAverage >= minAvg
      ) {
        // The librarian is the system actor for an automatic promotion.
        await deps.enqueuePromotion(slug, lib);
        enqueued.push(slug);
      }
    } catch {
      // Fault-isolated: a bad submission/read never aborts the whole pass.
    }
  }
  return { enqueued };
}
