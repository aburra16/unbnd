// @unbnd trust — provider-agnostic trust-weighting (ADR 0014). Consumers depend
// only on TrustProvider + the neutral types; backend specifics live in a single
// adapter (brainstorm.ts today), so the scoring source is swappable.
import { BrainstormProvider } from "./brainstorm";
import type { TrustOptions, TrustProvider } from "./types";

export { BrainstormProvider } from "./brainstorm";
export type { TrustOptions, TrustProvider, TrustProviderName } from "./types";

export function resolveTrustProvider(opts: TrustOptions): TrustProvider {
  switch (opts.provider) {
    case "brainstorm":
      return new BrainstormProvider({ apiUrl: opts.apiUrl, relays: opts.relays });
    default: {
      const exhaustive: never = opts.provider;
      throw new Error(`resolveTrustProvider: unknown provider ${JSON.stringify(exhaustive)}`);
    }
  }
}
