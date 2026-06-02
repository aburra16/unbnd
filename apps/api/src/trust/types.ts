// Re-export shim (ADR 0036 A2). The trust types moved to `@unbnd/trust`; callers
// importing the deep `../trust/types` path resolve here.
export type {
  FixtureSpec,
  NostrEventTemplate,
  TrustOptions,
  TrustProvider,
  TrustProviderName,
} from "@unbnd/trust";
