// Validate a client-signed rating event before publishing. ADR 0005.
// Runs verifyEvent on the freshly-parsed body only (ADR 0004 verifiedSymbol
// discipline), checks kind, confirms the event pubkey matches the session
// user, and parses it back to a well-formed BookRating.
import { verifyEvent } from "nostr-tools/pure";
import {
  asHexPubkey,
  buildBookRatingDTag,
  fromBookRatingEvent,
  fromWireEvent,
  isRatingRetraction,
  type BookRating,
} from "@unbnd/schemas";

export const BOOK_RATING_KIND = 39999;

export type RatingValidation =
  | { readonly ok: true; readonly rating: BookRating }
  | {
      readonly ok: false;
      readonly code:
        | "invalid_event"
        | "wrong_kind"
        | "invalid_signature"
        | "pubkey_mismatch"
        | "malformed";
    };

const HEX64 = /^[0-9a-f]{64}$/;

type MaybeEvent = {
  kind?: unknown;
  pubkey?: unknown;
  sig?: unknown;
  id?: unknown;
  content?: unknown;
  tags?: unknown;
};

function fail(code: Exclude<RatingValidation, { ok: true }>["code"]): RatingValidation {
  return { ok: false, code };
}

export function validateSignedRating(
  event: unknown,
  sessionPubkey: string,
): RatingValidation {
  if (typeof event !== "object" || event === null) return fail("invalid_event");
  const e = event as MaybeEvent;

  if (e.kind !== BOOK_RATING_KIND) return fail("wrong_kind");
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) {
    return fail("invalid_event");
  }
  if (typeof e.sig !== "string" || typeof e.id !== "string") {
    return fail("invalid_event");
  }
  if (typeof e.content !== "string" || !Array.isArray(e.tags)) {
    return fail("invalid_event");
  }

  // Identity gate before the (more expensive) signature check.
  if (e.pubkey !== sessionPubkey) return fail("pubkey_mismatch");

  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
    return fail("invalid_signature");
  }

  try {
    const unsigned = fromWireEvent({
      kind: e.kind,
      content: e.content,
      tags: e.tags as string[][],
    });
    const rating = fromBookRatingEvent(unsigned as never);
    if (!Number.isInteger(rating.score) || rating.score < 1 || rating.score > 5) {
      return fail("malformed");
    }
    return { ok: true, rating };
  } catch {
    return fail("malformed");
  }
}

export type RetractionValidation =
  | { readonly ok: true; readonly bookSlug: string }
  | {
      readonly ok: false;
      readonly code:
        | "invalid_event"
        | "wrong_kind"
        | "invalid_signature"
        | "pubkey_mismatch"
        | "malformed";
    };

function failRetraction(
  code: Exclude<RetractionValidation, { ok: true }>["code"],
): RetractionValidation {
  return { ok: false, code };
}

/**
 * Validate a client-signed rating RETRACTION before publishing (Story 79 /
 * ADR 0077): same structural + identity + signature discipline as
 * `validateSignedRating`, then tag-level retraction checks: the marker
 * present, NO score, and the d-tag is the CALLER'S OWN rating address
 * (`rating--<slug>--<rater8>` derived from the signing pubkey), so a caller
 * can only ever retract their own rating.
 */
export function validateSignedRetraction(
  event: unknown,
  sessionPubkey: string,
): RetractionValidation {
  if (typeof event !== "object" || event === null) {
    return failRetraction("invalid_event");
  }
  const e = event as MaybeEvent;

  if (e.kind !== BOOK_RATING_KIND) return failRetraction("wrong_kind");
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) {
    return failRetraction("invalid_event");
  }
  if (typeof e.sig !== "string" || typeof e.id !== "string") {
    return failRetraction("invalid_event");
  }
  if (typeof e.content !== "string" || !Array.isArray(e.tags)) {
    return failRetraction("invalid_event");
  }

  // Identity gate before the (more expensive) signature check.
  if (e.pubkey !== sessionPubkey) return failRetraction("pubkey_mismatch");

  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
    return failRetraction("invalid_signature");
  }

  const tags = e.tags as string[][];
  if (!isRatingRetraction({ kind: BOOK_RATING_KIND, tags })) {
    return failRetraction("malformed"); // not a retraction (e.g. a rating)
  }
  if (tags.some((t) => t[0] === "score")) {
    return failRetraction("malformed"); // a retraction never carries a score
  }
  const bookSlug = tags.find((t) => t[0] === "t")?.[1];
  if (typeof bookSlug !== "string" || bookSlug === "") {
    return failRetraction("malformed");
  }
  const dTag = tags.find((t) => t[0] === "d")?.[1];
  if (dTag !== buildBookRatingDTag(bookSlug, asHexPubkey(e.pubkey))) {
    return failRetraction("malformed"); // not the caller's own rating address
  }
  return { ok: true, bookSlug };
}
