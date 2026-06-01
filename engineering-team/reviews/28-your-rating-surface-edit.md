# Review: Story 28 — Your rating: surface the signed-in user's own rating + in-place edit

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-06-01
**Diff:** `git diff main...feat/your-rating-edit`
**Story:** `engineering-team/stories/done/28-your-rating-surface-edit.md` (8 ACs; un-rate OUT → Story 28b; AC-4 calm in-place, no modal)
**ADR:** `engineering-team/decisions/0029-your-rating-surface-edit.md`
**Test plan:** `engineering-team/stories/done/28-your-rating-surface-edit.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 6 projects clean.
- [x] `pnpm -r test` — **PASS.** web 191 passed (38 files); api 564 passed / 10 skipped; schemas 72; search 11; indexer 6; seeder 12. The 22 net-new Story-28 tests + the 4 migrated controlled-contract files + the pre-existing rating tests all green; no regressions. The 10 api skips are pre-existing env-gated integration suites (`db/integration` needs `DATABASE_URL`, `nostr/integration` needs `STRFRY_TEST_URL`) — no Story-28 work hidden.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** tsc + vite, 432 modules.

## Spec adherence (8 ACs)
- [x] **AC-1** own rating surfaced, stars filled to `yourRating.score`, `role="group" aria-label="Your rating"`.
- [x] **AC-2** "You rated this on \<date\>" from `reviewDate`; absent when not rated.
- [x] **AC-3 (honesty, load-bearing)** own rating identical under House⇄Yours — sourced from the raw/own read via the **session** npub (not the trust-view npub), held in a slice separate from the aggregate; no House⇄Yours suppression path exists.
- [x] **AC-4** prefilled control, "Update rating" vs "Submit rating", quiet already-rated line, NO confirm modal (`role="dialog"`/`/overwrite/i` asserted absent).
- [x] **AC-5** edit republishes via existing tier paths under the same addressable d-tag (replaces); no new write path/crypto; un-rate not built.
- [x] **AC-6** optimistic fill → `applyWrite` reconcile on success → rollback + `role="alert"` honest error on failure (no false "saved", no toast).
- [x] **AC-7** sovereign (NIP-07) + custodial (`submitCustodial`) tiers; `reauth_required` → "Please sign in again to update your rating." + rollback.
- [x] **AC-8** signed-out → sign-in prompt, no own-rating zone; aggregate still renders.

## Honesty seam / 500-cap fallback / no-double-fetch
- **Honesty:** `yourRating` resolved server-side from `deduped`/`rawFromParsed` before and independent of `weighted`; client `deriveYourRating` reads `house.yourRating` / scans `house.ratings` by session npub, never `weighted`. Injected-weights test confirms own-rating present even when excluded from `weighted`. No suppression path.
- **500-cap fallback:** bounded one-shot author-scoped query `{kinds:[39999], authors:[ownHex], "#a":[addr]}`; exact filter shape asserted; npub-out/hex-internal preserved.
- **No double-fetch:** `useBookRatings` single owner; both components controlled (self-fetch effects removed); one house fetch per (slug, ownNpub) with cleanup; `yours` guarded by a `fetchedYoursFor` ref; `applyWrite` reconciles from the POST summary with no happy-path refetch.

## The `ratings-vocabulary.test.tsx` migration — FAITHFUL (not weakened)
Diffed against `main`: purely mechanical (removed the `api` self-fetch mock; render with controlled `house`/`yours`/`status` props). The `/trusted consensus/i` and `/community consensus/i` assertions + fixtures preserved verbatim; intent (Story-25 shared vocabulary) intact. Acceptable — a forced migration the Tester's four-file sweep missed; the Implementer corrected it and flagged it transparently.

## Aggregate/model untouched + scope/firewall
No change to `summarizeRatings`/`weightedRatings`/`dedupeRatings`/`rawFromParsed`, the rating model (kind-39999 d-tag), or trust-weighting; `yourRating` is purely additive. No new crypto, no new endpoint, no new icon lib, no new hex/color literals (web src diff scanned). Em-dashes in the diff are code comments only, not UI copy. No business/grant/community content. Un-rate (28b) not built.

## Findings

### Blocking
None.

### Non-blocking
1. **Process (Tester completeness):** the controlled-contract migration missed `apps/web/test/ratings-vocabulary.test.tsx` (a 5th file rendering `<RatingsPanel slug>` with a self-fetch mock); the Implementer corrected it faithfully and flagged it. Retro lesson: enumerate the migration sweep by `grep`, not by hand. No code/test defect.

## Verdict
**APPROVED**
