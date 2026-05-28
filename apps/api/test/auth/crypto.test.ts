import { describe, expect, it } from "vitest";
import {
  decryptWithBackupKey,
  decryptWithPassword,
  encryptWithBackupKey,
  encryptWithPassword,
  generateCustodialKeypair,
} from "../../src/auth/crypto";

const BACKUP_KEY_HEX = "b".repeat(64);

describe("generateCustodialKeypair", () => {
  it("produces a 32-byte secret, 64-hex pubkey, and an npub", () => {
    const kp = generateCustodialKeypair();
    expect(kp.secret).toBeInstanceOf(Uint8Array);
    expect(kp.secret.length).toBe(32);
    expect(kp.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.npub).toMatch(/^npub1[0-9a-z]+$/);
  });

  it("produces a different keypair each call", () => {
    const a = generateCustodialKeypair();
    const b = generateCustodialKeypair();
    expect(a.pubkeyHex).not.toBe(b.pubkeyHex);
  });
});

describe("NIP-49 password encryption", () => {
  it("round-trips a secret through encrypt/decrypt with the right password", () => {
    const { secret } = generateCustodialKeypair();
    const ncryptsec = encryptWithPassword(secret, "correct horse battery");
    expect(ncryptsec).toMatch(/^ncryptsec1[0-9a-z]+$/);
    const recovered = decryptWithPassword(ncryptsec, "correct horse battery");
    expect(Buffer.from(recovered).toString("hex")).toBe(
      Buffer.from(secret).toString("hex"),
    );
  });

  it("fails to decrypt with the wrong password", () => {
    const { secret } = generateCustodialKeypair();
    const ncryptsec = encryptWithPassword(secret, "the-real-password");
    expect(() => decryptWithPassword(ncryptsec, "a-different-password")).toThrow();
  });
});

describe("XChaCha20-Poly1305 backup-key encryption", () => {
  it("round-trips a secret through encrypt/decrypt with the backup key", () => {
    const { secret } = generateCustodialKeypair();
    const blob = encryptWithBackupKey(secret, BACKUP_KEY_HEX);
    expect(blob).toBeInstanceOf(Buffer);
    // nonce(24) + ciphertext(32) + tag(16) = at least 72 bytes
    expect(blob.length).toBeGreaterThanOrEqual(24 + 32 + 16);
    const recovered = decryptWithBackupKey(blob, BACKUP_KEY_HEX);
    expect(Buffer.from(recovered).toString("hex")).toBe(
      Buffer.from(secret).toString("hex"),
    );
  });

  it("uses a fresh nonce each call (ciphertext differs for the same input)", () => {
    const { secret } = generateCustodialKeypair();
    const a = encryptWithBackupKey(secret, BACKUP_KEY_HEX);
    const b = encryptWithBackupKey(secret, BACKUP_KEY_HEX);
    expect(a.equals(b)).toBe(false);
  });

  it("fails to decrypt with the wrong backup key", () => {
    const { secret } = generateCustodialKeypair();
    const blob = encryptWithBackupKey(secret, BACKUP_KEY_HEX);
    expect(() => decryptWithBackupKey(blob, "c".repeat(64))).toThrow();
  });
});
