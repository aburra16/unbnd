// FAILING TESTS — Story 82 (the ONE shared relay pager). Pins the loop
// semantics every prior call site relied on: until-cursor walk, id-dedup at
// the boundary second, short-page + plateau stops, the maxPages bound with an
// honest `capped` (true only on a still-full bounded stop), and the
// wall-clock budget that THROWS rather than returning a partial as if exact.
import { describe, expect, it } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { queryAllPages } from "../src/paginate";

function ev(id: string, createdAt: number): SignedNostrEvent {
  return { id, created_at: createdAt, kind: 1, pubkey: "p", sig: "s", content: "", tags: [] } as unknown as SignedNostrEvent;
}

const UNBOUNDED = { pageSize: 2, maxPages: Infinity, totalBudgetMs: Infinity };

describe("queryAllPages — the shared pager (Story 82)", () => {
  it("walks pages with the until cursor and stops on a short page", async () => {
    const pages = [
      [ev("a", 30), ev("b", 20)],
      [ev("c", 10)], // short → exhausted
    ];
    const cursors: Array<number | undefined> = [];
    const out = await queryAllPages(async ({ until }) => {
      cursors.push(until);
      return pages.shift() ?? [];
    }, UNBOUNDED);
    expect(out.events.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
    expect(out.capped).toBe(false);
    // First page uncursored; second page from the oldest seen created_at.
    expect(cursors).toEqual([undefined, 20]);
  });

  it("dedups by id across the boundary second and stops on a no-new-events plateau", async () => {
    const page = [ev("a", 20), ev("b", 20)];
    let calls = 0;
    const out = await queryAllPages(async () => {
      calls++;
      return page; // a full page that never advances → plateau after dedup
    }, UNBOUNDED);
    expect(out.events).toHaveLength(2);
    expect(calls).toBe(2); // first page adds, second adds 0 → stop
    expect(out.capped).toBe(false);
  });

  it("maxPages stops a still-full walk with capped: true; a short final page at the bound is exact (capped: false)", async () => {
    const full = (n: number) => [ev(`x${n}`, 100 - n), ev(`y${n}`, 90 - n)];
    let n = 0;
    const bounded = await queryAllPages(async () => full(++n), {
      pageSize: 2,
      maxPages: 3,
      totalBudgetMs: Infinity,
    });
    expect(bounded.capped).toBe(true);
    expect(bounded.events).toHaveLength(6);

    const pages = [[ev("a", 30), ev("b", 20)], [ev("c", 10)]];
    const exact = await queryAllPages(async () => pages.shift() ?? [], {
      pageSize: 2,
      maxPages: 2,
      totalBudgetMs: Infinity,
    });
    expect(exact.capped).toBe(false);
  });

  it("the wall-clock budget THROWS when exhausted (never a silent partial)", async () => {
    let t = 0;
    const full = (n: number) => [ev(`x${n}`, 1000 - n), ev(`y${n}`, 900 - n)];
    let n = 0;
    await expect(
      queryAllPages(async () => full(++n), {
        pageSize: 2,
        maxPages: Infinity,
        totalBudgetMs: 50,
        now: () => (t += 40), // 40, 80 → over budget on the second check
      }),
    ).rejects.toThrow(/budget/i);
  });
});
