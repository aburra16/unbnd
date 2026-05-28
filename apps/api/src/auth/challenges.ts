// Single-use, time-bounded login challenges per ADR 0004.
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db, type DbOrTx } from "../db";
import { challenges } from "../db/schema";

export const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes

/** Issue a fresh challenge nonce bound to a pubkey. Returns the nonce. */
export async function issueChallenge(
  tx: DbOrTx,
  pubkey: string,
): Promise<string> {
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS);
  await tx.insert(challenges).values({ pubkey, nonce, expiresAt });
  return nonce;
}

/**
 * Atomically consume a challenge: it must exist for (pubkey, nonce), be
 * unexpired, and not already consumed. Marks it consumed and returns true;
 * returns false if it cannot be consumed (missing / expired / replayed).
 *
 * The single-statement conditional UPDATE makes consumption atomic — two
 * concurrent verifies cannot both succeed.
 */
export async function consumeChallenge(
  tx: DbOrTx,
  pubkey: string,
  nonce: string,
): Promise<boolean> {
  const updated = await tx
    .update(challenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(challenges.pubkey, pubkey),
        eq(challenges.nonce, nonce),
        isNull(challenges.consumedAt),
        gt(challenges.expiresAt, new Date()),
      ),
    )
    .returning({ nonce: challenges.nonce });
  return updated.length === 1;
}

/** Delete every expired challenge row. Returns the count removed. */
export async function sweepExpiredChallenges(): Promise<number> {
  const deleted = await db
    .delete(challenges)
    .where(lt(challenges.expiresAt, new Date()))
    .returning({ nonce: challenges.nonce });
  return deleted.length;
}
