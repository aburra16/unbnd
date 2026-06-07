// FAILING TESTS (red) — Story 58 / ADR 0057 §4 (the `follows` cycle).
//
// runFollowsCycle(deps) with INJECTED deps (mirrors the promoter's runRevealCycle
// injection — no real network, no real LIBRARIAN_NSEC). The cycle, per ADR §4:
//   read existing kind-3 -> mergeSeedFollows -> build -> sign
//     -> publish kind-3 to (TRUST_RELAYS ∪ LIBRARIAN_GENERAL_RELAYS), NOT dcosl
//     -> ONLY on a confirmed kind-3 publish -> GrapeRank trigger:
//          trust.authChallenge(librarianHex) -> finalizeEvent(challenge, sk)
//          -> trust.personalize(librarianHex, signed)
//   The kind-3 publish is the DURABLE part (publish failure => the cycle errors
//   so the operator re-runs). The GrapeRank trigger is BEST-EFFORT / FAIL-OPEN:
//   a null challenge, a throw, or personalize()=false logs and the cycle still
//   resolves (exit 0).
//   Config validation: empty/missing SEED_CURATORS is a hard error; a non-hex
//   entry is rejected.
//
// The deps shape is pinned locally and the cycle is imported from
// `../src/follows-cycle`. RED reason: that module does NOT exist yet — the
// import fails to resolve (module-level red, not a tsc wall). Synthetic hex
// only (firewall): no real curator pubkey.
import { describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { TrustProvider } from "@unbnd/trust";
import { runFollowsCycle, type FollowsDeps } from "../src/follows-cycle";

// Synthetic 64-hex — NEVER a real curator / key (ADR 0057 firewall).
const LIBRARIAN = "1".repeat(64);
const SEED_A = "a".repeat(64);
const SEED_B = "b".repeat(64);

const TRUST_RELAYS = [
  "wss://nip85.nosfabrica.com",
  "wss://nip85.brainstorm.world",
];
const GENERAL_RELAYS = ["wss://relay.damus.io", "wss://nos.lol"];
const DCOSL = "wss://dcosl.brainstorm.world/";

// A recorded publish call: which relays the event was sent to.
type PublishCall = { relays: readonly string[]; event: SignedNostrEvent };

// A deterministic fake signer — never a real LIBRARIAN_NSEC. Stamps a fixed
// id/pubkey/sig so the signed event is asserted without crypto.
function fakeSign() {
  return vi.fn(
    (template: { kind: number; tags: string[][]; content: string }) =>
      ({
        ...template,
        id: `signed-${template.kind}`,
        pubkey: LIBRARIAN,
        created_at: 1_700_000_500,
        sig: "f".repeat(128),
      }) as unknown as SignedNostrEvent,
  );
}

// A fake TrustProvider that records the GrapeRank-trigger call order. Only the
// three methods the cycle drives are meaningful; the rest satisfy the interface.
function fakeTrust(
  over: Partial<Pick<TrustProvider, "authChallenge" | "personalize">> = {},
): TrustProvider & { calls: string[] } {
  const calls: string[] = [];
  const provider: TrustProvider & { calls: string[] } = {
    calls,
    name: "fixture",
    weights: vi.fn(async () => new Map()),
    followers: vi.fn(async () => new Map()),
    hasScores: vi.fn(async () => false),
    authChallenge:
      over.authChallenge ??
      vi.fn(async () => {
        calls.push("authChallenge");
        return {
          kind: 27235,
          created_at: 1,
          tags: [["challenge", "x"]],
          content: "",
        };
      }),
    personalize:
      over.personalize ??
      vi.fn(async () => {
        calls.push("personalize");
        return true;
      }),
  };
  return provider;
}

function makeDeps(over: Partial<FollowsDeps> = {}): FollowsDeps {
  const published: PublishCall[] = [];
  return {
    librarianPubkey: LIBRARIAN,
    seedCurators: [SEED_A, SEED_B],
    trustRelays: TRUST_RELAYS,
    generalRelays: GENERAL_RELAYS,
    readExistingKind3: vi.fn(async () => null),
    sign: fakeSign(),
    publish: vi.fn(async (event: SignedNostrEvent, relays: readonly string[]) => {
      published.push({ event, relays });
      return { ok: true as const, id: event.id };
    }),
    trust: fakeTrust(),
    now: () => 1_700_000_000,
    // expose for assertions
    published,
    ...over,
  } as unknown as FollowsDeps & { published: PublishCall[] };
}

function publishedCalls(deps: FollowsDeps): PublishCall[] {
  return (deps as unknown as { published: PublishCall[] }).published;
}

describe("runFollowsCycle — relay routing (AC: kind-3 → trust + general, NOT dcosl)", () => {
  it("publishes the kind-3 to TRUST_RELAYS ∪ LIBRARIAN_GENERAL_RELAYS", async () => {
    const deps = makeDeps();
    await runFollowsCycle(deps);
    const calls = publishedCalls(deps);
    const allRelays = calls.flatMap((c) => c.relays);
    for (const r of [...TRUST_RELAYS, ...GENERAL_RELAYS]) {
      expect(allRelays).toContain(r);
    }
  });

  it("never targets dcosl with the kind-3 (dcosl rejects kind-3)", async () => {
    const deps = makeDeps();
    await runFollowsCycle(deps);
    const allRelays = publishedCalls(deps).flatMap((c) => c.relays);
    expect(allRelays).not.toContain(DCOSL);
  });

  it("publishes a kind-3 carrying one `p` tag per seed curator (merged from null)", async () => {
    const sign = fakeSign();
    const deps = makeDeps({ sign });
    await runFollowsCycle(deps);
    const tags = (sign.mock.calls[0]![0] as { kind: number; tags: string[][] }).tags;
    expect((sign.mock.calls[0]![0] as { kind: number }).kind).toBe(3);
    expect(tags).toContainEqual(["p", SEED_A]);
    expect(tags).toContainEqual(["p", SEED_B]);
  });
});

describe("runFollowsCycle — ordering + GrapeRank trigger (AC: publish FIRST, then trigger)", () => {
  it("publishes the kind-3 before triggering GrapeRank, in the right order", async () => {
    const order: string[] = [];
    const trust = fakeTrust({
      authChallenge: vi.fn(async () => {
        order.push("authChallenge");
        return { kind: 27235, created_at: 1, tags: [], content: "" };
      }),
      personalize: vi.fn(async () => {
        order.push("personalize");
        return true;
      }),
    });
    const deps = makeDeps({
      trust,
      publish: vi.fn(async (event: SignedNostrEvent) => {
        order.push("publish");
        return { ok: true as const, id: event.id };
      }),
    });
    await runFollowsCycle(deps);
    // publish happens before the trigger; the trigger is authChallenge → personalize.
    expect(order.indexOf("publish")).toBeLessThan(order.indexOf("authChallenge"));
    expect(order.indexOf("authChallenge")).toBeLessThan(order.indexOf("personalize"));
  });

  it("signs the challenge with the librarian key and passes that signed event to personalize", async () => {
    const personalize = vi.fn(
      async (_observer: string, _signed: SignedNostrEvent) => true,
    );
    const trust = fakeTrust({
      authChallenge: vi.fn(async () => ({
        kind: 27235,
        created_at: 1,
        tags: [["challenge", "x"]],
        content: "",
      })),
      personalize,
    });
    const deps = makeDeps({ trust });
    await runFollowsCycle(deps);
    expect(personalize).toHaveBeenCalledTimes(1);
    const [observer, signed] = personalize.mock.calls[0]!;
    expect(observer).toBe(LIBRARIAN);
    // The signed challenge is a kind-27235 signed by the librarian (fakeSign).
    expect(signed.kind).toBe(27235);
    expect(signed.pubkey).toBe(LIBRARIAN);
  });
});

describe("runFollowsCycle — GrapeRank trigger is FAIL-OPEN (AC: durable kind-3, best-effort trigger)", () => {
  it("a null challenge logs and the cycle still resolves (exit 0)", async () => {
    const trust = fakeTrust({ authChallenge: vi.fn(async () => null) });
    const deps = makeDeps({ trust });
    await expect(runFollowsCycle(deps)).resolves.not.toThrow();
    // the durable kind-3 was still published.
    expect(publishedCalls(deps).length).toBeGreaterThan(0);
  });

  it("a thrown personalize is swallowed and the cycle still resolves", async () => {
    const trust = fakeTrust({
      personalize: vi.fn(async () => {
        throw new Error("brainstorm unreachable");
      }),
    });
    const deps = makeDeps({ trust });
    await expect(runFollowsCycle(deps)).resolves.not.toThrow();
  });

  it("a personalize() === false is tolerated; the cycle still resolves", async () => {
    const trust = fakeTrust({ personalize: vi.fn(async () => false) });
    const deps = makeDeps({ trust });
    await expect(runFollowsCycle(deps)).resolves.not.toThrow();
  });
});

describe("runFollowsCycle — durable kind-3 publish failure (AC: operator re-runs)", () => {
  it("errors when the kind-3 fails to publish to the trust relays (does NOT trigger GrapeRank)", async () => {
    const trust = fakeTrust();
    const deps = makeDeps({
      trust,
      publish: vi.fn(async () => ({ ok: false as const, reason: "all relays refused" })),
    });
    await expect(runFollowsCycle(deps)).rejects.toThrow();
    // The GrapeRank trigger is gated on a confirmed publish — it must NOT have run.
    expect(trust.calls).not.toContain("authChallenge");
  });
});

describe("runFollowsCycle — config validation (AC: SEED_CURATORS required + hex)", () => {
  it("hard-errors on an empty seed-curator set", async () => {
    const deps = makeDeps({ seedCurators: [] });
    await expect(runFollowsCycle(deps)).rejects.toThrow();
  });

  it("hard-errors on a non-`^[0-9a-f]{64}$` seed entry", async () => {
    const deps = makeDeps({ seedCurators: ["not-a-valid-hex-pubkey"] });
    await expect(runFollowsCycle(deps)).rejects.toThrow();
  });
});
