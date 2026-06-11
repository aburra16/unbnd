// FAILING TESTS — Story 80 / ADR 0078 (the worker DEMOTION cycle), fully
// injected like the promote consume-loop: a fake claim, a FAKE librarian
// signer (no real LIBRARIAN_NSEC), fake publishers, a fake search delete.
// Asserts: claims demote_pending jobs, builds + signs the DELISTING at the
// record's own address, publishes local + dcosl, deletes the doc from the
// live index, marks the row demoted with the delisting event id; sign /
// publish failures mark demote_failed without crashing the run; a search
// delete failure is swallowed (the batch rebuild is the backstop); one job's
// failure never aborts the others.
import { describe, expect, it, vi } from "vitest";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import {
  runDemotionCycle,
  type DemoterDeps,
  type PromotionJob,
} from "../src/index";

const LIB = asHexPubkey("1".repeat(63) + "a");

function job(slug: string): PromotionJob {
  return {
    id: `job-${slug}`,
    slug,
    requestedBy: "c".repeat(64),
    status: "demoting",
    attempts: 1,
  };
}

function fakeSigner() {
  return vi.fn((template: { kind: number; tags: string[][]; content: string }) => ({
    ...template,
    id: "delist-event-id",
    pubkey: LIB,
    created_at: 1_700_000_500,
    sig: "f".repeat(128),
  }) as unknown as SignedNostrEvent);
}

function makeDeps(over: Partial<DemoterDeps> = {}) {
  const deps: DemoterDeps = {
    librarianPubkey: LIB,
    claimDemotePending: vi.fn(async () => [job("orbital--x")]),
    sign: fakeSigner(),
    publishLocal: vi.fn(async () => ({ ok: true as const, id: "delist-event-id" })),
    publishDcosl: vi.fn(async () => ({ ok: true as const, id: "delist-event-id" })),
    markDemoted: vi.fn(async () => undefined),
    markDemoteFailed: vi.fn(async () => undefined),
    searchDelete: vi.fn(async () => undefined),
    ...over,
  };
  return deps;
}

function tag(tags: string[][], name: string) {
  return tags.find((t) => t[0] === name);
}

describe("runDemotionCycle — the happy path (AC-3, AC-4)", () => {
  it("claims, builds + signs the delisting at the record's own address, publishes local + dcosl, marks demoted with the event id", async () => {
    const deps = makeDeps();
    const result = await runDemotionCycle(deps);

    expect(deps.claimDemotePending).toHaveBeenCalledTimes(1);
    // The signed template is the DELISTING: same d-tag, the marker, no record fields.
    const signedTemplate = (deps.sign as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { kind: number; tags: string[][] };
    expect(signedTemplate.kind).toBe(39999);
    expect(tag(signedTemplate.tags, "d")?.[1]).toBe("orbital--x");
    expect(tag(signedTemplate.tags, "delisted")?.[1]).toBe("true");
    expect(tag(signedTemplate.tags, "title")).toBeUndefined();

    expect(deps.publishLocal).toHaveBeenCalledTimes(1);
    expect(deps.publishDcosl).toHaveBeenCalledTimes(1);
    expect(deps.markDemoted).toHaveBeenCalledWith(job("orbital--x"), "delist-event-id");
    expect(deps.markDemoteFailed).not.toHaveBeenCalled();
    expect(result.demoted).toEqual(["orbital--x"]);
  });

  it("removes the doc from the live search index (delete by slug)", async () => {
    const deps = makeDeps();
    await runDemotionCycle(deps);
    expect(deps.searchDelete).toHaveBeenCalledWith(["orbital--x"]);
  });

  it("searchDelete is optional: absent → the demotion still completes", async () => {
    const deps = makeDeps({ searchDelete: undefined });
    const result = await runDemotionCycle(deps);
    expect(deps.markDemoted).toHaveBeenCalledTimes(1);
    expect(result.demoted).toEqual(["orbital--x"]);
  });

  it("a searchDelete failure is swallowed (batch rebuild is the backstop) — the job is still demoted", async () => {
    const deps = makeDeps({
      searchDelete: vi.fn(async () => {
        throw new Error("provider down");
      }),
    });
    const result = await runDemotionCycle(deps);
    expect(deps.markDemoted).toHaveBeenCalledTimes(1);
    expect(deps.markDemoteFailed).not.toHaveBeenCalled();
    expect(result.demoted).toEqual(["orbital--x"]);
  });
});

describe("runDemotionCycle — fault isolation", () => {
  it("a sign failure marks demote_failed and the run resolves", async () => {
    const deps = makeDeps({
      sign: vi.fn(() => {
        throw new Error("signer unavailable");
      }),
    });
    await expect(runDemotionCycle(deps)).resolves.toBeDefined();
    expect(deps.markDemoteFailed).toHaveBeenCalledTimes(1);
    expect(deps.markDemoted).not.toHaveBeenCalled();
  });

  it("a failed local publish marks demote_failed; one job's failure never aborts the others", async () => {
    const good = job("kept--a");
    const bad = job("broken--b");
    const deps = makeDeps({
      claimDemotePending: vi.fn(async () => [bad, good]),
      publishLocal: vi.fn(async (event: SignedNostrEvent) => {
        const d = (event as unknown as { tags: string[][] }).tags.find((t) => t[0] === "d")?.[1];
        return d === "broken--b"
          ? { ok: false as const, reason: "relay down" }
          : { ok: true as const, id: "delist-event-id" };
      }),
    });
    const result = await runDemotionCycle(deps);
    expect(deps.markDemoteFailed).toHaveBeenCalledTimes(1);
    expect(deps.markDemoted).toHaveBeenCalledTimes(1);
    expect(result.demoted).toEqual(["kept--a"]);
  });
});
