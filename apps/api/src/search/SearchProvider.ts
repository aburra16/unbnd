// Search provider interface (ADR 0002 + 0013). Provider-neutral: callers
// (indexer, routes) depend ONLY on this interface and the neutral domain types
// in ./types. All backend specifics (Meili, later Vespa) live inside the
// concrete adapter, so swapping providers is a one-file + one-env-var change.
import type { SearchDocument, SearchQuery, SearchResult } from "./types";

export type ProviderName = "meili" | "vespa";

export type ProviderHealth = {
  readonly ok: boolean;
  readonly provider: ProviderName;
  readonly version?: string;
  readonly error?: string;
  readonly latencyMs?: number;
};

export interface SearchProvider {
  readonly name: ProviderName;
  /** Liveness/version probe. */
  health(): Promise<ProviderHealth>;
  /** Apply index settings (searchable order/weights, filterable attrs, etc.). */
  configureIndex(): Promise<void>;
  /** Upsert documents by id. Idempotent. */
  index(docs: readonly SearchDocument[]): Promise<void>;
  /** Drop all documents (for a clean re-index). */
  deleteAll(): Promise<void>;
  /** Full-text query → provider-neutral results. */
  search(query: SearchQuery): Promise<SearchResult>;
}
