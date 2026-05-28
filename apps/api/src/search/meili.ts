import type { Config } from "../config";
import type {
  ProviderHealth,
  ProviderName,
  SearchProvider,
} from "./SearchProvider";

export class MeiliProvider implements SearchProvider {
  readonly name: ProviderName = "meili";

  constructor(_config: Config, _fetchImpl: typeof fetch = fetch) {
    throw new Error("MeiliProvider constructor not implemented");
  }

  async health(): Promise<ProviderHealth> {
    throw new Error("MeiliProvider.health not implemented");
  }
}
