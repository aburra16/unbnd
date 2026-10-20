// What the rating routes accept from a signer (Story 99 / ADR 0089 §4): a
// book review (kind 34259) of a catalog book, or a removal (kind 5) of the
// signer's own current review. Signature, author and shape are all checked
// here, before anything reaches Unbnd's relay.
import { verifyEvent } from "nostr-tools/pure";
import {
  BOOK_REVIEW_KIND,
  BOOK_REVIEW_WORDS_MAX,
  reviewedAddressOf,
  starsOf,
  wordsOf,
} from "@unbnd/schemas";

type Code = "invalid_event" | "wrong_kind" | "invalid_signature" | "pubkey_mismatch" | "malformed";

export type ReviewValidation =
  | { readonly ok: true; readonly bookSlug: string; readonly stars: number }
  | { readonly ok: false; readonly code: Code };

export type RemovalValidation = { readonly ok: true } | { readonly ok: false; readonly code: Code };

const HEX64 = /^[0-9a-f]{64}$/;

type MaybeEvent = {
  kind?: unknown;
  pubkey?: unknown;
  sig?: unknown;
  id?: unknown;
  content?: unknown;
  tags?: unknown;
};

/** The checks every signed submission passes: shape, kind, author, signature. */
function signedBy(event: unknown, kind: number, me: string): { ok: true; tags: string[][]; content: string } | { ok: false; code: Code } {
  if (typeof event !== "object" || event === null) return { ok: false, code: "invalid_event" };
  const e = event as MaybeEvent;
  if (e.kind !== kind) return { ok: false, code: "wrong_kind" };
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) return { ok: false, code: "invalid_event" };
  if (typeof e.sig !== "string" || typeof e.id !== "string") return { ok: false, code: "invalid_event" };
  if (typeof e.content !== "string" || !Array.isArray(e.tags)) return { ok: false, code: "invalid_event" };
  if (e.pubkey !== me) return { ok: false, code: "pubkey_mismatch" };
  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) return { ok: false, code: "invalid_signature" };
  return { ok: true, tags: e.tags as string[][], content: e.content };
}

/**
 * A review the caller signed: of a book in the librarian's catalog, under the
 * `book:` d, with 1 to 5 whole stars (Unbnd's composer requires them) and
 * words within the limit.
 */
export function validateSignedReview(event: unknown, me: string, librarian: string): ReviewValidation {
  const base = signedBy(event, BOOK_REVIEW_KIND, me);
  if (!base.ok) return base;
  const prefix = `39999:${librarian}:`;
  const address = reviewedAddressOf({ tags: base.tags });
  const d = base.tags.find((t) => t[0] === "d")?.[1];
  if (!address || !address.startsWith(prefix) || address.length === prefix.length) return { ok: false, code: "malformed" };
  if (d !== `book:${address}`) return { ok: false, code: "malformed" };
  const stars = starsOf({ tags: base.tags });
  if (stars === null || !Number.isInteger(stars)) return { ok: false, code: "malformed" };
  if (wordsOf({ tags: base.tags, content: base.content }).length > BOOK_REVIEW_WORDS_MAX) {
    return { ok: false, code: "malformed" };
  }
  return { ok: true, bookSlug: address.slice(prefix.length), stars };
}

/** A removal the caller signed, naming their current review by `e` and `a`, with `k`. */
export function validateSignedRemoval(
  event: unknown,
  me: string,
  current: { readonly id: string; readonly d: string },
): RemovalValidation {
  const base = signedBy(event, 5, me);
  if (!base.ok) return base;
  const has = (name: string, value: string) => base.tags.some((t) => t[0] === name && t[1] === value);
  if (!has("e", current.id)) return { ok: false, code: "malformed" };
  if (!has("a", `${BOOK_REVIEW_KIND}:${me}:${current.d}`)) return { ok: false, code: "malformed" };
  if (!has("k", String(BOOK_REVIEW_KIND))) return { ok: false, code: "malformed" };
  return { ok: true };
}
