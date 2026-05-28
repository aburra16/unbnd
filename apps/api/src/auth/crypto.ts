// Custodial-auth cryptography per ADR 0003.
// Every primitive goes through the audited stack (Applesauce / nostr-tools
// / @noble) per the CLAUDE.md Cryptographic library policy. Stubs throw
// until the Implementer wires them up.

export type CustodialKeypair = {
  /** Raw 32-byte secret key. Caller must wipe after use. */
  readonly secret: Uint8Array;
  /** 64-char lowercase hex public key. */
  readonly pubkeyHex: string;
  /** bech32 npub. */
  readonly npub: string;
};

export function generateCustodialKeypair(): CustodialKeypair {
  throw new Error("generateCustodialKeypair not implemented");
}

/** NIP-49 encrypt with the user's password. Returns the bech32 ncryptsec1 string. */
export function encryptWithPassword(
  _secret: Uint8Array,
  _password: string,
): string {
  throw new Error("encryptWithPassword not implemented");
}

/** NIP-49 decrypt with the user's password. Throws on AEAD-tag failure (wrong password). */
export function decryptWithPassword(
  _ncryptsec: string,
  _password: string,
): Uint8Array {
  throw new Error("decryptWithPassword not implemented");
}

/** XChaCha20-Poly1305 encrypt with the deployment backup key. Returns nonce(24) || ct || tag(16). */
export function encryptWithBackupKey(
  _secret: Uint8Array,
  _backupKeyHex: string,
): Buffer {
  throw new Error("encryptWithBackupKey not implemented");
}

export function decryptWithBackupKey(
  _blob: Buffer,
  _backupKeyHex: string,
): Uint8Array {
  throw new Error("decryptWithBackupKey not implemented");
}
