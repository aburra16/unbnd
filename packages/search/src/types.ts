// Provider-neutral search domain types (ADR 0013). NOTHING here (or anywhere
// outside a provider adapter) may reference Meili/Vespa specifics — that's what
// keeps the provider swap a one-adapter change. Enforced by the architecture
// guard test.

/** A book as loaded into the search index. `id` is the book slug. */
export type SearchDocument = {
  readonly id: string;
  readonly title: string;
  readonly authorName: string;
  readonly isbn13?: string;
  readonly subjects: readonly string[];
  /** Applied community tag NAMES (non-accusatory), e.g. "Literary fiction". */
  readonly tags: readonly string[];
  /** Applied genre slugs, for filtering. */
  readonly genreSlugs: readonly string[];
  readonly blurb?: string;
  readonly format: string;
  readonly language?: string;
  readonly publishYear?: number;
  readonly coverUrl?: string;
  readonly openLibraryId?: string;
};

export type SearchFilters = {
  readonly genre?: string;
  readonly format?: string;
  readonly language?: string;
};

export type SearchQuery = {
  readonly q: string;
  readonly limit: number;
  readonly offset: number;
  readonly filters?: SearchFilters;
};

/** One hit — PublicBook-shaped display fields plus an optional relevance score. */
export type SearchHit = {
  readonly slug: string;
  readonly title: string;
  readonly authorName: string;
  readonly blurb?: string;
  readonly coverUrl?: string;
  readonly publishYear?: number;
  readonly isbn13?: string;
  readonly format: string;
  readonly score?: number;
};

export type SearchResult = {
  readonly hits: readonly SearchHit[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
};

export type ProviderName = "meili" | "vespa";

export type ProviderHealth = {
  readonly ok: boolean;
  readonly provider: ProviderName;
  readonly version?: string;
  readonly error?: string;
  readonly latencyMs?: number;
};

/** Connection options for any provider. Deliberately minimal + neutral. */
export type ProviderOptions = {
  readonly provider: ProviderName;
  readonly url: string;
  readonly apiKey: string;
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
