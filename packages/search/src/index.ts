// @unbnd/search: catalog search (ADR 0013, ADR 0100). Brainstorm's search relay
// is the backend, read through the NIP-50 provider; the API depends only on the
// neutral `SearchProvider` surface. Also home to the applied-tags rule and the
// paged catalog walk, which the labels pass and the workers share.
export { Nip50Provider, SEARCH_WINDOW, type Nip50Filter, type Nip50Options } from "./nip50";
export { appliedTags } from "./applied-tags";
export { forEachCatalogPage, type CatalogQuery } from "./catalog-pages";
export type {
  ProviderHealth,
  ProviderName,
  SearchFilters,
  SearchHit,
  SearchProvider,
  SearchQuery,
  SearchResult,
} from "./types";
