// Failing tests (red) for Story 23 — server-side validation of a client-signed
// kind-3. ADR 0023 Decision 1 / Implementation notes, new file
// `apps/api/src/profile/validate-kind3.ts`:
//   `validateSignedKind3(event, sessionPubkeyHex)` mirrors `validateSignedKind0`.
//   It checks: kind === 3, hex pubkey, pubkey === session (else pubkey_mismatch),
//   verifyEvent passes (else invalid_signature), `tags` is an array. No content
//   guard — kind-3 content is free-form/legacy and preserved as-is.
//
// The helper does not exist yet → import fails → red. The AC this pins is AC-6
// (sovereign tier signs via NIP-07; the server only confirms identity + structure
// of the signed event, never re-derives the merge).
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { validateSignedKind3 } from "../../src/profile/validate-kind3";

/** Build a wire-realistic, signed kind-3 for a fresh keypair. */
function signedKind3(tags: string[][], content = "", sk = generateSecretKey()) {
  const pubkey = getPublicKey(sk);
  const signed = finalizeEvent(
    { kind: 3, created_at: Math.floor(Date.now() / 1000), tags, content },
    sk,
  );
  return { sk, pubkey, event: JSON.parse(JSON.stringify(signed)) as typeof signed };
}

describe("validateSignedKind3 (AC-6)", () => {
  it("accepts an honest signed kind-3 whose pubkey matches the session", () => {
    const { event, pubkey } = signedKind3([["p", "a".repeat(64)]]);
    const r = validateSignedKind3(event, pubkey);
    expect(r.ok).toBe(true);
  });

  it("accepts a kind-3 carrying relay-hints, petnames, and a legacy content payload", () => {
    const { event, pubkey } = signedKind3(
      [["p", "a".repeat(64), "wss://relay.damus.io", "alice"]],
      '{"wss://relay.damus.io":{"read":true,"write":true}}',
    );
    expect(validateSignedKind3(event, pubkey).ok).toBe(true);
  });

  it("accepts a kind-3 with an empty follow list (the viewer just unfollowed their last follow)", () => {
    const { event, pubkey } = signedKind3([]);
    expect(validateSignedKind3(event, pubkey).ok).toBe(true);
  });

  it("rejects an event whose pubkey is not the session user (pubkey_mismatch → 403)", () => {
    const { event } = signedKind3([["p", "a".repeat(64)]]);
    const otherPubkey = getPublicKey(generateSecretKey());
    const r = validateSignedKind3(event, otherPubkey);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("pubkey_mismatch");
  });

  it("rejects a tampered event (broken signature)", () => {
    const { event, pubkey } = signedKind3([["p", "a".repeat(64)]]);
    const tampered = { ...event, tags: [["p", "e".repeat(64)]] };
    const r = validateSignedKind3(tampered, pubkey);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_signature");
  });

  it("rejects the wrong kind (a non-kind-3 event)", () => {
    const { event, pubkey } = signedKind3([["p", "a".repeat(64)]]);
    const wrongKind = { ...event, kind: 0 };
    expect(validateSignedKind3(wrongKind, pubkey).ok).toBe(false);
  });

  it("rejects junk / structurally-invalid input", () => {
    expect(validateSignedKind3(null, "a".repeat(64)).ok).toBe(false);
    expect(validateSignedKind3({}, "a".repeat(64)).ok).toBe(false);
  });
});
