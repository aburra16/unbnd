// NIP-07 signed-challenge verification per ADR 0004. Stub throws until
// implemented.
//
// SECURITY: only ever pass the freshly-parsed request body here. nostr-tools
// memoizes verification via a `verifiedSymbol`, so a spread/derived copy of an
// already-verified event can return a false "valid". A JSON-parsed body has no
// such symbol, so verifyEvent actually runs.

export const NIP42_KIND = 22242;

export type ChallengeVerification =
  | { readonly ok: true; readonly pubkey: string; readonly challenge: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Verify a NIP-42 signed challenge event. Checks: shape (kind 22242, 64-hex
 * pubkey, present sig), a valid signature (nostr-tools verifyEvent),
 * created_at within `maxSkewSec`, and a present `challenge` tag. Returns the
 * pubkey + challenge for the caller to match against the challenges table.
 * Does NOT touch the database.
 */
export function verifySignedChallenge(
  _event: unknown,
  _maxSkewSec = 600,
): ChallengeVerification {
  throw new Error("verifySignedChallenge not implemented");
}
