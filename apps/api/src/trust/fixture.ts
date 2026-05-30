// Deterministic fixture trust provider (ADR 0017). Implements the neutral
// TrustProvider from a plain spec — no network, time, or randomness — so every
// trust-consuming feature can be built and verified in CI with known weights,
// and so staging can reproduce a House↔Yours divergence on demand. Knows
// nothing about any backend, so the ADR 0014 architecture guard ignores it.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { FixtureSpec, TrustProvider, TrustProviderName } from "./types";

export class FixtureTrustProvider implements TrustProvider {
  readonly name: TrustProviderName = "fixture";
  readonly #weights: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly #scored: Set<string>;
  readonly #challenge: string | null | undefined;
  readonly #personalizeOk: boolean;

  constructor(spec: FixtureSpec) {
    this.#weights = spec.weights ?? {};
    const seeded =
      spec.scoredObservers ??
      Object.keys(this.#weights).filter(
        (o) => Object.keys(this.#weights[o] ?? {}).length > 0,
      );
    this.#scored = new Set(seeded);
    this.#challenge = spec.challenge;
    this.#personalizeOk = spec.personalizeOk ?? true;
  }

  // Return the configured weight for each requested target the observer trusts.
  // Untrusted/unknown targets are absent (matching the Brainstorm semantics);
  // values are clamped to (0,1].
  async weights(
    observerHex: string,
    targetHexes: readonly string[],
  ): Promise<Map<string, number>> {
    const row = this.#weights[observerHex] ?? {};
    const out = new Map<string, number>();
    for (const target of targetHexes) {
      const w = row[target];
      if (typeof w === "number" && w > 0) {
        out.set(target, Math.min(1, w));
      }
    }
    return out;
  }

  async hasScores(observerHex: string): Promise<boolean> {
    return this.#scored.has(observerHex);
  }

  async authChallenge(observerHex: string): Promise<string | null> {
    return this.#challenge !== undefined
      ? this.#challenge
      : `fixture-challenge:${observerHex}`;
  }

  async personalize(
    observerHex: string,
    _signedChallenge: SignedNostrEvent,
  ): Promise<boolean> {
    if (!this.#personalizeOk) return false;
    // A real run leaves the observer with scores afterward; mirror that.
    this.#scored.add(observerHex);
    return true;
  }
}
