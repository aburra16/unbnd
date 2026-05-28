// Session token handling per ADR 0003. Stubs throw until implemented.
//
// The cookie carries a raw 32-byte token (base64url). The database stores
// SHA-256(token) as the session id, so a leaked DB exposes hashes, not
// usable tokens.
import type { DbOrTx } from "../db";
import type { SessionRow, UserRow } from "../db/schema";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Pure helper: generate a fresh session token and its stored id.
 * `token` is the base64url cookie value; `id` is SHA-256 of the raw bytes.
 * Hermetically unit-testable — no db, no clock dependency beyond the caller.
 */
export function generateSessionToken(): { token: string; id: Buffer } {
  throw new Error("generateSessionToken not implemented");
}

/** Map a raw cookie token to its stored id (SHA-256 of the decoded bytes). */
export function tokenToId(_token: string): Buffer {
  throw new Error("tokenToId not implemented");
}

/** Insert a fresh session row. Caller runs this inside a transaction. */
export async function issueSession(
  _tx: DbOrTx,
  _userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  throw new Error("issueSession not implemented");
}

/**
 * Resolve a cookie token to a live session + user, or null. On success,
 * slides the expiry forward and bumps last_seen_at.
 */
export async function resolveSession(
  _cookieValue: string | undefined,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  throw new Error("resolveSession not implemented");
}

/** Delete the session row referenced by the cookie token, if any. */
export async function revokeSession(
  _tx: DbOrTx,
  _cookieValue: string | undefined,
): Promise<void> {
  throw new Error("revokeSession not implemented");
}

/** Delete every expired session row. Returns the count removed. */
export async function sweepExpiredSessions(): Promise<number> {
  throw new Error("sweepExpiredSessions not implemented");
}
