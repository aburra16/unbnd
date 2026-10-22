// Provider-neutral search domain types (ADR 0013, ADR 0100). The search relay
// is the one provider; the interface stays so another could be added behind it
// without touching the API.

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
  /** True when the provider stopped at its window and more matches may exist (ADR 0095 §2). */
  readonly capped?: boolean;
};

export type ProviderName = "nip50";

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
  /** Full-text query → provider-neutral results. */
  search(query: SearchQuery): Promise<SearchResult>;
}
