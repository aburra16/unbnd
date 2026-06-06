# Review: Story 66 — Taste Match on book detail, and taste-sorted raters

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-06
**Diff:** `git diff main...HEAD` (commit `e0335ce`)
**Story:** `engineering-team/stories/done/66-taste-match-book-detail.md`
**Test plan:** `engineering-team/stories/done/66-taste-match-book-detail.test-plan.md`

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` — **pass** (exit 0, 12 packages).
- [x] `pnpm -r test` — **pass** (exit 0; `@unbnd/api` 888/10 skipped, `@unbnd/web` 332, `@unbnd/trust` 33, `@unbnd/ui` 20 guards green).
- [x] `pnpm --filter @unbnd/web build` — **pass** (~0.6s). The `@unbnd/ui` color-literal guard is green with the two new token-only CSS rules.

## Spec adherence
- [x] Every acceptance criterion has a passing test. AC-1 (byline match): route `per-rater match keyed by npub`, web `RatedByRow shows a chip only on raters that clear the threshold`. AC-2 (sort): `sortRatingsByTasteMatch` unit + RatingsPanel control present + `onSortChange('match')`. AC-3 (default trusted): the control defaults to `sortBy:"trusted"` and the helper preserves trust order for unmatched. AC-4 (below threshold → no chip): exactly one chip when one of two raters qualifies; route `thresholdMet:false`. AC-5 (hidden signed-out): route `{signedIn:false}` + RatingsPanel hides the control with no `tasteMatches`.
- [x] No criterion dropped. Self-exclusion, batched-read shape, configurable min, and best-effort degrade covered beyond the ACs.

## ADR adherence (0065)
- [x] Matches the chosen design exactly: `scoresByAuthor` in `ratings/summary.ts`, the new `book-taste-matches.ts` route doing **two bounded reads** (raters via `#a`, then ONE batched author-scoped read over `[viewer, ...raters]`), in-memory `scoresByAuthor` + reused `computeTasteMatch` — no N+1. Web: `api.ratings.tasteMatches`, the sort control in `RatingsPanel`, byline chips in `RatedByRow` (+ `ReviewsList`), hook wiring in `useBookRatings`.
- [x] Layering respected; no new dependency; reuses `TASTE_MATCH_MIN_OVERLAP` (no new config).
- [x] Read-time, observer-relative, never cached — POV-first / filter-at-view-time honored. Rater set capped at 500.

## DList integrity
- [x] No new DList shape (read-only over `book-ratings`). Book address + ratings header built from the runtime librarian pubkey (`asHexPubkey(librarian)` / `buildBookRatingsHeaderAddress`), never hardcoded.

## UI integrity
- [x] Brand tokens only: `RatedByRow.css` / `ReviewsList.css` use `var(--u-font-size-11)`, `var(--u-muted)`, `var(--u-space-2)`; no hex. Chips are neutral (informational), not the amber accent. The sort control reuses the `@unbnd/ui` `Button` primitive (`variant="ghost"`, `selected`).
- [x] No icon library, no emoji. Copy ("Most trusted", "Best taste match", "{n}% match") passes the no-slop rules.
- [x] No raw GrapeRank number on the wire — taste match is a rating-agreement percentage, a distinct metric.

## Things tests can't catch
- [x] The viewer is excluded from their own matches (the `seen` set seeds with `viewer.pubkeyHex`). The batched read is bounded (RATER_CAP 500). Best-effort degrade is an inner try/catch → `{ matches:{} }`, never 500.
- [x] The hook fetches taste matches only when signed in (`ownNpub`); signed-out → `null` → chips + control hidden. The fetch is `cancelled`-guarded.
- [x] No secrets, no `console.log`, no commented-out code.
- [x] The sort applies to both `RatedByRow` and `ReviewsList` (one `displayReviews`), so the two byline lists stay consistent.

## House rules check
- [x] PRD scope discipline (no out-of-scope), POV-first, no new tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **Reviewer bylines (`ReviewsList`)** carry the chip beyond what the tests pin — correct per AC-1 ("rater and reviewer bylines"), logged as a Deviation. Optional: add a `ReviewsList` chip test in a later pass.
2. **`use-book-ratings.test.tsx` mock** was extended with the new `api.ratings.tasteMatches` boundary (assertions unchanged) — necessary because the hook gained the dependency, logged as a Deviation. Correct maintenance.
3. **Loading skeleton** deferred (chips/control appear on fetch resolve), consistent with Story #65. Optional follow-up.

## Verdict
**PASS** — the diff matches the story, ADR 0065, and the test plan; all gates clean; no blocking issues. Mergeable as-is.
