// The ONE shared cap-safe relay pager (Story 82; extracted from the three
// per-app copies — apps/api/src/nostr/query.ts carried the superset semantics
// per ADR 0021, apps/indexer and apps/shelves the simple unbounded walk).
// Walks backwards by created_at with an `until` cursor, dedups by id across
// the boundary second, stops on a short page or a no-new-events plateau.
// Callers pass their OWN bounds so every prior call site's behavior is
// reproduced exactly; nothing here bakes in a policy.
import type { SignedNostrEvent } from "@unbnd/schemas";

export type PagedResult = {
  readonly events: SignedNostrEvent[];
  /** True ONLY when the maxPages bound (not exhaustion) stopped a still-full walk. */
  readonly capped: boolean;
};

export type PaginateOpts = {
  readonly pageSize: number;
  /** Page bound; Infinity = unbounded (the simple-walk callers). */
  readonly maxPages: number;
  /** Wall-clock budget; exhaustion THROWS (never a silent partial). Infinity = none. */
  readonly totalBudgetMs: number;
  readonly now?: () => number;
};

export async function queryAllPages(
  fetchPage: (cursor: { until?: number; limit: number }) => Promise<SignedNostrEvent[]>,
  opts: PaginateOpts,
): Promise<PagedResult> {
  const { pageSize, maxPages, totalBudgetMs } = opts;
  const now = opts.now ?? (() => Date.now());

  const start = now();
  const byId = new Map<string, SignedNostrEvent>();
  let until: number | undefined;
  let capped = false;

  for (let pages = 0; pages < maxPages; pages++) {
    const page = await fetchPage({ until, limit: pageSize });

    // Wall-clock budget: exhausted mid-walk THROWS rather than returning a
    // truncated result as if exact (the ADR 0021 omit-on-throw contract).
    if (now() - start > totalBudgetMs) {
      throw new Error("queryAllPages: total budget exhausted");
    }

    let added = 0;
    let oldest = Infinity;
    for (const e of page) {
      if (!byId.has(e.id)) {
        byId.set(e.id, e);
        added++;
      }
      if (e.created_at < oldest) oldest = e.created_at;
    }

    // Short page = exhausted; no new events = boundary plateau. Either way stop.
    if (page.length < pageSize || added === 0) {
      capped = false;
      break;
    }
    // A still-full page at the LAST allowed iteration means the bound (not
    // exhaustion) stopped the walk: the result is a floor, not exact.
    if (pages === maxPages - 1) {
      capped = true;
      break;
    }
    until = oldest; // boundary-second overlap is handled by the id dedup
  }

  return { events: [...byId.values()], capped };
}
