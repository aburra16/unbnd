// Single-use, time-bounded login challenges per ADR 0004. Stubs throw
// until implemented.
import type { DbOrTx } from "../db";

export const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes

/** Issue a fresh challenge nonce bound to a pubkey. Returns the nonce. */
export async function issueChallenge(
  _tx: DbOrTx,
  _pubkey: string,
): Promise<string> {
  throw new Error("issueChallenge not implemented");
}

/**
 * Atomically consume a challenge: it must exist for (pubkey, nonce), be
 * unexpired, and not already consumed. Marks it consumed and returns true;
 * returns false if it cannot be consumed (missing / expired / replayed).
 */
export async function consumeChallenge(
  _tx: DbOrTx,
  _pubkey: string,
  _nonce: string,
): Promise<boolean> {
  throw new Error("consumeChallenge not implemented");
}

/** Delete every expired challenge row. Returns the count removed. */
export async function sweepExpiredChallenges(): Promise<number> {
  throw new Error("sweepExpiredChallenges not implemented");
}
