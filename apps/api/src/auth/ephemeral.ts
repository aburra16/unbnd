// Session-scoped ephemeral key store for custodial server-side signing.
// ADR 0006 / PRD §8.2: a process-local random key (never persisted) wraps the
// decrypted nsec per session; each write unwraps in memory, signs, wipes. A
// process restart drops the key + the map, forcing custodial re-login.
//
// IMPLEMENTATION PENDING — stubs throw so the test suite fails for the right
// reason during test design.

/** Thrown when a session has no live wrapped key (post-restart / evicted). */
export class NoSessionKeyError extends Error {
  constructor(message = "no session signing key") {
    super(message);
    this.name = "NoSessionKeyError";
  }
}

/**
 * Wrap `secret` under the process-local ephemeral key and store it against the
 * session id. The caller wipes its own plaintext afterward.
 */
export function rememberSessionKey(
  _sessionIdHex: string,
  _secret: Uint8Array,
): void {
  throw new Error("rememberSessionKey not implemented");
}

/**
 * Unwrap the session's key in memory, hand it to `fn`, then wipe the plaintext
 * (even if `fn` throws). Throws NoSessionKeyError if the session has no key.
 */
export async function useSessionKey<T>(
  _sessionIdHex: string,
  _fn: (secret: Uint8Array) => T | Promise<T>,
): Promise<T> {
  throw new Error("useSessionKey not implemented");
}

/** Evict a session's wrapped key (logout / sweep). */
export function forgetSessionKey(_sessionIdHex: string): void {
  throw new Error("forgetSessionKey not implemented");
}
