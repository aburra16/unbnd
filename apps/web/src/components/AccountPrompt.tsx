// The shared write-gate account prompt (Story 73 / ADR 0071). One component,
// keyed by an `action`, renders a consistent "Create a free account to <phrase>."
// line + a "Create account" CTA to /auth. Every write control's signed-out
// branch uses this — it is the single, on-message gate at the write (never on
// read, never an interstitial).
//
// STUB (Test Design phase): signature is final; the body is a placeholder so the
// red tests compile and fail on assertions. Real markup lands in Implementation.

/** The write action a signed-out visitor was trying to take. */
export type AccountAction = "rate" | "save" | "follow" | "vouch" | "tag" | "submit";

export function AccountPrompt(_props: { action: AccountAction; className?: string }) {
  // STUB.
  return null;
}
