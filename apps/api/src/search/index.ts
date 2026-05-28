import type { Config } from "../config";
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
export function resolveProvider(_config: Config): SearchProvider {
  throw new Error("resolveProvider not implemented");
}
