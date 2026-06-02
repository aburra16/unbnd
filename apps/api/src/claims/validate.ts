// Validate a client-signed claim event before publishing. Story 31 / ADR 0032 §1.
// Mirrors ratings/validate.ts: verifyEvent on the freshly-parsed body only (ADR
// 0004 verifiedSymbol discipline), kind check, confirms the event pubkey matches
// the session user, and parses it back to a well-formed BookClaim.
import { verifyEvent } from "nostr-tools/pure";
import {
  fromBookClaimEvent,
  fromWireEvent,
  type BookClaim,
} from "@unbnd/schemas";

export const BOOK_CLAIM_KIND = 39999;

export type ClaimValidation =
  | { readonly ok: true; readonly claim: BookClaim }
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

function fail(code: Exclude<ClaimValidation, { ok: true }>["code"]): ClaimValidation {
  return { ok: false, code };
}

export function validateSignedClaim(
  event: unknown,
  sessionPubkey: string,
): ClaimValidation {
  if (typeof event !== "object" || event === null) return fail("invalid_event");
  const e = event as MaybeEvent;

  if (e.kind !== BOOK_CLAIM_KIND) return fail("wrong_kind");
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
    const claim = fromBookClaimEvent(unsigned as never);
    return { ok: true, claim };
  } catch {
    return fail("malformed");
  }
}
