// Custodial-auth cryptography per ADR 0003.
// Every primitive goes through the audited stack (Applesauce / nostr-tools
// / @noble) per the CLAUDE.md Cryptographic library policy.
import {
  decryptSecretKey,
  encryptSecretKey,
  generateSecretKey,
  getPublicKey,
} from "applesauce-core/helpers/keys";
import { npubEncode } from "nostr-tools/nip19";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "node:crypto";

const XCHACHA_NONCE_BYTES = 24;

export type CustodialKeypair = {
  /** Raw 32-byte secret key. Caller must wipe after use. */
  readonly secret: Uint8Array;
  /** 64-char lowercase hex public key. */
  readonly pubkeyHex: string;
  /** bech32 npub. */
  readonly npub: string;
};

export function generateCustodialKeypair(): CustodialKeypair {
  const secret = generateSecretKey();
  const pubkeyHex = getPublicKey(secret);
  const npub = npubEncode(pubkeyHex);
  return { secret, pubkeyHex, npub };
}

/** NIP-49 encrypt with the user's password. Returns the bech32 ncryptsec1 string. */
export function encryptWithPassword(
  secret: Uint8Array,
  password: string,
): string {
  return encryptSecretKey(secret, password);
}

/** NIP-49 decrypt with the user's password. Throws on AEAD-tag failure (wrong password). */
export function decryptWithPassword(
  ncryptsec: string,
  password: string,
): Uint8Array {
  return decryptSecretKey(ncryptsec, password);
}

function backupKeyBytes(backupKeyHex: string): Uint8Array {
  const key = Buffer.from(backupKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error("backup key must be 32 bytes (64 hex chars)");
  }
  return key;
}

/** XChaCha20-Poly1305 encrypt with the deployment backup key. Returns nonce(24) || ct || tag(16). */
export function encryptWithBackupKey(
  secret: Uint8Array,
  backupKeyHex: string,
): Buffer {
  const key = backupKeyBytes(backupKeyHex);
  const nonce = randomBytes(XCHACHA_NONCE_BYTES);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(secret);
  return Buffer.concat([nonce, Buffer.from(ciphertext)]);
}

export function decryptWithBackupKey(
  blob: Buffer,
  backupKeyHex: string,
): Uint8Array {
  const key = backupKeyBytes(backupKeyHex);
  const nonce = blob.subarray(0, XCHACHA_NONCE_BYTES);
  const ciphertext = blob.subarray(XCHACHA_NONCE_BYTES);
  return xchacha20poly1305(key, nonce).decrypt(ciphertext);
}
