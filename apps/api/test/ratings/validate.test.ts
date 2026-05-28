import { describe, expect, it } from "vitest";
import { getPublicKey, generateSecretKey } from "nostr-tools/pure";
import { asHexPubkey } from "@unbnd/schemas";
import { validateSignedRating } from "../../src/ratings/validate";
import { signedRating } from "./_fixtures";

describe("validateSignedRating", () => {
  it("accepts an honest signed rating whose pubkey matches the session", () => {
    const { event, pubkey } = signedRating({ score: 5, bookSlug: "orbital" });
    const r = validateSignedRating(event, pubkey);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rating.bookSlug).toBe("orbital");
      expect(r.rating.score).toBe(5);
      expect(r.rating.raterPubkey).toBe(pubkey);
    }
  });

  it("rejects an event whose pubkey is not the session user (no rating as someone else)", () => {
    const { event } = signedRating();
    const otherPubkey = asHexPubkey(getPublicKey(generateSecretKey()));
    const r = validateSignedRating(event, otherPubkey);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("pubkey_mismatch");
  });

  it("rejects a tampered event (broken signature)", () => {
    const { event, pubkey } = signedRating({ score: 3 });
    const tampered = { ...event, content: "forged after signing" };
    const r = validateSignedRating(tampered, pubkey);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_signature");
  });

  it("rejects the wrong kind", () => {
    const { event, pubkey } = signedRating();
    const wrongKind = { ...event, kind: 1 };
    const r = validateSignedRating(wrongKind, pubkey);
    expect(r.ok).toBe(false);
  });

  it("rejects junk input", () => {
    expect(validateSignedRating(null, "a".repeat(64)).ok).toBe(false);
    expect(validateSignedRating({}, "a".repeat(64)).ok).toBe(false);
  });
});
