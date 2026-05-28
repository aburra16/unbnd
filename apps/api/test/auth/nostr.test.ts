import { describe, expect, it } from "vitest";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { NIP42_KIND, verifySignedChallenge } from "../../src/auth/nostr";

// Build a signed NIP-42 challenge event, then JSON round-trip it so the
// object the verifier sees is wire-realistic (no nostr-tools verifiedSymbol
// memo carried over).
function signedChallenge(opts?: {
  kind?: number;
  challenge?: string | null;
  createdAt?: number;
}) {
  const sk = generateSecretKey();
  const evt = finalizeEvent(
    {
      kind: opts?.kind ?? NIP42_KIND,
      created_at: opts?.createdAt ?? Math.floor(Date.now() / 1000),
      tags:
        opts?.challenge === null
          ? [["relay", "http://localhost:5181"]]
          : [
              ["challenge", opts?.challenge ?? "nonce-abc"],
              ["relay", "http://localhost:5181"],
            ],
      content: "",
    },
    sk,
  );
  return { event: JSON.parse(JSON.stringify(evt)), pubkey: getPublicKey(sk) };
}

describe("verifySignedChallenge", () => {
  it("accepts an honest signed challenge and returns pubkey + challenge", () => {
    const { event, pubkey } = signedChallenge({ challenge: "nonce-xyz" });
    const r = verifySignedChallenge(event);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pubkey).toBe(pubkey);
      expect(r.challenge).toBe("nonce-xyz");
    }
  });

  it("rejects a tampered pubkey", () => {
    const { event } = signedChallenge();
    const otherPk = getPublicKey(generateSecretKey());
    const tampered = { ...event, pubkey: otherPk };
    expect(verifySignedChallenge(tampered).ok).toBe(false);
  });

  it("rejects tampered content", () => {
    const { event } = signedChallenge();
    const tampered = { ...event, content: "forged" };
    expect(verifySignedChallenge(tampered).ok).toBe(false);
  });

  it("rejects the wrong event kind", () => {
    const { event } = signedChallenge({ kind: 1 });
    expect(verifySignedChallenge(event).ok).toBe(false);
  });

  it("rejects an event with no challenge tag", () => {
    const { event } = signedChallenge({ challenge: null });
    expect(verifySignedChallenge(event).ok).toBe(false);
  });

  it("rejects a stale created_at outside the skew window", () => {
    const old = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour ago
    const { event } = signedChallenge({ createdAt: old });
    expect(verifySignedChallenge(event, 600).ok).toBe(false);
  });

  it("rejects junk input", () => {
    expect(verifySignedChallenge(null).ok).toBe(false);
    expect(verifySignedChallenge({}).ok).toBe(false);
    expect(verifySignedChallenge({ kind: 22242 }).ok).toBe(false);
  });
});
