// Validate a client-signed rating event before publishing. ADR 0005.
// Runs verifyEvent on the freshly-parsed body only (ADR 0004 verifiedSymbol
// discipline), checks kind, confirms the event pubkey matches the session
// user, and parses it back to a well-formed BookRating.
import type { BookRating } from "@unbnd/schemas";

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

export function validateSignedRating(
  _event: unknown,
  _sessionPubkey: string,
): RatingValidation {
  throw new Error("validateSignedRating not implemented");
}
