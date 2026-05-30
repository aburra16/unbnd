// Provider-neutral trust types (ADR 0014). Callers (the ratings route) depend
// only on this surface. All Brainstorm/NIP-85 specifics live in the adapter
// (trust/brainstorm.ts) — a guard test enforces it, so the scoring source is
// swappable.

export type TrustProviderName = "brainstorm";

export type TrustOptions = {
  readonly provider: TrustProviderName;
  /** Brainstorm-style API base that resolves an observer's score source. */
  readonly apiUrl: string;
  /** Relays to union when reading the score events. */
  readonly relays: readonly string[];
};

export interface TrustProvider {
  readonly name: TrustProviderName;
  /**
   * Trust weights ∈ [0,1] for each target, from the observer's vantage.
   * Targets the observer doesn't trust are simply absent from the map.
   * Best-effort: a backend failure resolves to an empty map (caller degrades
   * to the raw view), never throws.
   */
  weights(
    observerHex: string,
    targetHexes: readonly string[],
  ): Promise<Map<string, number>>;
}
