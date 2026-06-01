// Story 30 / ADR 0031 §1 — the promoter CONSUME LOOP, fully injected:
//   (a) a fake queue-reader (claims pending jobs, marks done/failed)
//   (b) a FAKE librarian signer (deterministic stub — NO real LIBRARIAN_NSEC)
//   (c) a FAKE publisher (no live relay)
// Asserts: claims a pending job, builds+signs the canonical record, publishes to
// local + dcosl, marks the job `done` with canonical_id; idempotent (re-run on the
// same slug → one canonical record under the d-tag, second is a safe replace/no-op);
// a publish/sign failure marks `failed` and does NOT crash the run.
//
// RED until `apps/promoter/src/index.ts` exports the injectable cycle. No relay,
// no real librarian key.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { runPromotionCycle, type PromotionJob, type PromoterDeps } from "../src/index";

const LIB = asHexPubkey("1".repeat(63) + "a");
const SUBMITTER = asHexPubkey("2".repeat(63) + "b");

// A pending job as the queue hands it to the loop.
function job(slug: string): PromotionJob {
  return {
    id: `job-${slug}`,
    slug,
    requestedBy: "c".repeat(64),
    status: "promoting",
    attempts: 1,
  };
}

// The submission event the worker reads back from the relay for that slug.
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

// A deterministic fake librarian signer: never a real LIBRARIAN_NSEC. It stamps
// a fixed id/pubkey/sig so the canonical record is asserted without crypto.
function fakeSigner() {
  return vi.fn((template: { kind: number; tags: string[][]; content: string }) => ({
    ...template,
    id: "canonical-event-id",
    pubkey: LIB,
    created_at: 1_700_000_500,
    sig: "f".repeat(128),
  }) as unknown as SignedNostrEvent);
}

function makeDeps(over: Partial<PromoterDeps> = {}): PromoterDeps {
  return {
    librarianPubkey: LIB,
    claimPending: vi.fn(async () => [job("orbital--x")]),
    readSubmission: vi.fn(async (slug: string) => submissionEvent(slug)),
    sign: fakeSigner(),
    publishLocal: vi.fn(async () => ({ ok: true as const })),
    publishDcosl: vi.fn(async () => ({ ok: true as const })),
    markDone: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    ...over,
  } as unknown as PromoterDeps;
}

describe("runPromotionCycle — happy path (AC-3, AC-4)", () => {
  it("claims the pending job, signs with the librarian, publishes to local + dcosl, marks done", async () => {
    const deps = makeDeps();
    await runPromotionCycle(deps);

    expect(deps.claimPending).toHaveBeenCalledTimes(1);
    expect(deps.sign).toHaveBeenCalledTimes(1);
    expect(deps.publishLocal).toHaveBeenCalledTimes(1);
    expect(deps.publishDcosl).toHaveBeenCalledTimes(1);
    expect(deps.markDone).toHaveBeenCalledTimes(1);
    // markDone records the canonical event id (the librarian record at the address).
    expect(deps.markDone).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-orbital--x" }),
      "canonical-event-id",
    );
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("signs a canonical record under the books header with d-tag = slug, source community, submitted-by the submitter (hex)", async () => {
    const sign = fakeSigner();
    const deps = makeDeps({ sign });
    await runPromotionCycle(deps);

    const signed = sign.mock.calls[0]![0] as { tags: string[][] };
    const tags = signed.tags;
    expect(tags).toContainEqual(["d", "orbital--x"]);
    expect(tags).toContainEqual(["source", "community"]);
    expect(tags).toContainEqual(["submitted-by", SUBMITTER]);
    // The submitter is HEX on the wire, never an npub.
    const subTag = tags.find((t) => t[0] === "submitted-by");
    expect(subTag![1]).not.toMatch(/^npub1/);
  });
});

describe("runPromotionCycle — idempotency (AC-7)", () => {
  it("re-running the same slug publishes under the SAME address (one canonical record, replace not duplicate)", async () => {
    const sign1 = fakeSigner();
    await runPromotionCycle(makeDeps({ sign: sign1 }));
    const sign2 = fakeSigner();
    await runPromotionCycle(makeDeps({ sign: sign2 }));

    const dtag1 = (sign1.mock.calls[0]![0] as { tags: string[][] }).tags.find((t) => t[0] === "d");
    const dtag2 = (sign2.mock.calls[0]![0] as { tags: string[][] }).tags.find((t) => t[0] === "d");
    // Same d-tag → same address 39999:<librarian>:<slug> → the relay keeps one.
    expect(dtag1).toEqual(dtag2);
  });

  it("a job already done is not re-signed (claimPending returns nothing → no work)", async () => {
    const deps = makeDeps({ claimPending: vi.fn(async () => []) });
    await runPromotionCycle(deps);
    expect(deps.sign).not.toHaveBeenCalled();
    expect(deps.publishLocal).not.toHaveBeenCalled();
    expect(deps.markDone).not.toHaveBeenCalled();
  });
});

describe("runPromotionCycle — failure handling (does not crash)", () => {
  it("a publish failure marks the job failed (retriable) and the run resolves", async () => {
    const deps = makeDeps({
      publishLocal: vi.fn(async () => ({ ok: false as const, reason: "relay refused" })),
      publishDcosl: vi.fn(async () => ({ ok: false as const, reason: "relay refused" })),
    });
    await expect(runPromotionCycle(deps)).resolves.not.toThrow();
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.markDone).not.toHaveBeenCalled();
  });

  it("a thrown error during one job marks it failed and does not abort the whole run", async () => {
    const deps = makeDeps({
      claimPending: vi.fn(async () => [job("a"), job("b")]),
      readSubmission: vi.fn(async (slug: string) => {
        if (slug === "a") throw new Error("submission not found on relay");
        return submissionEvent(slug);
      }),
    });
    await expect(runPromotionCycle(deps)).resolves.not.toThrow();
    // Job a failed; job b still got promoted.
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.markDone).toHaveBeenCalledTimes(1);
  });
});
