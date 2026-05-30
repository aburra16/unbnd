import { describe, expect, it, vi } from "vitest";
import { BrainstormProvider } from "../../src/trust/brainstorm";
import type { SignedNostrEvent } from "@unbnd/schemas";

const OBS = "a".repeat(64);
const SVC = "b".repeat(64);
const T1 = "1".repeat(64);
const T2 = "2".repeat(64);

function setupFetch(tuples: unknown = [["30382:rank", SVC, "wss://hint"]]) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/setup/")) {
      return new Response(JSON.stringify(tuples), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

function score(d: string, rank: number): SignedNostrEvent {
  return {
    id: d, pubkey: SVC, sig: "s", kind: 30382, created_at: 1,
    tags: [["d", d], ["rank", String(rank)], ["followers", "5"]], content: "",
  } as SignedNostrEvent;
}

describe("BrainstormProvider.weights", () => {
  it("resolves the service key via /setup and maps rank/100 to weights", async () => {
    const query = vi.fn(async () => [score(T1, 80), score(T2, 11)]);
    const p = new BrainstormProvider(
      { apiUrl: "https://api", relays: ["wss://r1"] },
      { fetchImpl: setupFetch(), query },
    );
    const w = await p.weights(OBS, [T1, T2]);
    expect(w.get(T1)).toBeCloseTo(0.8);
    expect(w.get(T2)).toBeCloseTo(0.11);
    // queried with the resolved service key as author
    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kinds: [30382], authors: [SVC], "#d": [T1, T2] }),
    );
  });

  it("unions across relays, keeping the strongest weight", async () => {
    const query = vi.fn(async (url: string) =>
      url.includes("r1") ? [score(T1, 40)] : [score(T1, 90)],
    );
    const p = new BrainstormProvider(
      { apiUrl: "https://api", relays: ["wss://r1", "wss://r2"] },
      { fetchImpl: setupFetch([["30382:rank", SVC]]), query },
    );
    const w = await p.weights(OBS, [T1]);
    expect(w.get(T1)).toBeCloseTo(0.9);
  });

  it("returns empty when the observer has no /setup rank provider", async () => {
    const p = new BrainstormProvider(
      { apiUrl: "https://api", relays: ["wss://r1"] },
      { fetchImpl: setupFetch([["30382:followers", SVC]]), query: vi.fn(async () => []) },
    );
    expect((await p.weights(OBS, [T1])).size).toBe(0);
  });

  it("no targets → no work", async () => {
    const query = vi.fn(async () => []);
    const fetchImpl = setupFetch();
    const p = new BrainstormProvider({ apiUrl: "https://api", relays: ["wss://r1"] }, { fetchImpl, query });
    expect((await p.weights(OBS, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("degrades when a relay query throws (that relay contributes nothing)", async () => {
    const query = vi.fn(async (url: string) => {
      if (url.includes("r1")) throw new Error("relay down");
      return [score(T1, 50)];
    });
    const p = new BrainstormProvider(
      { apiUrl: "https://api", relays: ["wss://r1", "wss://r2"] },
      { fetchImpl: setupFetch([["30382:rank", SVC]]), query },
    );
    expect((await p.weights(OBS, [T1])).get(T1)).toBeCloseTo(0.5);
  });
});
