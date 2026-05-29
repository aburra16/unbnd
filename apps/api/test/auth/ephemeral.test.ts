import { describe, expect, it } from "vitest";
import {
  NoSessionKeyError,
  forgetSessionKey,
  rememberSessionKey,
  useSessionKey,
} from "../../src/auth/ephemeral";

const SID = "a".repeat(64);
function secret() {
  return Uint8Array.from({ length: 32 }, (_, i) => (i + 1) & 0xff);
}

describe("ephemeral session key store", () => {
  it("round-trips the secret through wrap/unwrap", async () => {
    rememberSessionKey(SID, secret());
    const back = await useSessionKey(SID, (s) => Uint8Array.from(s));
    expect(Array.from(back)).toEqual(Array.from(secret()));
  });

  it("wipes the plaintext after the callback returns", async () => {
    rememberSessionKey(SID, secret());
    let captured: Uint8Array | null = null;
    await useSessionKey(SID, (s) => {
      captured = s;
      return null;
    });
    expect(captured).not.toBeNull();
    expect(Array.from(captured!).every((b) => b === 0)).toBe(true);
  });

  it("throws NoSessionKeyError for an unknown session", async () => {
    await expect(useSessionKey("b".repeat(64), () => 1)).rejects.toBeInstanceOf(
      NoSessionKeyError,
    );
  });

  it("forgetSessionKey evicts the key (fails closed afterward)", async () => {
    rememberSessionKey(SID, secret());
    forgetSessionKey(SID);
    await expect(useSessionKey(SID, () => 1)).rejects.toBeInstanceOf(
      NoSessionKeyError,
    );
  });

  it("does not store the raw plaintext (it is wrapped at rest)", async () => {
    // Mutating the caller's buffer after remember must not change what is
    // stored — i.e. remember copies/encrypts, not aliases.
    const s = secret();
    rememberSessionKey(SID, s);
    s.fill(0);
    const back = await useSessionKey(SID, (b) => Uint8Array.from(b));
    expect(Array.from(back)).toEqual(Array.from(secret()));
  });
});
