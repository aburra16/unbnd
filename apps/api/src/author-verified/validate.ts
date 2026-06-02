// Validate a client-signed author-verified assertion before publishing. Story 32 /
// ADR 0033 §1. Mirrors claims/validate.ts: verifyEvent on the freshly-parsed body
// only, kind check, confirms the event pubkey (the curator/signer) matches the
// session user, and parses it back to a well-formed AuthorVerifiedAssertion.
import { verifyEvent } from "nostr-tools/pure";
import {
  fromAuthorVerifiedEvent,
  fromWireEvent,
  type AuthorVerifiedAssertion,
} from "@unbnd/schemas";

export const AUTHOR_VERIFIED_KIND = 39999;

export type AuthorVerifiedValidation =
  | { readonly ok: true; readonly assertion: AuthorVerifiedAssertion }
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

function fail(
  code: Exclude<AuthorVerifiedValidation, { ok: true }>["code"],
): AuthorVerifiedValidation {
  return { ok: false, code };
}

export function validateSignedAuthorVerified(
  event: unknown,
  sessionPubkey: string,
): AuthorVerifiedValidation {
  if (typeof event !== "object" || event === null) return fail("invalid_event");
  const e = event as MaybeEvent;

  if (e.kind !== AUTHOR_VERIFIED_KIND) return fail("wrong_kind");
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) {
    return fail("invalid_event");
  }
  if (typeof e.sig !== "string" || typeof e.id !== "string") {
    return fail("invalid_event");
  }
  if (typeof e.content !== "string" || !Array.isArray(e.tags)) {
    return fail("invalid_event");
  }

  // The signer must be the session curator.
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
    const assertion = fromAuthorVerifiedEvent(unsigned as never);
    return { ok: true, assertion };
  } catch {
    return fail("malformed");
  }
}
