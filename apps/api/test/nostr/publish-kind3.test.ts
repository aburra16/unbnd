// Failing tests (red) for Story 23 AC-8 — publishKind3 (the kind-3 propagation
// model, mirroring publishKind0; ADR 0023 Decision 4, ADR 0022 F2-A). kind-3
// lives on the PUBLIC profile relays, so:
//   - the LOCAL strfry publish is AWAITED and GATES the response/read-back, and
//   - the profile-relay fan-out is BEST-EFFORT fire-and-forget — a profile-relay
//     failure must NOT fail the user's save.
//   - dcosl is EXCLUDED (it rejects kind-3); only local + the profile relays.
//
// Story-22 LESSON honored: we do NOT `vi.mock` an intra-module call to
// publishEvent/publishToMany (an export-level mock can't intercept the real
// in-module reference under vitest/ESM — that was the Story-22 defect). Instead
// the publisher is INJECTED. The ADR offers a `publishPublicRelayKind(label)`
// factory in index.ts; this pins that factory's contract with injected
// local + many publishers, so the same red applies whether the Implementer
// names it publishKind3 or the shared publishPublicRelayKind.
//
// `publishPublicRelayKind` is not exported yet → import fails → red.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { publishPublicRelayKind } from "../../src/nostr/publish-public-relay-kind";

const EV = { id: "k3-evt", kind: 3 } as SignedNostrEvent;
const LOCAL = "ws://localhost:7777";
const PROFILE = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"];

afterEach(() => vi.clearAllMocks());

describe("publishPublicRelayKind (publishKind3, AC-8)", () => {
  it("AWAITS the local relay and returns its result (the local publish gates the response)", async () => {
    const local = vi.fn(async () => ({ ok: true as const, id: "k3-evt" }));
    const many = vi.fn(async () => []);
    const publish = publishPublicRelayKind("profile-publish", {
      localRelay: LOCAL,
      profileRelays: PROFILE,
      publishLocal: local,
      publishMany: many,
    });
    const result = await publish(EV);
    expect(result.ok).toBe(true);
    expect(local).toHaveBeenCalledTimes(1);
    expect(local).toHaveBeenCalledWith(LOCAL, EV);
  });

  it("a LOCAL relay failure gates the response (returns ok:false, surfaced as 502 upstream)", async () => {
    const local = vi.fn(async () => ({ ok: false as const, reason: "local down" }));
    const many = vi.fn(async () => []);
    const publish = publishPublicRelayKind("profile-publish", {
      localRelay: LOCAL,
      profileRelays: PROFILE,
      publishLocal: local,
      publishMany: many,
    });
    const result = await publish(EV);
    expect(result.ok).toBe(false);
  });

  it("fans out to the profile relays after a local success", async () => {
    const local = vi.fn(async () => ({ ok: true as const, id: "k3-evt" }));
    const many = vi.fn(async () => PROFILE.map(() => ({ ok: true as const, id: "k3-evt" })));
    const publish = publishPublicRelayKind("profile-publish", {
      localRelay: LOCAL,
      profileRelays: PROFILE,
      publishLocal: local,
      publishMany: many,
    });
    await publish(EV);
    // The fan-out is fire-and-forget; let the microtask settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(many).toHaveBeenCalledTimes(1);
    expect(many).toHaveBeenCalledWith(PROFILE, EV);
  });

  it("a profile-relay fan-out failure does NOT fail the save (still resolves ok on local success)", async () => {
    const local = vi.fn(async () => ({ ok: true as const, id: "k3-evt" }));
    // Every profile-relay rejects, AND the fan-out itself rejects: the save still succeeds.
    const many = vi.fn(async () => {
      throw new Error("all profile relays down");
    });
    const publish = publishPublicRelayKind("profile-publish", {
      localRelay: LOCAL,
      profileRelays: PROFILE,
      publishLocal: local,
      publishMany: many,
    });
    const result = await publish(EV);
    expect(result.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
  });

  it("does NOT fan out to the profile relays when the local publish failed", async () => {
    const local = vi.fn(async () => ({ ok: false as const, reason: "local down" }));
    const many = vi.fn(async () => []);
    const publish = publishPublicRelayKind("profile-publish", {
      localRelay: LOCAL,
      profileRelays: PROFILE,
      publishLocal: local,
      publishMany: many,
    });
    await publish(EV);
    await new Promise((r) => setTimeout(r, 0));
    expect(many).not.toHaveBeenCalled();
  });

  it("never publishes to dcosl: the injected fan-out relays are the profile relays only", async () => {
    const local = vi.fn(async () => ({ ok: true as const, id: "k3-evt" }));
    const many = vi.fn(async (_relays: readonly string[], _ev: SignedNostrEvent) => []);
    const publish = publishPublicRelayKind("profile-publish", {
      localRelay: LOCAL,
      profileRelays: PROFILE,
      publishLocal: local,
      publishMany: many,
    });
    await publish(EV);
    await new Promise((r) => setTimeout(r, 0));
    const relays = many.mock.calls[0]?.[0] as string[] | undefined;
    expect(relays).toEqual(PROFILE);
    expect(relays?.some((r) => r.includes("dcosl"))).toBe(false);
  });
});
