// Session-scoped ephemeral key store for custodial server-side signing.
// ADR 0006 / PRD §8.2: a process-local random key (never persisted) wraps the
// decrypted nsec per session; each write unwraps in memory, signs, wipes. A
// process restart drops the key + the map, forcing custodial re-login.
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "node:crypto";

const NONCE_BYTES = 24;

// Process-local key, created once on first use, never persisted or exported.
// A restart generates a fresh key, invalidating every wrap from before.
let ephemeralKey: Uint8Array | null = null;
function key(): Uint8Array {
  if (!ephemeralKey) ephemeralKey = randomBytes(32);
  return ephemeralKey;
}

// sessionIdHex -> nonce(24) || ciphertext || tag(16)
const store = new Map<string, Uint8Array>();

/** Thrown when a session has no live wrapped key (post-restart / evicted). */
export class NoSessionKeyError extends Error {
  constructor(message = "no session signing key") {
    super(message);
    this.name = "NoSessionKeyError";
  }
}

/**
 * Wrap `secret` under the process-local ephemeral key and store it against the
 * session id. Copies/encrypts immediately — the caller's buffer is not aliased
 * and may be wiped afterward.
 */
export function rememberSessionKey(
  sessionIdHex: string,
  secret: Uint8Array,
): void {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(key(), nonce).encrypt(secret);
  const blob = new Uint8Array(nonce.length + ciphertext.length);
  blob.set(nonce, 0);
  blob.set(ciphertext, nonce.length);
  store.set(sessionIdHex, blob);
}

/**
 * Unwrap the session's key into a fresh buffer, hand it to `fn`, then wipe the
 * plaintext (even if `fn` throws). Throws NoSessionKeyError if absent.
 */
export async function useSessionKey<T>(
  sessionIdHex: string,
  fn: (secret: Uint8Array) => T | Promise<T>,
): Promise<T> {
  const blob = store.get(sessionIdHex);
  if (!blob) throw new NoSessionKeyError();
  const nonce = blob.subarray(0, NONCE_BYTES);
  const ciphertext = blob.subarray(NONCE_BYTES);
  const secret = xchacha20poly1305(key(), nonce).decrypt(ciphertext);
  try {
    return await fn(secret);
  } finally {
    secret.fill(0);
  }
}

/** Evict a session's wrapped key (logout / sweep). */
export function forgetSessionKey(sessionIdHex: string): void {
  store.delete(sessionIdHex);
}
