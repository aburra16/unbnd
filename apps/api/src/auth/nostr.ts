// NIP-07 signed-challenge verification per ADR 0004.
//
// SECURITY: only ever pass the freshly-parsed request body here. nostr-tools
// memoizes verification via a `verifiedSymbol`, so a spread/derived copy of an
// already-verified event can return a false "valid". A JSON-parsed body has no
// such symbol, so verifyEvent actually runs.
import { verifyEvent } from "nostr-tools/pure";

export const NIP42_KIND = 22242;

export type ChallengeVerification =
  | { readonly ok: true; readonly pubkey: string; readonly challenge: string }
  | { readonly ok: false; readonly reason: string };

const HEX64 = /^[0-9a-f]{64}$/;

type MaybeEvent = {
  kind?: unknown;
  pubkey?: unknown;
  sig?: unknown;
  created_at?: unknown;
  content?: unknown;
  tags?: unknown;
  id?: unknown;
};

function fail(reason: string): ChallengeVerification {
  return { ok: false, reason };
}

/**
 * Verify a NIP-42 signed challenge event. Checks: shape (kind 22242, 64-hex
 * pubkey, present sig/id), a valid signature (nostr-tools verifyEvent),
 * created_at within `maxSkewSec`, and a present `challenge` tag. Returns the
 * pubkey + challenge for the caller to match against the challenges table.
 * Does NOT touch the database.
 */
export function verifySignedChallenge(
  event: unknown,
  maxSkewSec = 600,
): ChallengeVerification {
  if (typeof event !== "object" || event === null) {
    return fail("not an event object");
  }
  const e = event as MaybeEvent;

  if (e.kind !== NIP42_KIND) return fail("wrong kind");
  if (typeof e.pubkey !== "string" || !HEX64.test(e.pubkey)) {
    return fail("invalid pubkey");
  }
  if (typeof e.sig !== "string" || typeof e.id !== "string") {
    return fail("missing signature");
  }
  if (typeof e.created_at !== "number") return fail("missing created_at");
  if (!Array.isArray(e.tags)) return fail("missing tags");

  // Clock-skew window (defense in depth — the challenge's own expiry is the
  // primary bound).
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - e.created_at) > maxSkewSec) {
    return fail("stale created_at");
  }

  const challengeTag = (e.tags as unknown[]).find(
    (t): t is string[] =>
      Array.isArray(t) && t[0] === "challenge" && typeof t[1] === "string",
  );
  if (!challengeTag) return fail("missing challenge tag");

  // Cryptographic check last (most expensive). verifyEvent validates both the
  // event id integrity (which covers a tampered pubkey/content) and the
  // schnorr signature against the pubkey.
  if (!verifyEvent(event as Parameters<typeof verifyEvent>[0])) {
    return fail("invalid signature");
  }

  return { ok: true, pubkey: e.pubkey, challenge: challengeTag[1]! };
}
