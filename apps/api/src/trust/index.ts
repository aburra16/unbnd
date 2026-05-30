// @unbnd trust — provider-agnostic trust-weighting (ADR 0014). Consumers depend
// only on TrustProvider + the neutral types; backend specifics live in a single
// adapter (brainstorm.ts today), so the scoring source is swappable.
import { BrainstormProvider } from "./brainstorm";
import { FixtureTrustProvider } from "./fixture";
import type { TrustOptions, TrustProvider } from "./types";

export { BrainstormProvider } from "./brainstorm";
export { FixtureTrustProvider } from "./fixture";
export type {
  FixtureSpec,
  TrustOptions,
  TrustProvider,
  TrustProviderName,
} from "./types";

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
