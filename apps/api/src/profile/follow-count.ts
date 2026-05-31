// Shared kind-3 follow counter (ADR 0023 / 0026). The one canonical count of a
// user's own distinct `p`-tags on their freshest kind-3, used by the profile
// stats route (`followingCount`) and the custodial personalize follow gate.
import type { SignedNostrEvent } from "@unbnd/schemas";

/** Count DISTINCT `p`-tag hexes on the freshest kind-3 (non-`p` tags ignored). */
export function distinctFollowCount(events: SignedNostrEvent[]): number {
  const newest = events
    .filter((e) => e.kind === 3)
    .reduce<SignedNostrEvent | null>(
      (best, e) => (best === null || e.created_at > best.created_at ? e : best),
      null,
    );
  if (!newest) return 0;
  const hexes = new Set<string>();
  for (const tag of newest.tags) {
    if (tag[0] === "p" && typeof tag[1] === "string") hexes.add(tag[1]);
  }
  return hexes.size;
}
