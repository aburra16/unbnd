// Validate a client-signed author-edits overlay before publishing. Story 32 / ADR
// 0033 §4. Mirrors claims/validate.ts: verifyEvent on the freshly-parsed body only,
// kind check, confirms the event pubkey (the author/signer) matches the session
// user, ENFORCES the three-field whitelist (blurb / coverUrl / purchaseUrl + the
// envelope's bookSlug/bookAtag) — a smuggled editable field (e.g. title) →
// invalid_event — and parses it back to a well-formed BookAuthorOverlay.
import { verifyEvent } from "nostr-tools/pure";
import {
  fromBookAuthorOverlayEvent,
  fromWireEvent,
  type BookAuthorOverlay,
} from "@unbnd/schemas";

export const BOOK_AUTHOR_OVERLAY_KIND = 39999;

// The only keys the overlay payload may carry. `bookSlug`/`bookAtag` are the
// envelope's reference fields; the editable trio is blurb/coverUrl/purchaseUrl.
const ALLOWED_PAYLOAD_KEYS = new Set([
  "bookSlug",
  "bookAtag",
  "blurb",
  "coverUrl",
  "purchaseUrl",
]);

export type AuthorOverlayValidation =
  | { readonly ok: true; readonly overlay: BookAuthorOverlay }
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
  code: Exclude<AuthorOverlayValidation, { ok: true }>["code"],
): AuthorOverlayValidation {
  return { ok: false, code };
}

function payloadKeysAllowed(tags: string[][]): boolean {
  const jsonTag = tags.find((t) => t[0] === "json");
  if (!jsonTag || typeof jsonTag[1] !== "string") return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonTag[1]);
  } catch {
    return false;
  }
  const inner = (parsed as { bookAuthorOverlay?: unknown })?.bookAuthorOverlay;
  if (typeof inner !== "object" || inner === null) return false;
  for (const key of Object.keys(inner)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) return false;
  }
  return true;
}

export function validateSignedAuthorOverlay(
  event: unknown,
  sessionPubkey: string,
): AuthorOverlayValidation {
  if (typeof event !== "object" || event === null) return fail("invalid_event");
  const e = event as MaybeEvent;

  if (e.kind !== BOOK_AUTHOR_OVERLAY_KIND) return fail("wrong_kind");
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) {
    return fail("invalid_event");
  }
  if (typeof e.sig !== "string" || typeof e.id !== "string") {
    return fail("invalid_event");
  }
  if (typeof e.content !== "string" || !Array.isArray(e.tags)) {
    return fail("invalid_event");
  }

  // The signer must be the session author.
  if (e.pubkey !== sessionPubkey) return fail("pubkey_mismatch");

  // The three-field whitelist: any extra editable field is rejected (AC-5).
  if (!payloadKeysAllowed(e.tags as string[][])) return fail("invalid_event");

  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
    return fail("invalid_signature");
  }

  try {
    const unsigned = fromWireEvent({
      kind: e.kind,
      content: e.content,
      tags: e.tags as string[][],
    });
    const overlay = fromBookAuthorOverlayEvent(unsigned as never);
    return { ok: true, overlay };
  } catch {
    return fail("malformed");
  }
}
