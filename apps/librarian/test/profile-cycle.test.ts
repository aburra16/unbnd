// FAILING TESTS (red) — Story 58 / ADR 0057 §4 / §Implementation (the `profile`
// cycle).
//
// runProfileCycle(deps) with INJECTED deps (mirrors the promoter cycle pattern —
// no real network, no real LIBRARIAN_NSEC). Per ADR: build content → kind-0
// template → sign → publish to (DCOSL_RELAY_URL ∪ PROFILE_RELAYS) → verify
// resolvable. Tests:
//   - the kind-0 is published to dcosl + PROFILE_RELAYS.
//   - LIBRARIAN_NAME is required (a missing/empty name is a hard error).
//   - the published event is the built (signed) kind-0.
//
// The deps shape is pinned locally and the cycle is imported from
// `../src/profile-cycle`. RED reason: that module does NOT exist yet — the
// import fails to resolve (module-level red, not a tsc wall).
import { describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { runProfileCycle, type ProfileDeps } from "../src/profile-cycle";

const LIBRARIAN = "1".repeat(64);
const DCOSL = "wss://dcosl.brainstorm.world/";
const PROFILE_RELAYS = ["wss://relay.damus.io", "wss://relay.primal.net"];

type PublishCall = { relays: readonly string[]; event: SignedNostrEvent };

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

function makeDeps(over: Partial<ProfileDeps> = {}): ProfileDeps {
  const published: PublishCall[] = [];
  return {
    librarianPubkey: LIBRARIAN,
    profile: { name: "Unbnd Librarian", about: "Curated book records." },
    dcoslUrl: DCOSL,
    profileRelays: PROFILE_RELAYS,
    sign: fakeSign(),
    publish: vi.fn(async (event: SignedNostrEvent, relays: readonly string[]) => {
      published.push({ event, relays });
      return { ok: true as const, id: event.id };
    }),
    now: () => 1_700_000_000,
    published,
    ...over,
  } as unknown as ProfileDeps & { published: PublishCall[] };
}

function publishedCalls(deps: ProfileDeps): PublishCall[] {
  return (deps as unknown as { published: PublishCall[] }).published;
}

describe("runProfileCycle — relay routing (AC: kind-0 → dcosl + PROFILE_RELAYS)", () => {
  it("publishes the kind-0 to dcosl unioned with the profile relays", async () => {
    const deps = makeDeps();
    await runProfileCycle(deps);
    const allRelays = publishedCalls(deps).flatMap((c) => c.relays);
    for (const r of [DCOSL, ...PROFILE_RELAYS]) {
      expect(allRelays).toContain(r);
    }
  });

  it("publishes a kind-0 event (not some other kind)", async () => {
    const sign = fakeSign();
    const deps = makeDeps({ sign });
    await runProfileCycle(deps);
    expect((sign.mock.calls[0]![0] as { kind: number }).kind).toBe(0);
  });
});

describe("runProfileCycle — the published event is the built kind-0", () => {
  it("publishes exactly the signed kind-0 built from the configured profile", async () => {
    const deps = makeDeps();
    await runProfileCycle(deps);
    const calls = publishedCalls(deps);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.event.kind).toBe(0);
      expect(call.event.pubkey).toBe(LIBRARIAN);
      const content = JSON.parse(call.event.content) as Record<string, unknown>;
      expect(content.name).toBe("Unbnd Librarian");
      expect(content.display_name).toBe("Unbnd Librarian");
      expect(content.about).toBe("Curated book records.");
    }
  });
});

describe("runProfileCycle — config validation (AC: LIBRARIAN_NAME required)", () => {
  it("hard-errors when the profile name is missing/empty", async () => {
    const deps = makeDeps({ profile: { name: "" } });
    await expect(runProfileCycle(deps)).rejects.toThrow();
  });
});
