// Story 98 / ADR 0088 rewrite. Originally Story 58 / ADR 0057 §4 / §Implementation (the `profile`
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
import { LIBRARIAN_PROFILE, LIBRARIAN_RELAY_LIST } from "../src/profile-content";

const LIBRARIAN = "1".repeat(64);
const PUBLISH_RELAYS = ["wss://relay.damus.io", "wss://purplepag.es", "wss://search.brainstorm.world"];

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
    publishRelays: PUBLISH_RELAYS,
    designationOf: vi.fn(async () => [["30382:rank", "4".repeat(64), "wss://scores.brainstorm.world"]]),
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

describe("runProfileCycle (ADR 0088 §2): the profile, then the relay list", () => {
  it("publishes the kind-0, the kind-10002 and the kind-10040, all to the publish relays", async () => {
    const deps = makeDeps();
    await runProfileCycle(deps);
    const calls = publishedCalls(deps);
    expect(calls.map((c) => c.event.kind)).toEqual([0, 10002, 10040]);
    for (const c of calls) expect(c.relays).toEqual(PUBLISH_RELAYS);
  });

  it("publishes the reviewed constants, not configuration", async () => {
    const deps = makeDeps();
    await runProfileCycle(deps);
    const [k0, k10002] = publishedCalls(deps).map((c) => c.event);
    expect(JSON.parse(k0!.content)).toEqual(LIBRARIAN_PROFILE);
    expect(k10002!.tags).toEqual(LIBRARIAN_RELAY_LIST.map((r) => ["r", r]));
  });

  it("never sends the profile to dcosl, which stores only list kinds", async () => {
    const deps = makeDeps({ publishRelays: [...PUBLISH_RELAYS, "wss://dcosl.brainstorm.world/"] });
    await expect(runProfileCycle(deps)).rejects.toThrow(/dcosl/);
  });

  it("fails loudly when a publish is refused everywhere, and stops before the relay list", async () => {
    const deps = makeDeps({
      publish: vi.fn(async () => ({ ok: false as const, reason: "all relays refused" })),
    });
    await expect(runProfileCycle(deps)).rejects.toThrow(/refused/);
    expect((deps.publish as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("runProfileCycle: the trust designation (Story 102 / ADR 0090)", () => {
  it("asks the trust provider about the librarian and publishes what it names", async () => {
    const deps = makeDeps();
    await runProfileCycle(deps);
    expect((deps as unknown as { designationOf: ReturnType<typeof vi.fn> }).designationOf).toHaveBeenCalledWith(LIBRARIAN);
    const k10040 = publishedCalls(deps).find((c) => c.event.kind === 10040)!.event;
    expect(k10040.tags).toEqual([["30382:rank", "4".repeat(64), "wss://scores.brainstorm.world"]]);
  });

  it("with nothing usable from the provider: the profile and relay list still go out, then it fails loudly", async () => {
    const deps = makeDeps({ designationOf: vi.fn(async () => []) } as never);
    await expect(runProfileCycle(deps)).rejects.toThrow(/setup/);
    expect(publishedCalls(deps).map((c) => c.event.kind)).toEqual([0, 10002]);
  });
});
