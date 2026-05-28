import type { Config } from "../config";
import { MeiliProvider } from "./meili";
import type { SearchProvider } from "./SearchProvider";

export { MeiliProvider } from "./meili";
export type {
  ProviderHealth,
  ProviderName,
  SearchProvider,
} from "./SearchProvider";

/**
 * Picks the search provider implementation based on `config.searchProvider`.
 * Throws on unknown values so misconfiguration is caught at startup.
 */
export function resolveProvider(config: Config): SearchProvider {
  switch (config.searchProvider) {
    case "meili":
      return new MeiliProvider(config);
    case "vespa":
      throw new Error(
        "resolveProvider: vespa provider is not yet implemented; ships with the search-wiring story",
      );
    default: {
      const exhaustive: never = config.searchProvider;
      throw new Error(
        `resolveProvider: unknown SEARCH_PROVIDER ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
