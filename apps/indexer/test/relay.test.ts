import { describe, expect, it, vi } from "vitest";
import { queryAllPages } from "../src/relay";
import type { SignedNostrEvent } from "@unbnd/schemas";

function ev(id: string, created_at: number): SignedNostrEvent {
  return { id, created_at, kind: 39999, pubkey: "p", sig: "s", tags: [], content: "" } as SignedNostrEvent;
}

describe("queryAllPages", () => {
  it("pages backwards by until until a short page, deduping by id", async () => {
    // 1200 events across 3 pages of 500/500/200, created_at descending.
    const all = Array.from({ length: 1200 }, (_, i) => ev(`e${i}`, 100000 - i));
    const fetchPage = vi.fn(async ({ until, limit }: { until?: number; limit: number }) => {
      const pool = until == null ? all : all.filter((e) => e.created_at <= until);
      return pool.slice(0, limit);
    });
    const out = await queryAllPages(fetchPage, 500);
    expect(out).toHaveLength(1200);
    expect(new Set(out.map((e) => e.id)).size).toBe(1200);
    expect(fetchPage).toHaveBeenCalledTimes(3); // 500, 500, 200(short → stop)
  });

  it("stops on a short first page", async () => {
    const fetchPage = vi.fn(async () => [ev("a", 5), ev("b", 4)]);
    const out = await queryAllPages(fetchPage, 500);
    expect(out).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops when a full page yields only duplicates (boundary plateau)", async () => {
    const dupes = Array.from({ length: 3 }, () => ev("same", 7));
    // Always returns the same 3 dupes padded to pageSize with the same id.
    const page = Array.from({ length: 3 }, () => dupes[0]!);
    const fetchPage = vi.fn(async () => page);
    const out = await queryAllPages(fetchPage, 3);
    expect(out).toHaveLength(1);
    // page 1 adds the single unique id; page 2 is all dupes (added===0) → stop.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
