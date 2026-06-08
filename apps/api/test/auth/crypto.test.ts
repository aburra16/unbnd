import { describe, expect, it } from "vitest";
import { decode } from "nostr-tools/nip19";
import {
  decryptWithBackupKey,
  decryptWithPassword,
  encryptWithBackupKey,
  encryptWithPassword,
  exportNsec,
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

describe("exportNsec (Story 76 / ADR 0074)", () => {
  it("reveals the encrypted custodial key as the matching nsec (password-gated)", () => {
    const { secret } = generateCustodialKeypair();
    const ncryptsec = encryptWithPassword(secret, "correct horse battery");
    const nsec = exportNsec(ncryptsec, "correct horse battery");
    expect(nsec).toMatch(/^nsec1[0-9a-z]+$/);
    // It decodes back to the exact same secret bytes (reproducible by any client).
    const decoded = decode(nsec);
    expect(decoded.type).toBe("nsec");
    expect(Buffer.from(decoded.data as Uint8Array).toString("hex")).toBe(
      Buffer.from(secret).toString("hex"),
    );
  });

  it("throws on the wrong password and reveals nothing", () => {
    const { secret } = generateCustodialKeypair();
    const ncryptsec = encryptWithPassword(secret, "right password");
    expect(() => exportNsec(ncryptsec, "wrong password")).toThrow();
  });
});
