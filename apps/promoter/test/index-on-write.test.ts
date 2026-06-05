// FAILING TESTS (red) — Story 60 (index-on-write), ADR 0059 Q2 + §5 (the
// promoter hook). After the promoter durably publishes the canonical catalog
// BookRecord and marks the job done, it fires a best-effort reindex for the
// promoted book so a freshly promoted submission is findable in search WITHOUT a
// batch run. A reveal (runRevealCycle) does NOT reindex; a reindex failure is
// swallowed and never fails the promotion (markDone is the contract).
//
// SEAM PINNED FROM ADR 0059 §5 (flag for the Implementer): `PromoterDeps` gains
// an OPTIONAL injected hook
//     readonly reindexBook?: (bookSlug: string) => Promise<void> | void;
// fired in `promoteOne` AFTER `markDone(job, signed.id)`, awaited inside a
// try/catch so a failure is logged + swallowed and the job stays done. We drive
// it through the exported `runPromotionCycle` (promoteOne is module-private) and
// inject `reindexBook` as a spy. A FAILED publish (markFailed, no markDone) fires
// NO reindex.
//
// RED until the Implementer adds `reindexBook?` to PromoterDeps and the post-
// markDone trigger. Today PromoterDeps has no such field, so the spy is never
// called and the assertions fail at the assertion level. (Injected via an
// `as PromoterDeps` cast so the not-yet-present property is not a tsc wall.)
import { describe, expect, it, vi } from "vitest";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import { runPromotionCycle, type PromotionJob, type PromoterDeps } from "../src/index";

const LIB = asHexPubkey("1".repeat(63) + "a");
const SUBMITTER = asHexPubkey("2".repeat(63) + "b");

function job(slug: string): PromotionJob {
  return {
    id: `job-${slug}`,
    slug,
    requestedBy: "c".repeat(64),
    status: "promoting",
    attempts: 1,
  };
}

function submissionEvent(slug: string): SignedNostrEvent {
  return {
    id: `sub-${slug}`,
    pubkey: SUBMITTER,
    kind: 39999,
    created_at: 1_700_000_000,
    content: "",
    tags: [
      ["d", slug],
      ["title", "Orbital"],
      ["author", "Samantha Harvey"],
      ["source", "community"],
    ],
    sig: "0".repeat(128),
  } as unknown as SignedNostrEvent;
}

function fakeSigner() {
  return vi.fn((template: { kind: number; tags: string[][]; content: string }) => ({
    ...template,
    id: "canonical-event-id",
    pubkey: LIB,
    created_at: 1_700_000_500,
    sig: "f".repeat(128),
  }) as unknown as SignedNostrEvent);
}

/** Promoter deps with an injected `reindexBook` spy (ADR 0059 §5 seam). */
function makeDeps(
  over: Partial<PromoterDeps> & { reindexBook?: (slug: string) => Promise<void> | void } = {},
) {
  const reindexBook = over.reindexBook ?? vi.fn(async () => {});
  const deps = {
    librarianPubkey: LIB,
    claimPending: vi.fn(async () => [job("orbital--x")]),
    readSubmission: vi.fn(async (slug: string) => submissionEvent(slug)),
    sign: fakeSigner(),
    publishLocal: vi.fn(async () => ({ ok: true as const })),
    publishDcosl: vi.fn(async () => ({ ok: true as const })),
    markDone: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    reindexBook,
    ...over,
  } as unknown as PromoterDeps;
  return { deps, reindexBook };
}

describe("runPromotionCycle → reindex hook (ADR 0059 §5, AC: promotion → new book document)", () => {
  it("fires reindexBook once for the promoted slug after a successful promotion", async () => {
    const reindexBook = vi.fn(async () => {});
    const { deps } = makeDeps({ reindexBook });
    await runPromotionCycle(deps);

    expect(deps.markDone).toHaveBeenCalledTimes(1);
    expect(reindexBook).toHaveBeenCalledTimes(1);
    expect(reindexBook).toHaveBeenCalledWith("orbital--x");
  });

  it("fires NO reindex when the publish fails (markFailed, no markDone)", async () => {
    const reindexBook = vi.fn(async () => {});
    const { deps } = makeDeps({
      reindexBook,
      publishLocal: vi.fn(async () => ({ ok: false as const, reason: "relay refused" })),
      publishDcosl: vi.fn(async () => ({ ok: false as const, reason: "relay refused" })),
    });
    await runPromotionCycle(deps);

    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.markDone).not.toHaveBeenCalled();
    expect(reindexBook).not.toHaveBeenCalled();
  });

  it("a reindex failure is swallowed: the promotion still completes (markDone ran, run resolves)", async () => {
    const reindexBook = vi.fn(async () => {
      throw new Error("provider down");
    });
    const { deps } = makeDeps({ reindexBook });

    await expect(runPromotionCycle(deps)).resolves.not.toThrow();
    expect(deps.markDone).toHaveBeenCalledTimes(1);
    expect(deps.markFailed).not.toHaveBeenCalled(); // a reindex failure NEVER fails the job
    expect(reindexBook).toHaveBeenCalledTimes(1);
  });
});
