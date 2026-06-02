import { describe, expect, it } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import {
  FixtureTrustProvider,
  weightedRatings,
  type FixtureSpec,
  type ParsedRating,
} from "@unbnd/trust";

const O = "d".repeat(64); // observer
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const spec: FixtureSpec = { weights: { [O]: { [A]: 0.9, [B]: 0.3 } } };

// The keystone deliverable: a trust-consuming feature verified end-to-end against
// the fixture provider in CI, with a deterministic weighted-vs-raw divergence and
// no Brainstorm/relay/network involved.
describe("trust-consuming feature against the fixture: weightedRatings (ADR 0017)", () => {
  it("produces a deterministic weighted average that differs from raw", async () => {
    const deduped: ParsedRating[] = [
      { pubkey: A, createdAt: 3, score: 5, reviewDate: "2026-01-03" },
      { pubkey: B, createdAt: 2, score: 3, reviewDate: "2026-01-02" },
      { pubkey: C, createdAt: 1, score: 1, reviewDate: "2026-01-01" },
    ];
    const weights = await new FixtureTrustProvider(spec).weights(
      O,
      deduped.map((r) => r.pubkey),
    );

    // Raw arithmetic mean over the deduped set (rawFromParsed stays apps/api-only
    // per ADR 0036 A1; the divergence assertion is preserved by computing it here).
    const rawAverage =
      deduped.reduce((s, r) => s + r.score, 0) / deduped.length;
    const weighted = weightedRatings(deduped, weights, npubEncode(O));

    expect(rawAverage).toBe(3); // (5+3+1)/3
    expect(weighted).not.toBeNull();
    // trusted A(0.9), B(0.3): (0.9*5 + 0.3*3) / 1.2 = 4.5; C untrusted → excluded
    expect(weighted?.average).toBeCloseTo(4.5, 10);
    expect(weighted?.trustedCount).toBe(2);
    expect(weighted?.average).not.toBe(rawAverage); // divergence, deterministically
  });
});
