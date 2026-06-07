// Failing tests (red) for Story 68 / ADR 0067 — `trustedVouchCount`: the count of
// distinct above-floor asserters whose latest polarity for a subject is APPLY (the
// "N trusted people vouched" figure). Self-excluded; below-floor/untrusted don't
// count; dispute lowers; honest degrade → 0. Stub returns 0 → the positive cases
// fail red.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toCuratorRoleEvent,
  CURATOR_ROLE,
  type CuratorRoleAssertion,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import { trustedVouchCount } from "../../src/curator-roles/status";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
const SUBJECT = "a".repeat(64);
const A1 = "c".repeat(64);
const A2 = "d".repeat(64);
const A_LOW = "f".repeat(64);
const HEADER: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "curator-roles" };
const FLOOR = 0.5;

function trust() {
  return new FixtureTrustProvider({
    weights: { [HOUSE]: { [A1]: 0.9, [A2]: 0.8, [A_LOW]: 0.2, [SUBJECT]: 0.95 } },
  });
}

function vouch(asserter: string, subject: string, polarity: 1 | -1, createdAt: number): SignedNostrEvent {
  const a: CuratorRoleAssertion = {
    subjectPubkey: asHexPubkey(subject),
    asserterPubkey: asHexPubkey(asserter),
    role: CURATOR_ROLE,
    polarity,
    parentHeader: HEADER,
  };
  const unsigned = toCuratorRoleEvent(a);
  const tags = [...unsigned.tags.map((t: readonly string[]) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  return {
    id: `${asserter.slice(0, 6)}-${createdAt}`,
    pubkey: asserter,
    sig: "x",
    created_at: createdAt,
    kind: 39999,
    tags,
    content: "",
  } as unknown as SignedNostrEvent;
}

describe("trustedVouchCount", () => {
  it("counts distinct above-floor asserters whose latest polarity is apply", async () => {
    const events = [vouch(A1, SUBJECT, 1, 10), vouch(A2, SUBJECT, 1, 11)];
    expect(await trustedVouchCount(events, SUBJECT, HOUSE, FLOOR, trust())).toBe(2);
  });

  it("excludes self-vouch, below-floor, and a latest dispute", async () => {
    const events = [
      vouch(A1, SUBJECT, 1, 10),
      vouch(A_LOW, SUBJECT, 1, 11), // below floor
      vouch(SUBJECT, SUBJECT, 1, 12), // self
      vouch(A2, SUBJECT, 1, 13),
      vouch(A2, SUBJECT, -1, 20), // A2 flips to dispute (latest)
    ];
    expect(await trustedVouchCount(events, SUBJECT, HOUSE, FLOOR, trust())).toBe(1); // only A1
  });

  it("returns 0 for an empty set", async () => {
    expect(await trustedVouchCount([], SUBJECT, HOUSE, FLOOR, trust())).toBe(0);
  });
});
