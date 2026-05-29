// @unbnd/search — provider-agnostic catalog search (ADR 0013). Consumers (the
// API, the indexer) depend only on this package's neutral surface. Backend
// specifics live in a single adapter file (meili.ts today, vespa.ts later);
// swapping providers is implementing one adapter + flipping ProviderOptions.
import { MeiliProvider } from "./meili";
import type { ProviderOptions, SearchProvider } from "./types";

export { MeiliProvider } from "./meili";
export type {
  ProviderHealth,
  ProviderName,
  ProviderOptions,
  SearchDocument,
  SearchFilters,
  SearchHit,
  SearchProvider,
  SearchQuery,
  SearchResult,
} from "./types";

/**
 * Pick the provider implementation from neutral options. Throws on an unknown
 * or not-yet-implemented provider so misconfiguration fails fast at startup.
 */
export function resolveProvider(opts: ProviderOptions): SearchProvider {
  switch (opts.provider) {
    case "meili":
      return new MeiliProvider(opts);
    case "vespa":
      throw new Error(
        "resolveProvider: vespa provider is not yet implemented; add src/vespa.ts",
      );
    default: {
      const exhaustive: never = opts.provider;
      throw new Error(`resolveProvider: unknown provider ${JSON.stringify(exhaustive)}`);
    }
  }
}
