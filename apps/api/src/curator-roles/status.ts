// The curator-role COUNT-GATE (Story 67 / ADR 0066). A subject is a curator (by
// vouching) iff ≥ N DISTINCT asserters A where: A ≠ subject (self-excluded) AND
// weight(house, A) ≥ floor AND A's latest polarity for that subject is APPLY (+1).
// A latest DISPUTE (-1) drops that asserter. Untrusted (below-floor / absent)
// volume cannot cross the bar. Honest degrade: empty weights / no observer / a
// throwing seam → every count 0 → no one is a curator, never throws. Asserter
// weights are fetched in ONE batched weights(house, [...distinct asserters]) call.
// Clones apps/api/src/author-verified/verify.ts `computeVerification`.
//
// STUB (red): the real count-gate lands in implementation.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { TrustProvider } from "../trust";

export async function computeCuratorStatus(
  _events: SignedNostrEvent[],
  _candidateHexes: readonly string[],
  _houseObserverHex: string | undefined,
  _floor: number,
  _minAsserters: number,
  _trust: TrustProvider,
): Promise<string[]> {
  throw new Error("computeCuratorStatus: not implemented (Story 67)");
}
