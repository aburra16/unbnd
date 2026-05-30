// Failing tests (red) for Story 21 — the paginating author-scoped read.
// Mirrors apps/indexer/test/relay.test.ts (the proven queryAllPages pattern this
// ADR says to mirror) but targets the NEW exports in apps/api/src/nostr/query.ts:
// `queryAllPages(fetchPage, opts?)` and `queryEventsPaged(config, filter)`, both
// returning `PagedResult = { events, capped }`. Neither exists yet, so every test
// here fails at import / undefined-export — the intended red.
//
// ADR 0021 Decision 1: until-cursor on created_at, page size 500, dedup by id
// across the boundary second, stop on short page / no-new-events plateau, bounded
// at MAX_PAGES = 20 (→ capped:true at 10,000 with a still-full last page), per-page
// 8s / overall 25s budget that THROWS if the wall-clock budget is exhausted.
// `fetchPage` and `now` are injected so NO test touches a real relay.
import { describe, expect, it, vi } from "vitest";
import { queryAllPages, queryEventsPaged } from "../../src/nostr/query";
import type { Config } from "../../src/config";
import type { SignedNostrEvent } from "@unbnd/schemas";

function ev(id: string, created_at: number): SignedNostrEvent {
  return {
    id,
    created_at,
    kind: 39999,
    pubkey: "p",
    sig: "s",
    tags: [],
    content: "",
  } as SignedNostrEvent;
}

const PAGE = 500;

describe("queryAllPages — paging + dedup (AC-1, AC-3)", () => {
  it("pages backwards by until until a short page, deduping by id, capped:false", async () => {
    // 1200 events across pages of 500/500/200, created_at descending.
    const all = Array.from({ length: 1200 }, (_, i) => ev(`e${i}`, 100000 - i));
    const fetchPage = vi.fn(
      async ({ until, limit }: { until?: number; limit: number }) => {
        const pool = until == null ? all : all.filter((e) => e.created_at <= until);
        return pool.slice(0, limit);
      },
    );
    const out = await queryAllPages(fetchPage);
    expect(out.events).toHaveLength(1200);
    expect(new Set(out.events.map((e) => e.id)).size).toBe(1200);
    expect(out.capped).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3); // 500, 500, 200(short → stop)
  });

  it("dedups an event repeated across the boundary created_at second (counted once) (AC-3)", async () => {
    // The boundary second (created_at = 9500) holds events that reappear on the
    // next page when `until` overlaps it. Each must be counted exactly once.
    const pageA = [
      ...Array.from({ length: 498 }, (_, i) => ev(`a${i}`, 10000 - i)),
      ev("boundary-1", 9500),
      ev("boundary-2", 9500),
    ]; // 500 long → continue, oldest = 9500
    const pageB = [
      ev("boundary-1", 9500), // repeated from pageA at the boundary second
      ev("boundary-2", 9500), // repeated
      ev("c0", 9499),
    ]; // short page → stop
    const fetchPage = vi.fn(async ({ until }: { until?: number; limit: number }) =>
      until == null ? pageA : pageB,
    );
    const out = await queryAllPages(fetchPage);
    const ids = out.events.map((e) => e.id);
    expect(ids.filter((id) => id === "boundary-1")).toHaveLength(1);
    expect(ids.filter((id) => id === "boundary-2")).toHaveLength(1);
    expect(out.events).toHaveLength(501); // 500 from pageA + the one new c0
    expect(new Set(ids).size).toBe(501);
  });

  it("advances the until cursor to the oldest created_at of the page", async () => {
    const all = Array.from({ length: 800 }, (_, i) => ev(`e${i}`, 100000 - i));
    const seen: (number | undefined)[] = [];
    const fetchPage = vi.fn(
      async ({ until, limit }: { until?: number; limit: number }) => {
        seen.push(until);
        const pool = until == null ? all : all.filter((e) => e.created_at <= until);
        return pool.slice(0, limit);
      },
    );
    await queryAllPages(fetchPage);
    expect(seen[0]).toBeUndefined();
    // page 1 oldest created_at = 100000 - 499 = 99501
    expect(seen[1]).toBe(99501);
  });
});

