// FAILING TESTS — Story 101 / ADR 0092 §5: the card's rating read takes the
// house view, and falls back to the count alone.
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import { buildUnfurlReaders } from "../../src/unfurl/readers";
import { LIBRARIAN, signedRating } from "../ratings/_fixtures";
import { memoryRelay } from "../ratings/_relay";

const HOUSE = "c".repeat(64);
const config = { librarianPubkey: LIBRARIAN, houseObserverPubkey: HOUSE } as Config;

function trust(weights: () => Promise<Map<string, number>>) {
  return {
    name: "brainstorm" as const,
    weights: vi.fn(weights),
    hasScores: vi.fn(async () => true),
    followers: vi.fn(async () => new Map()),
    designation: vi.fn(async () => []),
    authChallenge: vi.fn(async () => null),
    personalize: vi.fn(async () => true),
  };
}

describe("readCardRatings", () => {
  const a = signedRating({ score: 5 });
  const b = signedRating({ score: 3 });
  const c = signedRating({ score: 1 });
  const relay = memoryRelay([a.event, b.event, c.event]);

  it("gives the house view's trusted average and count, from the house vantage", async () => {
    const t = trust(async () => new Map([[a.pubkey, 0.9], [b.pubkey, 0.9]]));
    const { readCardRatings } = buildUnfurlReaders({ config, query: relay.query, trust: t });
    expect(await readCardRatings("orbital")).toEqual({ count: 3, trusted: { average: 4, count: 2 } });
    expect(t.weights).toHaveBeenCalledWith(HOUSE, expect.arrayContaining([a.pubkey, b.pubkey, c.pubkey]));
  });

  it("no trusted ratings, a trust failure, or no trust configured: the count alone", async () => {
    const none = buildUnfurlReaders({ config, query: relay.query, trust: trust(async () => new Map()) });
    expect(await none.readCardRatings("orbital")).toEqual({ count: 3, trusted: null });
    const down = buildUnfurlReaders({ config, query: relay.query, trust: trust(async () => { throw new Error("down"); }) });
    expect(await down.readCardRatings("orbital")).toEqual({ count: 3, trusted: null });
    const off = buildUnfurlReaders({ config, query: relay.query });
    expect(await off.readCardRatings("orbital")).toEqual({ count: 3, trusted: null });
  });
});
