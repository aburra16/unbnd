import type { Config } from "../config";
import type {
  ProviderHealth,
  ProviderName,
  SearchProvider,
} from "./SearchProvider";

export class MeiliProvider implements SearchProvider {
  readonly name: ProviderName = "meili";
  readonly #config: Config;
  readonly #fetch: typeof fetch;

  constructor(config: Config, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const res = await this.#fetch(`${this.#config.searchUrl}/health`, {
        headers: {
          Authorization: `Bearer ${this.#config.searchApiKey}`,
        },
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return {
          ok: false,
          provider: this.name,
          error: `meili: status ${res.status}`,
          latencyMs,
        };
      }
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
      };
      return {
        ok: true,
        provider: this.name,
        version: body.status,
        latencyMs,
      };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      };
    }
  }
}
