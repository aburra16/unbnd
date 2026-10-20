// @unbnd trust — provider-agnostic trust-weighting (ADR 0014). Consumers depend
// only on TrustProvider + the neutral types; backend specifics live in a single
// adapter (brainstorm.ts today), so the scoring source is swappable.
import { BrainstormProvider } from "./brainstorm";
import { FixtureTrustProvider } from "./fixture";
import type { TrustOptions, TrustProvider } from "./types";

export { BrainstormProvider } from "./brainstorm";
export { BRAINSTORM_DEFAULTS } from "./defaults";
export { FixtureTrustProvider } from "./fixture";
export type {
  FixtureSpec,
  NostrEventTemplate,
  TrustOptions,
  TrustProvider,
  TrustProviderName,
} from "./types";

// Shared trust-weighting helpers (ADR 0036 A1) — one implementation, reused by
// the apps/api routes (via the re-export shim) and the off-path workers.
export { dedupeRatings, weightedRatings } from "./ratings";
// STUB (red): Story 99.
export const REVIEW_WEIGHT_LINE = 0 as number;
export function standingReviews(_e: unknown[], _o: { librarian: string; now: number }): Array<Record<string, unknown>> { throw new Error("stub"); }
export type { ParsedRating, PublicRating, WeightedRatings } from "./ratings";

// Story 65 / ADR 0064 — observer-relative taste-match metric (raw agreement v1).
export { computeTasteMatch } from "./taste-match";
export type { TasteMatch } from "./taste-match";

export function resolveTrustProvider(opts: TrustOptions): TrustProvider {
  switch (opts.provider) {
    case "brainstorm":
      return new BrainstormProvider({ apiUrl: opts.apiUrl, relays: opts.relays });
    case "fixture":
      return new FixtureTrustProvider(opts.fixture);
    default: {
      const exhaustive: never = opts;
      throw new Error(`resolveTrustProvider: unknown provider ${JSON.stringify(exhaustive)}`);
    }
  }
}
