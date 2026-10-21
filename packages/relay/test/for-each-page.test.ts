// FAILING TESTS — Story 108 / ADR 0096 §1: a pager that hands each page on and
// keeps only the ids it has seen.
import { describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { forEachPage } from "../src";

const ev = (id: string, at: number) => ({ id, created_at: at, kind: 1, pubkey: "p", tags: [], content: "", sig: "s" }) as SignedNostrEvent;

describe("forEachPage", () => {
  it("walks backwards by created_at and hands each page's new events on", async () => {
    const all = [ev("a", 50), ev("b", 40), ev("c", 40), ev("d", 30), ev("e", 20)];
    const fetchPage = vi.fn(async ({ until, limit }: { until?: number; limit: number }) =>
      all.filter((e) => until === undefined || e.created_at <= until).slice(0, limit),
    );
    const pages: string[][] = [];
    const out = await forEachPage(fetchPage, async (events) => { pages.push(events.map((e) => e.id)); }, {
      pageSize: 3, maxPages: Infinity, totalBudgetMs: Infinity,
    });
    // Page two starts at the boundary second, so b and c come back and are skipped.
    expect(pages).toEqual([["a", "b", "c"], ["d"], ["e"]]);
    expect(out).toEqual({ pages: 3, events: 5, capped: false, stuck: false });
  });

  it("stops on a page with nothing new, and reports a page bound reached", async () => {
    const same = [ev("a", 10), ev("b", 10)];
    const stuck = await forEachPage(async () => same, async () => {}, { pageSize: 2, maxPages: Infinity, totalBudgetMs: Infinity });
    expect(stuck).toMatchObject({ events: 2, capped: false, stuck: true });
    let n = 0;
    const endless = await forEachPage(async () => [ev(`x${n++}`, 100 - n), ev(`y${n++}`, 100 - n)], async () => {}, { pageSize: 2, maxPages: 3, totalBudgetMs: Infinity });
    expect(endless).toMatchObject({ pages: 3, capped: true });
  });
});
