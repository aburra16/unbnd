import { describe, expect, it } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import type { SignedNostrEvent } from "@unbnd/schemas";
import {
  FixtureTrustProvider,
  resolveTrustProvider,
  type FixtureSpec,
} from "../../src/trust";
import {
  rawFromParsed,
  weightedRatings,
  type ParsedRating,
} from "../../src/ratings/summary";

const O = "d".repeat(64); // observer
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const spec: FixtureSpec = { weights: { [O]: { [A]: 0.9, [B]: 0.3 } } };

describe("FixtureTrustProvider (ADR 0017)", () => {
  it("weights: returns configured weights for trusted targets only", async () => {
    const w = await new FixtureTrustProvider(spec).weights(O, [A, B, C]);
    expect(w.get(A)).toBe(0.9);
    expect(w.get(B)).toBe(0.3);
    expect(w.has(C)).toBe(false); // untrusted → absent, like the live provider
  });

  it("weights: empty map for an unknown observer", async () => {
    const w = await new FixtureTrustProvider(spec).weights("e".repeat(64), [A, B]);
    expect(w.size).toBe(0);
  });

  it("weights: clamps to a max of 1", async () => {
    const p = new FixtureTrustProvider({ weights: { [O]: { [A]: 5 } } });
    expect((await p.weights(O, [A])).get(A)).toBe(1);
  });

  it("hasScores: true for observers with weights, false otherwise", async () => {
    const p = new FixtureTrustProvider(spec);
    expect(await p.hasScores(O)).toBe(true);
    expect(await p.hasScores(C)).toBe(false);
  });

  it("hasScores: honors an explicit scoredObservers set", async () => {
    const p = new FixtureTrustProvider({ weights: {}, scoredObservers: [O] });
    expect(await p.hasScores(O)).toBe(true);
  });

  // CONTRACT MIGRATION (ADR 0026 Decision 1): authChallenge now returns the
  // full unsigned kind-27235 TEMPLATE to sign, not a bare challenge string. The
  // fixture returns a GENERIC template — the deterministic challenge lives in a
  // ["challenge", …] tag and there is NO brainstorm_login (that literal lives
  // only in the Brainstorm adapter now). This pins the NEW contract at the same
  // strength as the old one (deterministic default, overridable challenge value,
  // null when disabled) — it does not weaken the intent.
  it("authChallenge: deterministic generic template, overridable challenge, or null", async () => {
    const def = await new FixtureTrustProvider(spec).authChallenge(O);
    expect(def).toMatchObject({ kind: 27235, content: "" });
    expect(def?.tags).toContainEqual(["challenge", `fixture-challenge:${O}`]);
    expect(typeof def?.created_at).toBe("number");
    expect(JSON.stringify(def)).not.toContain("brainstorm_login");

    const over = await new FixtureTrustProvider({ ...spec, challenge: "abc" }).authChallenge(O);
    expect(over?.tags).toContainEqual(["challenge", "abc"]);

    expect(
      await new FixtureTrustProvider({ ...spec, challenge: null }).authChallenge(O),
    ).toBeNull();
  });

  it("personalize: returns the configured result and marks the observer scored", async () => {
    const p = new FixtureTrustProvider({ weights: {} });
    expect(await p.hasScores(O)).toBe(false);
    expect(await p.personalize(O, {} as SignedNostrEvent)).toBe(true);
    expect(await p.hasScores(O)).toBe(true); // mirrors a real run

    const off = new FixtureTrustProvider({ weights: {}, personalizeOk: false });
    expect(await off.personalize(O, {} as SignedNostrEvent)).toBe(false);
    expect(await off.hasScores(O)).toBe(false);
  });

  it("resolveTrustProvider builds the fixture provider for provider:'fixture'", () => {
    const p = resolveTrustProvider({ provider: "fixture", fixture: spec });
    expect(p.name).toBe("fixture");
    expect(p).toBeInstanceOf(FixtureTrustProvider);
  });
});

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

    const raw = rawFromParsed(deduped);
    const weighted = weightedRatings(deduped, weights, npubEncode(O));

    expect(raw.average).toBe(3); // (5+3+1)/3
    expect(weighted).not.toBeNull();
    // trusted A(0.9), B(0.3): (0.9*5 + 0.3*3) / 1.2 = 4.5; C untrusted → excluded
    expect(weighted?.average).toBeCloseTo(4.5, 10);
    expect(weighted?.trustedCount).toBe(2);
    expect(weighted?.average).not.toBe(raw.average); // divergence, deterministically
  });
});
