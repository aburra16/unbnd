// Validate a client-signed rating event before publishing. ADR 0005.
// Runs verifyEvent on the freshly-parsed body only (ADR 0004 verifiedSymbol
// discipline), checks kind, confirms the event pubkey matches the session
// user, and parses it back to a well-formed BookRating.
import { verifyEvent } from "nostr-tools/pure";
import {
  fromBookRatingEvent,
  fromWireEvent,
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
