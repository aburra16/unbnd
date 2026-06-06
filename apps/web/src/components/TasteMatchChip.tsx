// Story 65 / ADR 0064 — STUB (red). The real chip renders a neutral @unbnd/ui
// Pill with the taste-match percentage and the count of books in common, an
// honest "Not enough overlap yet" below the threshold, a loading skeleton while
// fetching, and NOTHING when signed out or when viewing your own profile.
export function TasteMatchChip(_props: { target: string }) {
  return <span data-testid="taste-match-stub">taste-match-stub</span>;
}
