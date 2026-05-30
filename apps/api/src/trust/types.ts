// Provider-neutral trust types (ADR 0014). Callers (the ratings route) depend
// only on this surface. All Brainstorm/NIP-85 specifics live in the adapter
// (trust/brainstorm.ts) — a guard test enforces it, so the scoring source is
// swappable.
import type { SignedNostrEvent } from "@unbnd/schemas";

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
  /** Whether the observer already has published trust scores. */
  hasScores(observerHex: string): Promise<boolean>;
  /**
   * Fetch an auth challenge for the observer to sign (NIP-98-style), so they
   * can self-trigger a personalization run. null if the backend can't issue one.
   */
  authChallenge(observerHex: string): Promise<string | null>;
  /**
   * Verify the observer's signed challenge and trigger a personalization run.
   * Returns true when the run was queued. Best-effort; never throws.
   */
  personalize(
    observerHex: string,
    signedChallenge: SignedNostrEvent,
  ): Promise<boolean>;
}
