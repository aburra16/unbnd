// FAILING/GUARD TESTS — Story 60 (index-on-write), ADR 0059 §5. The reveal
// CONSUME CYCLE (runRevealCycle) surfaces an accusatory tag at READ time only —
// not an indexed field — so it must NOT reindex. This is the promoter-side
// control mirroring the ratings no-op: reveal stays a no-op by construction.
//
// We inject a `reindexBook` spy onto RevealDeps (via cast — the property is
// intentionally NOT in RevealDeps) and assert a completed reveal never calls it.
// GREEN today (the reveal cycle has no hook) and must STAY green after the
// Implementer lands the promotion hook — pinning that the hook went on the
// PROMOTION path only, never the reveal path.
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

function fakeSigner() {
  return vi.fn((template: { kind: number; tags: string[][]; content: string }) => ({
    ...template,
    id: "reveal-event-id",
    pubkey: LIB,
    created_at: 1_700_000_500,
    sig: "f".repeat(128),
  }) as unknown as SignedNostrEvent);
}

describe("runRevealCycle → NO index write (ADR 0059 §5, reveal is read-time only)", () => {
  it("a completed reveal never invokes a reindex hook", async () => {
    const reindexBook = vi.fn(async () => {});
    const deps = {
      librarianPubkey: LIB,
      claimPending: vi.fn(async () => [job()]),
      sign: fakeSigner(),
      publishLocal: vi.fn(async () => ({ ok: true as const })),
      publishDcosl: vi.fn(async () => ({ ok: true as const })),
      markDone: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
      reindexBook,
    } as unknown as RevealDeps;

    await runRevealCycle(deps);
    expect(deps.markDone).toHaveBeenCalledTimes(1);
    expect(reindexBook).not.toHaveBeenCalled();
  });
});
