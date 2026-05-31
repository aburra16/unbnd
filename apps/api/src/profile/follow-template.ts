// Pure kind-3 follow merge / build helpers for the contact-list write path
// (ADR 0023). The kind-0 twin of these lives in `substack-template.ts`. The one
// load-bearing difference from kind-0: the follow data lives in the `tags`
// array (each `p` tag is NIP-02-shaped `["p", hex, relayHint?, petname?]`), not
// in `content`. The merge must add/remove ONLY the one target `p` tag by its
// `tag[1]` pubkey and preserve every other tag — every other `p` tag with its
// full relay-hint/petname payload AND its position, and every non-`p` tag —
// byte-identically. Anything less silently wipes the user's follow graph.
import type { NostrEventTemplate } from "@unbnd/schemas";

export type FollowErrorCode = "invalid_target" | "self_follow";

export class FollowError extends Error {
  constructor(
    readonly code: FollowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FollowError";
  }
}

export type FollowAction = "follow" | "unfollow";

/**
 * Merge one target into a CLONE of the raw kind-3 tags, touching no other tag.
 *
 * - `follow`: append `["p", targetHex]` ONLY if no `p` tag already has
 *   `tag[1] === targetHex` (idempotent — an already-followed target is a no-op
 *   that keeps its existing tag's full payload, never adds a duplicate or
 *   flattens it).
 * - `unfollow`: drop ONLY the `p` tag(s) whose `tag[1] === targetHex`; if none
 *   match, a no-op that strips no one else.
 *
 * Every other tag (other `p` tags with relay-hint/petname positions intact, and
 * any non-`p` tag) is preserved verbatim and in order. The input array AND its
 * inner tag arrays are never mutated (deep-enough clone). `null` tags (the
 * viewer had no kind-3): `follow` ⇒ `[["p", targetHex]]`; `unfollow` ⇒ `[]`.
 */
export function mergeFollow(
  rawTags: string[][] | null,
  targetHex: string,
  action: FollowAction,
): string[][] {
  // Deep-enough clone: copy every inner tag so a returned tag never shares a
  // reference with the input.
  const cloned: string[][] = (rawTags ?? []).map((tag) => [...tag]);

  if (action === "unfollow") {
    return cloned.filter((tag) => !(tag[0] === "p" && tag[1] === targetHex));
  }

  const already = cloned.some((tag) => tag[0] === "p" && tag[1] === targetHex);
  if (already) return cloned;
  return [...cloned, ["p", targetHex]];
}

/**
 * Build the unsigned kind-3 template from the merged tags. `content` is
 * preserved VERBATIM from the fetched event (kind-3 content is occasionally a
 * legacy relay-list JSON that must never be clobbered; `""` when there was no
 * event). Not `toWireTemplate` — kind-3 is not a DList payload.
 */
export function buildKind3Template(
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
