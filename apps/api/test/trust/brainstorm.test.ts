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

describe("BrainstormProvider.hasScores", () => {
  it("true when the service key has ≥1 score on a relay", async () => {
    const p = new BrainstormProvider(
      { apiUrl: "https://api", relays: ["wss://r1"] },
      { fetchImpl: setupFetch([["30382:rank", SVC]]), query: vi.fn(async () => [score(T1, 30)]) },
    );
    expect(await p.hasScores(OBS)).toBe(true);
  });

  it("false with no service key or no events", async () => {
    const noKey = new BrainstormProvider(
      { apiUrl: "https://api", relays: ["wss://r1"] },
      { fetchImpl: setupFetch([["30382:followers", SVC]]), query: vi.fn(async () => []) },
    );
    expect(await noKey.hasScores(OBS)).toBe(false);
    const noEvents = new BrainstormProvider(
      { apiUrl: "https://api", relays: ["wss://r1"] },
      { fetchImpl: setupFetch([["30382:rank", SVC]]), query: vi.fn(async () => []) },
    );
    expect(await noEvents.hasScores(OBS)).toBe(false);
  });
});

describe("BrainstormProvider personalization", () => {
  function routeFetch() {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/authChallenge/" + OBS)) {
        return new Response(JSON.stringify({ data: { challenge: "chal-123" } }), { status: 200 });
      }
      if (u.endsWith("/verify")) {
        return new Response(JSON.stringify({ data: { token: "jwt-xyz" } }), { status: 200 });
      }
      if (u.endsWith("/user/graperank")) {
        const auth = new Headers(init?.headers as Record<string, string>).get("Authorization");
        return new Response(JSON.stringify({ data: { status: "waiting" } }), {
          status: auth === "Bearer jwt-xyz" ? 200 : 401,
        });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
  }

  // CONTRACT MIGRATION (ADR 0026 Decision 1): authChallenge now returns the full
  // unsigned kind-27235 TEMPLATE the backend expects (was the bare challenge
  // string). The Brainstorm adapter is the ONLY place the brainstorm_login tag
  // and the kind-27235 shape may live, so it builds them here. Same fetched
  // challenge value, now carried in the ["challenge", …] tag — intent preserved,
  // contract updated.
  it("authChallenge returns the unsigned kind-27235 template (challenge + brainstorm_login tags)", async () => {
    const p = new BrainstormProvider({ apiUrl: "https://api", relays: [] }, { fetchImpl: routeFetch() });
    const tmpl = await p.authChallenge(OBS);
    expect(tmpl).toMatchObject({ kind: 27235, content: "" });
    expect(tmpl?.tags).toContainEqual(["challenge", "chal-123"]);
    expect(tmpl?.tags).toContainEqual(["t", "brainstorm_login"]);
  });

  it("authChallenge returns null when the backend cannot issue a challenge", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    const p = new BrainstormProvider({ apiUrl: "https://api", relays: [] }, { fetchImpl });
    expect(await p.authChallenge(OBS)).toBeNull();
  });

  it("personalize verifies then triggers with the bearer token", async () => {
    const p = new BrainstormProvider({ apiUrl: "https://api", relays: [] }, { fetchImpl: routeFetch() });
    const ev = { id: "e", pubkey: OBS, sig: "s", kind: 27235, created_at: 1, tags: [], content: "" } as never;
    expect(await p.personalize(OBS, ev)).toBe(true);
  });

  it("personalize returns false when verify fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const p = new BrainstormProvider({ apiUrl: "https://api", relays: [] }, { fetchImpl });
    expect(await p.personalize(OBS, {} as never)).toBe(false);
  });
});