describe("queryAllPages — stop conditions", () => {
  it("stops on a short first page (capped:false)", async () => {
    const fetchPage = vi.fn(async () => [ev("a", 5), ev("b", 4)]);
    const out = await queryAllPages(fetchPage);
    expect(out.events).toHaveLength(2);
    expect(out.capped).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops when a full page yields only duplicates (boundary plateau)", async () => {
    const page = Array.from({ length: 3 }, () => ev("same", 7));
    const fetchPage = vi.fn(async () => page);
    const out = await queryAllPages(fetchPage, { pageSize: 3 });
    expect(out.events).toHaveLength(1);
    expect(out.capped).toBe(false);
    // page 1 adds the single unique id; page 2 is all dupes (added===0) → stop.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe("queryAllPages — MAX_PAGES guard (AC-6)", () => {
  it("stops at MAX_PAGES with a still-full last page and reports capped:true", async () => {
    // Every page is full and all-new → only the bound can stop the walk.
    let n = 0;
    const fetchPage = vi.fn(
      async ({ limit }: { until?: number; limit: number }) =>
        Array.from({ length: limit }, () => ev(`x${n++}`, 100000 - n)),
    );
    const out = await queryAllPages(fetchPage, { pageSize: PAGE, maxPages: 20 });
    expect(fetchPage).toHaveBeenCalledTimes(20);
    expect(out.capped).toBe(true);
    expect(out.events).toHaveLength(20 * PAGE); // 10,000 floor
  });

  it("reaching the bound on a short final page is exact (capped:false), not capped", async () => {
    // 9 full pages then a short page on the 10th, with maxPages = 10: exhausted
    // exactly at the bound, so the bound did not truncate → capped is false.
    let n = 0;
    const fetchPage = vi.fn(
      async ({ limit }: { until?: number; limit: number }) => {
        const call = fetchPage.mock.calls.length; // 1-based after this returns
        if (call < 10) return Array.from({ length: limit }, () => ev(`y${n++}`, 100000 - n));
        return Array.from({ length: 10 }, () => ev(`y${n++}`, 100000 - n)); // short
      },
    );
    const out = await queryAllPages(fetchPage, { pageSize: PAGE, maxPages: 10 });
    expect(out.capped).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(10);
  });
});

describe("queryAllPages — overall budget throws (Timeout → omit)", () => {
  it("THROWS when the total wall-clock budget is exhausted mid-walk (never a partial)", async () => {
    // now() jumps past TOTAL_BUDGET_MS after the first page; the walk must throw
    // rather than return a truncated result as if exact.
    let clock = 0;
    const now = () => clock;
    const fetchPage = vi.fn(
      async ({ limit }: { until?: number; limit: number }) => {
        clock += 30_000; // each page "takes" 30s of wall-clock
        return Array.from({ length: limit }, (_, i) => ev(`z${clock}-${i}`, 100000 - clock - i));
      },
    );
    await expect(
      queryAllPages(fetchPage, { pageSize: PAGE, totalBudgetMs: 25_000, now }),
    ).rejects.toThrow();
  });
});

describe("queryEventsPaged — wires queryAllPages to the relay read", () => {
  const cfg = { strfryUrl: "ws://x", librarianPubkey: "1".repeat(64) } as unknown as Config;

  it("returns a PagedResult shape ({ events, capped }) for an author-scoped filter", async () => {
    // No relay is reachable at ws://x, so a real read collects nothing and the
    // walk exhausts on a short (empty) first page. The shape contract is what we
    // assert here: a PagedResult, not a bare array.
    const out = await queryEventsPaged(cfg, {
      kinds: [39999],
      authors: ["a".repeat(64)],
    });
    expect(Array.isArray(out.events)).toBe(true);
    expect(typeof out.capped).toBe("boolean");
  });
});
