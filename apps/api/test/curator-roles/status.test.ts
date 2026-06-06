// Failing tests (red) for Story 67 / ADR 0066 — the curator-role COUNT-GATE
// (`computeCuratorStatus`, a pure helper). A subject is a curator (by vouching)
// iff ≥ N DISTINCT asserters A where A ≠ subject AND weight(house, A) ≥ floor AND
// A's latest polarity for that subject is APPLY. Symmetric dispute lowers the
// count; untrusted volume cannot cross the bar; honest degrade never fabricates.
// Mirrors author-verified/verify.test.ts. computeCuratorStatus throws (stub) → red.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  toCuratorRoleEvent,
  CURATOR_ROLE,
  type CuratorRoleAssertion,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import { computeCuratorStatus } from "../../src/curator-roles/status";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
const SUBJECT = "a".repeat(64); // the candidate curator
const A1 = "c".repeat(64);
const A2 = "d".repeat(64);
const A3 = "e".repeat(64);
const A_LOW = "f".repeat(64); // weight 0.2, below a 0.5 floor
const A_UNTRUSTED = "9".repeat(64); // absent from the map → weight 0

const HEADER: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "curator-roles" };
const FLOOR = 0.5;
const N = 2;

function fixtureTrust() {
  return new FixtureTrustProvider({
    weights: {
      [HOUSE]: { [A1]: 0.9, [A2]: 0.8, [A3]: 0.7, [A_LOW]: 0.2, [SUBJECT]: 0.95 },
    },
  });
}

function vouchEvent(
  asserterHex: string,
  subjectHex: string,
  polarity: 1 | -1,
  createdAt: number,
): SignedNostrEvent {
  const assertion: CuratorRoleAssertion = {
    subjectPubkey: asHexPubkey(subjectHex),
    asserterPubkey: asHexPubkey(asserterHex),
    role: CURATOR_ROLE,
    polarity,
    parentHeader: HEADER,
  };
  const unsigned = toCuratorRoleEvent(assertion);
  const tags = [
    ...unsigned.tags.map((t: readonly string[]) => [...t]),
    ["json", JSON.stringify(unsigned.payload)],
  ];
  return {
    id: `${asserterHex.slice(0, 6)}-${subjectHex.slice(0, 6)}-${createdAt}`,
    pubkey: asserterHex,
    sig: "x",
    created_at: createdAt,
    kind: 39999,
    tags,
    content: "",
  } as unknown as SignedNostrEvent;
}

describe("computeCuratorStatus — count-gate ≥ N", () => {
  it("a subject becomes a curator when ≥ N distinct above-floor asserters net-apply", async () => {
    const events = [vouchEvent(A1, SUBJECT, 1, 10), vouchEvent(A2, SUBJECT, 1, 11)];
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, N, fixtureTrust())).toEqual([SUBJECT]);
  });

  it("does NOT confer status with only N-1 above-floor asserters", async () => {
    const events = [vouchEvent(A1, SUBJECT, 1, 10)];
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, N, fixtureTrust())).toEqual([]);
  });

  it("pins both sides of N: raising N above the asserter count un-confers", async () => {
    const events = [vouchEvent(A1, SUBJECT, 1, 10), vouchEvent(A2, SUBJECT, 1, 11)];
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, 2, fixtureTrust())).toEqual([SUBJECT]);
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, 3, fixtureTrust())).toEqual([]);
  });
});

describe("computeCuratorStatus — self-vouch excluded", () => {
  it("a subject's own apply does not count toward their own status (structural, any weight)", async () => {
    const events = [vouchEvent(SUBJECT, SUBJECT, 1, 11)]; // self, weight 0.95
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, 1, fixtureTrust())).toEqual([]);
  });
});

describe("computeCuratorStatus — symmetric dispute + untrusted volume", () => {
  it("an asserter's latest DISPUTE drops them from the count", async () => {
    const events = [
      vouchEvent(A1, SUBJECT, 1, 10),
      vouchEvent(A2, SUBJECT, 1, 11),
      vouchEvent(A2, SUBJECT, -1, 20), // A2 flips to dispute (latest wins)
    ];
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, N, fixtureTrust())).toEqual([]);
  });

  it("below-floor + untrusted asserters cannot cross the bar", async () => {
    const events = [
      vouchEvent(A1, SUBJECT, 1, 10),
      vouchEvent(A_LOW, SUBJECT, 1, 11),
      ...Array.from({ length: 8 }, (_, i) => vouchEvent(A_UNTRUSTED, SUBJECT, 1, 12 + i)),
    ];
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, N, fixtureTrust())).toEqual([]);
  });
});

describe("computeCuratorStatus — batched weights + honest degrade", () => {
  it("fetches asserter weights in exactly ONE batched weights() call", async () => {
    const events = [
      vouchEvent(A1, SUBJECT, 1, 10),
      vouchEvent(A2, SUBJECT, 1, 11),
      vouchEvent(A3, SUBJECT, 1, 12),
    ];
    const fixture = fixtureTrust();
    const spy = vi.spyOn(fixture, "weights");
    await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, N, fixture);
    expect(spy).toHaveBeenCalledTimes(1);
    const [observerArg, targetsArg] = spy.mock.calls[0]!;
    expect(observerArg).toBe(HOUSE);
    expect([...(targetsArg as readonly string[])]).toEqual(expect.arrayContaining([A1, A2, A3]));
  });

  it("a throwing trust seam degrades to no-curator without throwing", async () => {
    const throwing = {
      name: "fixture" as const,
      weights: vi.fn(async () => {
        throw new Error("trust backend down");
      }),
      hasScores: vi.fn(async () => false),
      authChallenge: vi.fn(async () => null),
      personalize: vi.fn(async () => false),
    };
    const events = [vouchEvent(A1, SUBJECT, 1, 10), vouchEvent(A2, SUBJECT, 1, 11)];
    expect(await computeCuratorStatus(events, [SUBJECT], HOUSE, FLOOR, N, throwing as never)).toEqual([]);
  });

  it("returns [] for an empty assertion set", async () => {
    expect(await computeCuratorStatus([], [SUBJECT], HOUSE, FLOOR, N, fixtureTrust())).toEqual([]);
  });
});
