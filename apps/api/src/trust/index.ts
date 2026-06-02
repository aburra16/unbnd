// Re-export shim (ADR 0036 A2). The trust seam now lives in the `@unbnd/trust`
// workspace package — the single source of truth shared with the off-path
// workers (shelves, For-You). apps/api's ~15 internal import sites keep working
// unchanged by re-exporting the package surface here. A later mechanical sweep
// can replace the shim with direct `@unbnd/trust` imports (no behavior change).
export {
  BrainstormProvider,
  FixtureTrustProvider,
  resolveTrustProvider,
} from "@unbnd/trust";
export type {
  FixtureSpec,
  NostrEventTemplate,
  TrustOptions,
  TrustProvider,
  TrustProviderName,
} from "@unbnd/trust";
