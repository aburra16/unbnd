// FAILING TESTS (red) — Story 33 / ADR 0034 §4. The reveal job-kind's CONSUME
// CYCLE, fully injected (mirrors runPromotionCycle):
//   (a) a fake reveal-queue reader (claims a pending reveal row, marks done/failed)
//   (b) a FAKE librarian signer (deterministic stub — NO real LIBRARIAN_NSEC)
//   (c) a FAKE publisher (no live relay)
// Asserts: claims a pending reveal, builds the librarian-signed AccusatoryReveal
// event for (book, tag) with the row's `state`, publishes to local + dcosl,
// marks the row done with `minted_id`; a `withdrawn` intent mints a
// state:"withdrawn" event at the SAME (book,tag) address (idempotent re-run
// replaces); a publish failure marks `failed` and does NOT crash the run.
//
// RED until apps/promoter/src/reveal/cycle.ts exports runRevealCycle + the
// RevealJob / RevealDeps types. No relay, no real librarian key.
import { describe, expect, it, vi } from "vitest";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import { runRevealCycle, type RevealJob, type RevealDeps } from "../src/reveal/cycle";

const LIB = asHexPubkey("1".repeat(63) + "a");

function job(over: Partial<RevealJob> = {}): RevealJob {
  return {
    id: "rev-1",
    bookSlug: "b1",
    tagSlug: "ai-generated",
    state: "revealed",
    requestedBy: LIB,
    status: "minting",
    attempts: 1,
    ...over,
  };
}

// A deterministic fake librarian signer — never a real LIBRARIAN_NSEC. It stamps
// a fixed id/pubkey/sig so the minted reveal is asserted without crypto.
function fakeSigner() {
  return vi.fn((template: { kind: number; tags: string[][]; content: string }) => ({
    ...template,
    id: "reveal-event-id",
    pubkey: LIB,
    created_at: 1_700_000_500,
    sig: "f".repeat(128),
  }) as unknown as SignedNostrEvent);
}

function makeDeps(over: Partial<RevealDeps> = {}): RevealDeps {
  return {
    librarianPubkey: LIB,
    claimPending: vi.fn(async () => [job()]),
    sign: fakeSigner(),
    publishLocal: vi.fn(async () => ({ ok: true as const })),
    publishDcosl: vi.fn(async () => ({ ok: true as const })),
    markDone: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    ...over,
  } as unknown as RevealDeps;
}

describe("runRevealCycle — mint a reveal (AC-4)", () => {
  it("claims the pending row, librarian-signs the reveal, publishes local + dcosl, marks done with minted_id", async () => {
    const deps = makeDeps();
    await runRevealCycle(deps);
    expect(deps.claimPending).toHaveBeenCalledTimes(1);
    expect(deps.sign).toHaveBeenCalledTimes(1);
    expect(deps.publishLocal).toHaveBeenCalledTimes(1);
    expect(deps.publishDcosl).toHaveBeenCalledTimes(1);
    expect(deps.markDone).toHaveBeenCalledTimes(1);
    expect(deps.markDone).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rev-1" }),
      "reveal-event-id",
    );
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("signs a reveal under the accusatory-reveals header, #a book, #t tag, state revealed, d-tag = reveal--<book>--<tag>", async () => {
    const sign = fakeSigner();
    await runRevealCycle(makeDeps({ sign }));
    const tags = (sign.mock.calls[0]![0] as { tags: string[][] }).tags;
    expect(tags).toContainEqual(["d", "reveal--b1--ai-generated"]);
    expect(tags).toContainEqual(["z", `39998:${LIB}:accusatory-reveals`]);
    expect(tags).toContainEqual(["a", `39999:${LIB}:b1`]);
    expect(tags).toContainEqual(["t", "ai-generated"]);
    expect(tags).toContainEqual(["state", "revealed"]);
  });
});

describe("runRevealCycle — mint a withdraw (AC-6)", () => {
  it("a `withdrawn` row mints a state:'withdrawn' event at the SAME (book,tag) address", async () => {
    const sign = fakeSigner();
    await runRevealCycle(makeDeps({ sign, claimPending: vi.fn(async () => [job({ state: "withdrawn" })]) }));
    const tags = (sign.mock.calls[0]![0] as { tags: string[][] }).tags;
    expect(tags).toContainEqual(["state", "withdrawn"]);
    // Same address as the reveal → a withdraw REPLACES (reversible, AC-6).
    expect(tags).toContainEqual(["d", "reveal--b1--ai-generated"]);
  });
});

describe("runRevealCycle — failure handling (does not crash)", () => {
  it("a publish failure to BOTH relays marks the row failed (retriable) and the run resolves", async () => {
    const deps = makeDeps({
      publishLocal: vi.fn(async () => ({ ok: false as const, reason: "relay refused" })),
      publishDcosl: vi.fn(async () => ({ ok: false as const, reason: "relay refused" })),
    });
    await expect(runRevealCycle(deps)).resolves.not.toThrow();
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.markDone).not.toHaveBeenCalled();
  });

  it("no pending rows → no work (nothing signed, nothing published)", async () => {
    const deps = makeDeps({ claimPending: vi.fn(async () => []) });
    await runRevealCycle(deps);
    expect(deps.sign).not.toHaveBeenCalled();
    expect(deps.publishLocal).not.toHaveBeenCalled();
    expect(deps.markDone).not.toHaveBeenCalled();
  });
});
