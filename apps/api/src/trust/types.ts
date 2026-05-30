// Provider-neutral trust types (ADR 0014). Callers (the ratings route) depend
// only on this surface. All Brainstorm/NIP-85 specifics live in the adapter
// (trust/brainstorm.ts) — a guard test enforces it, so the scoring source is
// swappable.
import type { SignedNostrEvent } from "@unbnd/schemas";

export type TrustProviderName = "brainstorm" | "fixture";

/**
 * Deterministic spec for the fixture provider (ADR 0017). No network, time, or
 * randomness — the same spec always yields the same trust results, so trust-
 * consuming features can be built and verified in CI without Brainstorm or a
 * relay. Also drives the "fixture mode" of the staging seed harness.
 */
export type FixtureSpec = {
  /** observerHex → (targetHex → weight in (0,1]). Absent target = not trusted. */
  readonly weights: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Observers `hasScores()` reports true for. Default: observers with weights. */
  readonly scoredObservers?: readonly string[];
  /** Canned `authChallenge()` value; null = none. undefined = deterministic default. */
  readonly challenge?: string | null;
  /** Result of `personalize()`. Default true. */
  readonly personalizeOk?: boolean;
};

export type TrustOptions =
  | {
      readonly provider: "brainstorm";
      /** Brainstorm-style API base that resolves an observer's score source. */
      readonly apiUrl: string;
      /** Relays to union when reading the score events. */
      readonly relays: readonly string[];
    }
  | {
      readonly provider: "fixture";
      readonly fixture: FixtureSpec;
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
