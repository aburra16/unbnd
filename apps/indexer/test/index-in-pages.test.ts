// FAILING TESTS — Story 108 / ADR 0096 §4: the indexer clears once, then
// upserts page by page, never holding the whole catalog.
import { describe, expect, it, vi } from "vitest";
import type { SearchDocument, SearchProvider } from "@unbnd/search";
import { runIndexInPages } from "../src/run-index";

const doc = (id: string) => ({ id, title: id, authorName: "A", subjects: [], tags: [], genreSlugs: [], format: "reference" }) as SearchDocument;

describe("runIndexInPages", () => {
  it("configures and clears once, before the first upsert, then indexes each page", async () => {
    const calls: string[] = [];
    const provider = {
      configureIndex: vi.fn(async () => { calls.push("configure"); }),
      deleteAll: vi.fn(async () => { calls.push("clear"); }),
      index: vi.fn(async (docs: readonly SearchDocument[]) => { calls.push(`index:${docs.map((d) => d.id).join(",")}`); }),
    } as unknown as SearchProvider;
    const count = await runIndexInPages(provider, async (onDocs) => {
      await onDocs([doc("a"), doc("b")]);
      await onDocs([]);
      await onDocs([doc("c")]);
    });
    expect(calls).toEqual(["configure", "clear", "index:a,b", "index:c"]);
    expect(count).toBe(3);
  });
});
