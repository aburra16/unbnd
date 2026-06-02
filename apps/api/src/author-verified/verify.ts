// The verification COUNT-GATE (Story 32 / ADR 0033 §2). A claimant (author) is
// Verified iff ≥ N DISTINCT curators C where: C ≠ author (self-excluded, AC-3)
// AND weight(house, C) ≥ floor AND C's latest polarity for that author is APPLY
// (+1). A latest DISPUTE (-1) drops that curator from the count (symmetric,
// AC-2/Open Q5). Untrusted (below-floor / absent) volume cannot cross the bar.
// Honest degrade: empty weights / no observer / a throwing seam → every count 0
// → no one Verified, never throws (AC-8). The asserter weights are fetched in
// ONE batched `weights(house, [...distinct curators])` call (no N+1).
import {
  fromAuthorVerifiedEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { TrustProvider } from "../trust";

type ParsedAssertion = {
  /** The curator who signed (the assertion author). */
  curator: string;
  /** The claimant being verified (the #p target). */
  author: string;
  polarity: number;
  createdAt: number;
};

function parse(event: SignedNostrEvent): ParsedAssertion | null {
  try {
    const unsigned = fromWireEvent({
      kind: event.kind,
      content: event.content,
      tags: event.tags,
    });
    const a = fromAuthorVerifiedEvent(unsigned as never);
    return {
      curator: event.pubkey,
      author: a.authorPubkey,
      polarity: a.polarity,
      createdAt: event.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * Compute which claimants are Verified by the count-gate, from the house
 * observer's vantage. Pure (modulo the injected TrustProvider). Returns the
 * subset of `claimantHexes` that cleared the gate. Never throws (AC-8).
 */
export async function computeVerification(
  events: SignedNostrEvent[],
  claimantHexes: readonly string[],
  houseObserverHex: string | undefined,
  floor: number,
  minCurators: number,
  trust: TrustProvider,
): Promise<string[]> {
  // Dedupe per (curator, author) keeping the latest created_at → each curator's
  // latest polarity for each author.
  const latest = new Map<string, ParsedAssertion>();
  for (const e of events) {
    const a = parse(e);
    if (!a) continue;
    const key = `${a.curator}|${a.author}`;
    const prior = latest.get(key);
    if (!prior || a.createdAt > prior.createdAt) {
      latest.set(key, a);
    }
  }

  // Batched weight fetch over the union of distinct curator hexes (no N+1).
  const distinctCurators = [...new Set([...latest.values()].map((a) => a.curator))];
  let weights = new Map<string, number>();
  if (houseObserverHex && distinctCurators.length > 0) {
    try {
      weights = await trust.weights(houseObserverHex, distinctCurators);
    } catch {
      // Honest degrade: a throwing seam yields no weights → no one verified.
      weights = new Map();
    }
  }

  const claimants = new Set(claimantHexes);
  // author → set of distinct counting curators
  const counted = new Map<string, Set<string>>();
  for (const a of latest.values()) {
    if (!claimants.has(a.author)) continue; // only authors under consideration
    if (a.curator === a.author) continue; // self-excluded (AC-3)
    if (a.polarity !== 1) continue; // latest dispute → does not count
    const w = weights.get(a.curator) ?? 0;
    if (w < floor) continue; // below-floor / untrusted → does not count
    const set = counted.get(a.author) ?? new Set<string>();
    set.add(a.curator);
    counted.set(a.author, set);
  }

  const verified: string[] = [];
  for (const hex of claimantHexes) {
    if ((counted.get(hex)?.size ?? 0) >= minCurators) verified.push(hex);
  }
  return verified;
}
