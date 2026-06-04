// Failing tests for Story 55 (catalog expansion), per ADR 0054 §1 "Search-API
// request + paging".
//
// Pins the contract for the search-API pager that replaces fetchSubjectWorks:
// apps/seeder/src/search.ts exporting `fetchSubjectSearch(subject, target, opts)`
// (ADR Implementation notes §277). It pages /search.json with the §1 request
// template (fields=, sort=readinglog, q=subject:<ol> language:eng, limit=100),
// applies the gate INSIDE the collect loop, accumulates post-gate passers
// toward `target`, and stops at `target` or `maxPages`. HTTP is mocked (no live
// network). We assert the request SHAPE and the paging behavior, not live data.
//
// The module does not exist yet; loaded via the opaque specifier (_load.ts) so
// the missing module is an assertion-level red, not a tsc compile wall.
import { describe, expect, it, vi } from "vitest";
import { loadSeederModule } from "./_load";

type OLSearchDoc = {
  readonly key?: string;
  readonly title?: string;
  readonly author_name?: readonly string[];
  readonly edition_count?: number;
  readonly cover_i?: number | null;
  readonly first_publish_year?: number;
  readonly language?: readonly string[];
  readonly number_of_pages_median?: number;
  readonly isbn?: readonly string[];
  readonly subject?: readonly string[];
};

type FetchSubjectSearchOpts = {
  readonly maxPages?: number;
  readonly pageSize?: number;
  readonly pageDelayMs?: number;
  readonly userAgent?: string;
  readonly currentYear?: number;
  readonly fetchImpl?: typeof fetch;
};

type SearchModule = {
  fetchSubjectSearch: (
    subject: string,
    target: number,
    opts?: FetchSubjectSearchOpts,
  ) => Promise<readonly OLSearchDoc[]>;
};

const load = () => loadSeederModule<SearchModule>("search");

const CURRENT_YEAR = 2026;

// A doc that passes every gate signal (ADR §2). Index `n` makes a unique key.
const passDoc = (n: number): OLSearchDoc => ({
  key: `/works/OL${n}W`,
  title: `Valid Book ${n}`,
  author_name: ["A. Author"],
  edition_count: 5,
  cover_i: 1000 + n,
  first_publish_year: 1950,
  language: ["eng"],
  number_of_pages_median: 200,
  isbn: [`97800000000${String(n).padStart(2, "0")}`],
  subject: ["fiction"],
});

// A doc that fails the gate (edition_count below the floor → dropped).
const failDoc = (n: number): OLSearchDoc => ({ ...passDoc(n), edition_count: 1 });

const okJson = (docs: readonly OLSearchDoc[]): Response =>
  ({ ok: true, status: 200, json: async () => ({ docs }) }) as unknown as Response;

describe("fetchSubjectSearch — request shape (ADR §1 template)", () => {
  it("hits search.json with the decided fields, sort, query, and page size", async () => {
    const { fetchSubjectSearch } = await load();
    const fetchImpl = vi.fn(async () =>
      okJson(Array.from({ length: 5 }, (_v, i) => passDoc(i))),
    ) as unknown as typeof fetch;

    await fetchSubjectSearch("science_fiction", 5, {
      fetchImpl,
      pageDelayMs: 0,
      currentYear: CURRENT_YEAR,
    });

    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const url = String(mock.mock.calls[0]![0]);
    expect(url).toContain("/search.json");
    expect(url).toContain("sort=readinglog");
    // The subject + English scoping in the free-text q (URL-encoded).
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("subject:science_fiction");
    expect(decoded).toContain("language:eng");
    // Lean fields= set: the gate signals must be requested.
    for (const f of [
      "key",
      "title",
      "author_name",
      "edition_count",
      "cover_i",
      "first_publish_year",
      "language",
      "number_of_pages_median",
      "isbn",
      "subject",
    ]) {
      expect(decoded).toContain(f);
    }
    // Page size 100 (ADR §1: PAGE_SIZE = 100).
    expect(url).toContain("limit=100");
  });

  it("sends the polite User-Agent header on every request", async () => {
    const { fetchSubjectSearch } = await load();
    const fetchImpl = vi.fn(async () =>
      okJson(Array.from({ length: 3 }, (_v, i) => passDoc(i))),
    ) as unknown as typeof fetch;

    await fetchSubjectSearch("fiction", 3, {
      fetchImpl,
      pageDelayMs: 0,
      userAgent: "unbnd-seeder/test",
      currentYear: CURRENT_YEAR,
    });

    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const init = mock.mock.calls[0]![1] as { headers?: Record<string, string> };
    expect(init?.headers?.["User-Agent"]).toBe("unbnd-seeder/test");
  });
});

describe("fetchSubjectSearch — gate applied inside the collect loop", () => {
  it("returns only post-gate passers (junk docs are dropped before counting toward target)", async () => {
    const { fetchSubjectSearch } = await load();
    // One page: 3 passers, 2 failers. Target 3 → returns the 3 passers only.
    const page = [passDoc(0), failDoc(1), passDoc(2), failDoc(3), passDoc(4)];
    const fetchImpl = vi.fn(async () => okJson(page)) as unknown as typeof fetch;

    const out = await fetchSubjectSearch("fiction", 3, {
      fetchImpl,
      pageDelayMs: 0,
      currentYear: CURRENT_YEAR,
    });

    expect(out).toHaveLength(3);
    expect(out.every((d) => (d.edition_count ?? 0) >= 3)).toBe(true);
  });

  it("pages toward the post-gate target across multiple pages and stops at target", async () => {
    const { fetchSubjectSearch } = await load();
    // Each page yields 2 passers. Target 5 needs 3 pages (2 + 2 + 2 → 6, capped
    // to 5). The pager must request more than one page and stop once 5 kept.
    let page = 0;
    const fetchImpl = vi.fn(async () => {
      const base = page * 2;
      page += 1;
      return okJson([passDoc(base), passDoc(base + 1)]);
    }) as unknown as typeof fetch;

    const out = await fetchSubjectSearch("fiction", 5, {
      fetchImpl,
      pageDelayMs: 0,
      currentYear: CURRENT_YEAR,
    });

    expect(out).toHaveLength(5);
    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("fetchSubjectSearch — MAX_PAGES safety bound", () => {
  it("stops at maxPages even when the target is never reached (pathological low pass-rate)", async () => {
    const { fetchSubjectSearch } = await load();
    // Every page is all-junk → zero passers ever. Without a bound this would
    // page forever; maxPages = 4 must cap it.
    const fetchImpl = vi.fn(async () =>
      okJson([failDoc(0), failDoc(1), failDoc(2)]),
    ) as unknown as typeof fetch;

    const out = await fetchSubjectSearch("fiction", 1250, {
      fetchImpl,
      pageDelayMs: 0,
      maxPages: 4,
      currentYear: CURRENT_YEAR,
    });

    expect(out).toHaveLength(0);
    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
