// Validate a client-signed kind-0 (NIP-01 user metadata) before publishing.
// ADR 0022. Mirrors `apps/api/src/ratings/validate.ts`: runs verifyEvent on the
// freshly-parsed body only (ADR 0004 verifiedSymbol discipline), checks kind,
// confirms the event pubkey matches the session user, parses content as an
// object, and pins the one field this story owns — `substack` must be a valid
// http(s) URL or absent. It does NOT re-verify the user's other preserved
// fields (the client may legitimately hold a newer kind-0).
import { verifyEvent } from "nostr-tools/pure";

export type Kind0Validation =
  | { readonly ok: true }
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

function fail(code: Exclude<Kind0Validation, { ok: true }>["code"]): Kind0Validation {
  return { ok: false, code };
}

/** Light http(s) check matching the read-side `httpUrl` in profile.ts. */
function isHttpUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `expectedSubstack` is the server-intended value for the field this story
 * owns: the normalized URL, or `"clear"` when the field should be absent. We
 * verify the signed content's `substack` is a valid http(s) URL or absent —
 * the ADR minimum guard. (We do not byte-compare against `expectedSubstack`;
 * the redundant `url` body hint is accepted but the signed content is the
 * source of truth.)
 */
export function validateSignedKind0(
  event: unknown,
  sessionPubkey: string,
  _expectedSubstack: string | "clear",
): Kind0Validation {
  if (typeof event !== "object" || event === null) return fail("invalid_event");
  const e = event as MaybeEvent;

  if (e.kind !== 0) return fail("wrong_kind");
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

  let content: unknown;
  try {
    content = JSON.parse(e.content);
  } catch {
    return fail("malformed");
  }
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return fail("malformed");
  }

  // The one field this story owns: valid http(s) URL or absent.
  const substack = (content as Record<string, unknown>).substack;
  if (substack !== undefined && !isHttpUrl(substack)) {
    return fail("malformed");
  }

  return { ok: true };
}
