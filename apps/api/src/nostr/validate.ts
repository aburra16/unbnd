// Generic signed-event validation for user writes (ADR 0009). verifyEvent on
// the freshly-parsed body (ADR 0004 verifiedSymbol discipline), kind check, and
// pubkey==session. Shared by tag assertions (and reusable by ratings).
import { verifyEvent } from "nostr-tools/pure";

export type SignedValidation =
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

export function validateSignedEvent(
  event: unknown,
  sessionPubkey: string,
  kind: number,
): SignedValidation {
  if (typeof event !== "object" || event === null) return { ok: false, code: "invalid_event" };
  const e = event as MaybeEvent;
  if (e.kind !== kind) return { ok: false, code: "wrong_kind" };
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) {
    return { ok: false, code: "invalid_event" };
  }
  if (typeof e.sig !== "string" || typeof e.id !== "string") {
    return { ok: false, code: "invalid_event" };
  }
  if (typeof e.content !== "string" || !Array.isArray(e.tags)) {
    return { ok: false, code: "invalid_event" };
  }
  if (e.pubkey !== sessionPubkey) return { ok: false, code: "pubkey_mismatch" };
  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
    return { ok: false, code: "invalid_signature" };
  }
  return { ok: true };
}
