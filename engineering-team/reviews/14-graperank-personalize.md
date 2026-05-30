# Review: Story 14 — GrapeRank trust-weighting ("Personalize")

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** PRs #30 (trust core), #31 (ratings UI), #32 (smoke fix), #33 (Phase B trigger), #34 (PoVBar wiring + caption), #35 (PoVBar redesign + global toggle). CI-green; deployed; operator-confirmed in-browser.

## Quality gates

- [x] `pnpm -r typecheck` — pass (5 workspaces).
- [x] Tests: `@unbnd/api` 244 (trust unit + route + repo-wide architecture guard), `@unbnd/web` 53 (useTrustView, RatingsPanel, PoVBar). Builds clean.
- [x] CI green on each merge; staging deploys green.

## AC status

- [x] **AC-1** `TrustProvider.weights(observer, targets) → Map<hex,0..1>` via `/setup`→service key → kind-30382 `rank`/100 across both nip85 relays (union). Verified live.
- [x] **AC-2** `GET /api/books/:slug/ratings?observer=` → raw **+** weighted (weighted mean, trustedCount, trust-ordered reviews). RatingsPanel renders House (default) / Yours with a clear caption.
- [x] **AC-3 (headline)** All trust code depends on the neutral `TrustProvider`; a repo-wide **architecture guard** fails CI if Brainstorm API specifics (`/setup/`, `/authChallenge`, `/user/graperank`, `30382`) appear outside `trust/brainstorm.ts`. Swap = new adapter.
- [x] **AC-3 (PoVBar)** Three states wired: house-only (signed-out/custodial), Personalize (sovereign, no scores), personalized + **House⇄Yours toggle** (persisted across pages via localStorage).
- [x] **AC-4 (Phase B)** In-app **self-serve** trigger — NIP-07 signs the Brainstorm challenge → `POST /user/graperank` → "building ~5 min" → poll until scores → personalized. No redirect, no whitelist. Verified the chain live with a throwaway key.
- [x] **AC-5** No fake numbers — weighting only when real scores exist; otherwise raw, clearly labelled. Custodial/signed-out unaffected.
- [x] **AC-6** Resilient — Brainstorm/relay failure degrades to raw, never an error wall.
- [x] **AC-7** Operator-confirmed: scores resolve, "personalized" shows on login, toggle works.

## Crypto / safety
- No new signing in our code; the user signs the Brainstorm challenge with their own NIP-07 key. Reads are public. npub for display.

## Decisions & deviations (recorded)
- **House observer = nosfabrica** (94,807-pubkey set) as a stand-in; a real librarian house observer is deferred.
- **v1 weights ratings only** (genre/tag consensus stays raw — nosfabrica weight-0's our seeded librarian).
- **House raw-fallback** (vs strict "show none") — deliberate softening flagged for operator; flip is one line. Open product call once real data exists.
- **Data caveat:** nosfabrica trusts ~none of current test raters, so the weighted view is mostly raw-fallback until trust-connected people rate.

## Carry-forward
- Custodial personalization (needs a follow graph); real librarian house observer; tag/genre trust-weighting + the sensitive-tag **role** gate; trust-weighted search ranking / homepage trust shelves; admin trigger for arbitrary pubkeys.

## Verdict
**PASS** — the "weighted by people you trust" pillar is live end-to-end on a provider-swappable seam (Meili→Vespa-style), verified in-browser. Visible impact scales with real ratings from trust-connected users; the mechanism is complete. Story marked Done.
