// Failing tests for Story 56 (catalog prune via read-time filter), per ADR 0055 §4.
//
// The indexer UPSERTS and never clears the index first, so a junk document
// indexed before this change lingers across a plain re-run. ADR 0055 §4 fixes
// this by calling `provider.deleteAll()` ONCE, after `configureIndex()` and
// BEFORE the upsert sweep, so a re-index is self-cleaning:
//
//   await provider.configureIndex();
//   await provider.deleteAll();          // NEW
//   for (...) await provider.index(batch);
//
// `main()` in apps/indexer/src/index.ts is private and runs relay I/O at module
// load, so it is not unit-testable as written. To assert the flush-BEFORE-upsert
// ORDERING at the smallest seam, these tests pin a pure orchestration helper that
// the Implementer extracts and `main()` calls. To keep the seam importable
// WITHOUT executing `main()`'s relay I/O, the helper is pinned in a separate
// `apps/indexer/src/run-index.ts` module exporting `runIndex(provider, docs)`
// (interpretation flagged in the test plan). It is loaded via an opaque specifier
// so the missing module/export is a clean assertion-level red, not a tsc wall.
import { describe, expect, it, vi } from "vitest";
import type { SearchDocument, SearchProvider } from "@unbnd/search";
import { loadIndexerModule } from "./_load";

type RunIndexModule = {
  runIndex: (provider: SearchProvider, docs: readonly SearchDocument[]) => Promise<void>;
};
const load = () => loadIndexerModule<RunIndexModule>("run-index");

/** A mock provider that records the ORDER of its lifecycle calls. */
function recordingProvider(): { provider: SearchProvider; calls: string[] } {
  const calls: string[] = [];
  const provider = {
    name: "meili" as const,
    health: vi.fn(async () => ({ ok: true, provider: "meili" as const })),
    configureIndex: vi.fn(async () => {
      calls.push("configureIndex");
    }),
    deleteAll: vi.fn(async () => {
      calls.push("deleteAll");
    }),
    index: vi.fn(async (_docs: readonly SearchDocument[]) => {
      calls.push("index");
    }),
    delete: vi.fn(async (_ids: readonly string[]) => {
      calls.push("delete");
    }),
    search: vi.fn(async () => ({ hits: [], total: 0, offset: 0, limit: 0 })),
  } satisfies SearchProvider;
  return { provider, calls };
}

const doc = (id: string): SearchDocument => ({
  id,
  title: `Title ${id}`,
  authorName: `Author ${id}`,
  subjects: [],
  tags: [],
  genreSlugs: [],
  format: "reference",
});

describe("runIndex — flush before upsert (Story 56, ADR 0055 §4)", () => {
  it("calls provider.deleteAll() exactly once", async () => {
    const { runIndex } = await load();
    const { provider } = recordingProvider();
    await runIndex(provider, [doc("a")]);
    expect(provider.deleteAll).toHaveBeenCalledTimes(1);
  });

  it("calls deleteAll() AFTER configureIndex() and BEFORE any index() upsert", async () => {
    const { runIndex } = await load();
    const { provider, calls } = recordingProvider();
    await runIndex(provider, [doc("a"), doc("b")]);
    const flushAt = calls.indexOf("deleteAll");
    const configAt = calls.indexOf("configureIndex");
    const firstIndexAt = calls.indexOf("index");
    expect(flushAt).toBeGreaterThan(-1);
    expect(configAt).toBeGreaterThan(-1);
    expect(firstIndexAt).toBeGreaterThan(-1);
    expect(flushAt).toBeGreaterThan(configAt); // flush after configure
    expect(flushAt).toBeLessThan(firstIndexAt); // flush before the first upsert
  });

  it("flushes even when there are zero documents (a clean rebuild always flushes)", async () => {
    const { runIndex } = await load();
    const { provider, calls } = recordingProvider();
    await runIndex(provider, []);
    expect(provider.deleteAll).toHaveBeenCalledTimes(1);
    expect(calls.indexOf("deleteAll")).toBeGreaterThan(calls.indexOf("configureIndex"));
  });
});
