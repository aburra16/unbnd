// The curator-role COUNT-GATE (Story 67 / ADR 0066). A subject is a curator (by
// vouching) iff ≥ N DISTINCT asserters A where: A ≠ subject (self-excluded) AND
// weight(house, A) ≥ floor AND A's latest polarity for that subject is APPLY (+1).
// A latest DISPUTE (-1) drops that asserter. Untrusted (below-floor / absent)
// volume cannot cross the bar. Honest degrade: empty weights / no observer / a
// throwing seam → every count 0 → no one is a curator, never throws. Asserter
// weights are fetched in ONE batched weights(house, [...distinct asserters]) call.
// Clones apps/api/src/author-verified/verify.ts `computeVerification`.
import {
  fromCuratorRoleEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { TrustProvider } from "../trust";

type ParsedVouch = {
  /** The asserter who signed (the event author). */
  asserter: string;
  /** The subject being vouched (the #p target). */
  subject: string;
  polarity: number;
  createdAt: number;
};

function parse(event: SignedNostrEvent): ParsedVouch | null {
  try {
    const unsigned = fromWireEvent({
      kind: event.kind,
      content: event.content,
      tags: event.tags,
    });
    const a = fromCuratorRoleEvent(unsigned as never);
    return {
      asserter: event.pubkey,
      subject: a.subjectPubkey,
      polarity: a.polarity,
      createdAt: event.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * The subset of `candidateHexes` that cleared the vouch count-gate from the house
 * vantage. Pure modulo the injected TrustProvider. Never throws.
 */
export async function computeCuratorStatus(
  events: SignedNostrEvent[],
  candidateHexes: readonly string[],
  houseObserverHex: string | undefined,
  floor: number,
  minAsserters: number,
  trust: TrustProvider,
): Promise<string[]> {
  // Dedupe per (asserter, subject) keeping the latest created_at.
  const latest = new Map<string, ParsedVouch>();
  for (const e of events) {
    const a = parse(e);
    if (!a) continue;
    const key = `${a.asserter}|${a.subject}`;
    const prior = latest.get(key);
    if (!prior || a.createdAt > prior.createdAt) latest.set(key, a);
  }

  // Batched weight fetch over the union of distinct asserters (no N+1).
  const distinctAsserters = [...new Set([...latest.values()].map((a) => a.asserter))];
  let weights = new Map<string, number>();
  if (houseObserverHex && distinctAsserters.length > 0) {
    try {
      weights = await trust.weights(houseObserverHex, distinctAsserters);
    } catch {
      weights = new Map();
    }
  }

  const candidates = new Set(candidateHexes);
  const counted = new Map<string, Set<string>>();
  for (const a of latest.values()) {
    if (!candidates.has(a.subject)) continue;
    if (a.asserter === a.subject) continue; // self-excluded
    if (a.polarity !== 1) continue; // latest dispute → does not count
    if ((weights.get(a.asserter) ?? 0) < floor) continue; // below-floor → does not count
    const set = counted.get(a.subject) ?? new Set<string>();
    set.add(a.asserter);
    counted.set(a.subject, set);
  }

  return candidateHexes.filter((hex) => (counted.get(hex)?.size ?? 0) >= minAsserters);
}

/**
 * The count of distinct above-floor asserters whose latest polarity for `subjectHex`
 * is APPLY (Story 68 / ADR 0067) — the "N trusted people vouched" figure. Self-
 * vouches excluded. Honest degrade → 0. STUB: real count in implementation.
 */
export async function trustedVouchCount(
  _events: SignedNostrEvent[],
  _subjectHex: string,
  _houseObserverHex: string | undefined,
  _floor: number,
  _trust: TrustProvider,
): Promise<number> {
  return 0;
}
