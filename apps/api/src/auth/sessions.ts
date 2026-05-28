// Session token handling per ADR 0003.
//
// The cookie carries a raw 32-byte token (base64url). The database stores
// SHA-256(token) as the session id, so a leaked DB exposes hashes, not
// usable tokens.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, type DbOrTx } from "../db";
import { sessions, users, type SessionRow, type UserRow } from "../db/schema";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Pure helper: generate a fresh session token and its stored id.
 * `token` is the base64url cookie value; `id` is SHA-256 of the raw bytes.
 */
export function generateSessionToken(): { token: string; id: Buffer } {
  const raw = randomBytes(32);
  const token = raw.toString("base64url");
  const id = createHash("sha256").update(raw).digest();
  return { token, id };
}

/** Map a raw cookie token to its stored id (SHA-256 of the decoded bytes). */
export function tokenToId(token: string): Buffer {
  const raw = Buffer.from(token, "base64url");
  return createHash("sha256").update(raw).digest();
}

/** Insert a fresh session row. Caller runs this inside a transaction. */
export async function issueSession(
  tx: DbOrTx,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, id } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await tx.insert(sessions).values({ id, userId, expiresAt });
  return { token, expiresAt };
}

/**
 * Resolve a cookie token to a live session + user, or null. On success,
 * slides the expiry forward and bumps last_seen_at.
 */
export async function resolveSession(
  cookieValue: string | undefined,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  if (!cookieValue) return null;

  let id: Buffer;
  try {
    id = tokenToId(cookieValue);
  } catch {
    return null;
  }

  const now = new Date();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const nextExpiry = new Date(Date.now() + SESSION_LIFETIME_MS);
  await db
    .update(sessions)
    .set({ lastSeenAt: now, expiresAt: nextExpiry })
    .where(eq(sessions.id, id));

  return {
    session: { ...row.session, lastSeenAt: now, expiresAt: nextExpiry },
    user: row.user,
  };
}

/** Delete the session row referenced by the cookie token, if any. */
export async function revokeSession(
  tx: DbOrTx,
  cookieValue: string | undefined,
): Promise<void> {
  if (!cookieValue) return;
  let id: Buffer;
  try {
    id = tokenToId(cookieValue);
  } catch {
    return;
  }
  await tx.delete(sessions).where(eq(sessions.id, id));
}

/** Delete every expired session row. Returns the count removed. */
export async function sweepExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}
