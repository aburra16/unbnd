// Search provider interface per ADR 0002.
// Cycle 2 ships only `health()`. The full `index` / `search` / `delete`
// methods land with the search-wiring story.

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
  health(): Promise<ProviderHealth>;
}
