// Re-export shim (ADR 0036 A2). `FixtureTrustProvider` moved to `@unbnd/trust`;
// callers (and tests) importing the deep `../trust/fixture` path resolve here.
export { FixtureTrustProvider } from "@unbnd/trust";
