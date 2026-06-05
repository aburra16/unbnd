// Pure kind-3 seed-follow merge / build helpers for the librarian worker
// (Story 58 / ADR 0057 §3). Mirrors apps/api/src/profile/follow-template.ts's
// merge semantics, generalized to MANY seed-curator targets in one pass —
// re-declared worker-side rather than imported, to keep the worker off any
// apps/api coupling (same posture as the seeder mirroring its own builders).
//
// The follow data lives in the `tags` array (each `p` tag is NIP-02-shaped
// `["p", hex, relayHint?, petname?]`), not in `content`. The merge adds ONLY
// the missing seed `p` tags by their `tag[1]` pubkey and preserves every other
// tag — every existing `p` tag with its full relay-hint/petname payload AND its
// position, and every non-`p` tag — byte-identically. Anything less silently
// wipes the librarian's follow graph.
import type { NostrEventTemplate } from "@unbnd/schemas";

/**
 * Merge a set of seed-curator pubkeys into a CLONE of the librarian's existing
 * kind-3 tags, touching no other tag. For each seed hex append `["p", hex]`
 * ONLY if no `p` tag already has `tag[1] === hex` (idempotent union — a seed
 * already followed is a no-op that keeps its existing tag's full payload, never
 * adds a duplicate or flattens it). Seeds are appended in input order after the
 * preserved tags. The input array AND its inner tag arrays are never mutated
 * (deep-enough clone). `null` existing tags (no prior kind-3) + N seeds ⇒ N
 * `["p", hex]` tags in input order.
 */
export function mergeSeedFollows(
  rawTags: string[][] | null,
  seedCuratorHexes: readonly string[],
): string[][] {
  // Deep-enough clone: copy every inner tag so a returned tag never shares a
  // reference with the input.
  const merged: string[][] = (rawTags ?? []).map((tag) => [...tag]);

  for (const hex of seedCuratorHexes) {
    const already = merged.some((tag) => tag[0] === "p" && tag[1] === hex);
    if (!already) merged.push(["p", hex]);
  }

  return merged;
}

/**
 * Build the unsigned kind-3 template from the merged tags. `content` is
 * preserved VERBATIM from the fetched event (kind-3 content is occasionally a
 * legacy relay-list JSON that must never be clobbered; `""` when there was no
 * event). Not `toWireTemplate` — kind-3 is not a DList payload.
 */
export function buildLibrarianKind3Template(
  tags: string[][],
  content: string,
  createdAt: number,
): NostrEventTemplate {
  return {
    kind: 3,
    created_at: createdAt,
    content,
    tags,
  };
}
