// Failing tests (red) for Story 22 — server-side validation of a client-signed
// kind-0. ADR 0022 Implementation notes, new file
// `apps/api/src/profile/validate-kind0.ts`:
//   `validateSignedKind0(event, sessionPubkeyHex, expectedSubstack)` mirrors
//   `validateSignedRating`. It checks: kind === 0, hex pubkey, pubkey === session,
//   verifyEvent passes, content parses as an object, and content.substack is a
//   valid http(s) URL or absent (the one field this story owns). pubkey mismatch
//   → a `pubkey_mismatch` code (the route maps to 403); a bad signature → an
//   `invalid_signature` code; a substack that is not http(s) (or present-but-junk)
//   → rejected. The helper does not exist yet → import fails → red.
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { validateSignedKind0 } from "../../src/profile/validate-kind0";

/** Build a wire-realistic, signed kind-0 for a fresh keypair. */
function signedKind0(content: Record<string, unknown>, sk = generateSecretKey()) {
  const pubkey = getPublicKey(sk);
  const signed = finalizeEvent(
    {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(content),
    },
    sk,
  );
  return {
    sk,
    pubkey,
    event: JSON.parse(JSON.stringify(signed)) as typeof signed,
  };
}

describe("validateSignedKind0 (AC-6 / AC-7)", () => {
  it("accepts an honest signed kind-0 whose pubkey matches the session and whose substack is valid http(s)", () => {
    const { event, pubkey } = signedKind0({
      name: "mira",
      substack: "https://mira.substack.com",
    });
    const r = validateSignedKind0(event, pubkey, "https://mira.substack.com");
    expect(r.ok).toBe(true);
  });

  it("accepts a signed kind-0 that clears substack (the key is absent)", () => {
    const { event, pubkey } = signedKind0({ name: "mira" });
    const r = validateSignedKind0(event, pubkey, "clear");
    expect(r.ok).toBe(true);
  });

  it("rejects an event whose pubkey is not the session user (no writing as someone else)", () => {
    const { event } = signedKind0({ substack: "https://x.substack.com" });
    const otherPubkey = getPublicKey(generateSecretKey());
    const r = validateSignedKind0(event, otherPubkey, "https://x.substack.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("pubkey_mismatch");
  });

  it("rejects a tampered event (broken signature)", () => {
    const { event, pubkey } = signedKind0({ substack: "https://x.substack.com" });
    const tampered = { ...event, content: JSON.stringify({ substack: "https://evil.com" }) };
    const r = validateSignedKind0(tampered, pubkey, "https://x.substack.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_signature");
  });

  it("rejects the wrong kind (a non-kind-0 event)", () => {
    const { event, pubkey } = signedKind0({ substack: "https://x.substack.com" });
    const wrongKind = { ...event, kind: 1 };
    const r = validateSignedKind0(wrongKind, pubkey, "https://x.substack.com");
    expect(r.ok).toBe(false);
  });

  it("rejects a signed event whose substack is NOT a valid http(s) URL", () => {
    const { event, pubkey } = signedKind0({
      name: "mira",
      // eslint-disable-next-line no-script-url
      substack: "javascript:alert(1)",
    });
    const r = validateSignedKind0(event, pubkey, "javascript:alert(1)");
    expect(r.ok).toBe(false);
  });

  it("rejects junk input", () => {
    expect(validateSignedKind0(null, "a".repeat(64), "clear").ok).toBe(false);
    expect(validateSignedKind0({}, "a".repeat(64), "clear").ok).toBe(false);
  });
});
