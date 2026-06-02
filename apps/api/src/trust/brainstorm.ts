// Re-export shim (ADR 0036 A2). `BrainstormProvider` moved to `@unbnd/trust`;
// callers importing the deep `../trust/brainstorm` path resolve here.
export { BrainstormProvider } from "@unbnd/trust";
