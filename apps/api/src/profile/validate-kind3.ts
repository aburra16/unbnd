// Validate a client-signed kind-3 (NIP-02 contact list) before publishing.
// ADR 0023. Mirrors `validate-kind0.ts`: runs verifyEvent on the freshly-parsed
// body only (ADR 0004 verifiedSymbol discipline), checks kind, confirms the
// event pubkey matches the session user, and confirms `tags` is an array. There
// is NO content guard — kind-3 content is free-form / legacy (sometimes a relay
// -list JSON) and is preserved as-is. The sovereign client is the source of
// truth for the merge; the server only pins identity + structure (AC-6).
import { verifyEvent } from "nostr-tools/pure";

export type Kind3Validation =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        | "invalid_event"
        | "wrong_kind"
        | "invalid_signature"
        | "pubkey_mismatch";
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

function fail(code: Exclude<Kind3Validation, { ok: true }>["code"]): Kind3Validation {
  return { ok: false, code };
}

export function validateSignedKind3(
  event: unknown,
  sessionPubkey: string,
): Kind3Validation {
  if (typeof event !== "object" || event === null) return fail("invalid_event");
  const e = event as MaybeEvent;

  if (e.kind !== 3) return fail("wrong_kind");
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

  return { ok: true };
}
