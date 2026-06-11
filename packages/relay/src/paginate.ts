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

// STUB (red): real loop in implementation (Story 82).
export async function queryAllPages(
  _fetchPage: (cursor: { until?: number; limit: number }) => Promise<SignedNostrEvent[]>,
  _opts: PaginateOpts,
): Promise<PagedResult> {
  return { events: [], capped: false };
}
