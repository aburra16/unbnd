# Review: Story 65 — Taste Match on curator profiles

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-06
**Diff:** `git diff main...HEAD` (commit `3958af7`)
**Story:** `engineering-team/stories/done/65-taste-match-profiles.md`
**Test plan:** `engineering-team/stories/done/65-taste-match-profiles.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (exit 0, 12 packages).
- [x] `pnpm -r test` — **pass** (exit 0; the new work: `@unbnd/trust` 33, `@unbnd/api` 880/10 skipped, `@unbnd/web` 327). The `[index-on-write] … provider down` / `[kind0-bootstrap] … rejected` stderr lines are pre-existing intentional fail-open assertions, not failures.
- [x] `pnpm --filter @unbnd/web build` — **pass** (built in ~0.65s). Notably the 12 `@unbnd/ui` architecture guards are green with the new `TasteMatchChip.css`, confirming token-only styling and no undefined token refs.

## Spec adherence
- [x] Every acceptance criterion has a passing test. AC-1 (percentage + count): trust `identical → 100%`, api `match when overlap clears the bar`, web `above the threshold`. AC-2 (agreement reflects agreement): trust `closer scores higher`/`off-by-one → 75`/`opposite → 0`/`rounding`. AC-3 (honest below): trust `below minimum`, api `fewer than the minimum`, web `Not enough overlap yet`. AC-4 (hidden signed-out): api `signed out → {signedIn:false}`, web `renders nothing`. AC-5 (reflects overlap): api `4 below / 5th crosses`, trust boundary.
- [x] No criterion silently dropped. Self, configurable min, observer = session, and best-effort degrade are covered beyond the ACs.
- [x] No behavior added beyond the story. The diff is purely additive (no deletions).

## ADR adherence (0064)
- [x] Files match the implementation notes exactly: `packages/trust/src/taste-match.ts` (pure metric, exported from index), `apps/api/src/routes/profile-taste-match.ts` (`GET /api/profile/:id/taste-match`), `index.ts` registration, `TASTE_MATCH_MIN_OVERLAP` config (default 5), `api.profile.tasteMatch` + `TasteMatchResult`, `TasteMatchChip` placed in `Profile.tsx`. `scoreBySlug` added to `ratings/summary.ts` (sibling of `countOwnRatings`) is the natural home for the parse.
- [x] Layering respected: the pure metric is in `@unbnd/trust`, the route in `apps/api`, the chip in `apps/web` consuming only the API client. No cross-layer import.
- [x] No new dependencies.
- [x] Read-time, observer-relative, never cached (mirrors For-You) — matches the chosen Option A and the POV-first / filter-at-view-time invariants.

## DList integrity
- [x] No new DList shape (read-only over `book-ratings`). Read filter is `{ kinds:[39999], "#z":[ratingsZ()], authors:[hex] }` — the established `profile-stats` author-scoped pattern.
- [x] Librarian pubkey resolved at runtime (`deps.config.librarianPubkey` via `ratingsZ()`), never hardcoded.
- [x] Concept address built with `formatAddress(buildBookRatingsHeaderAddress(...))` — stable `kind:pubkey:slug`.

## UI integrity
- [x] Brand tokens only: `TasteMatchChip.css` uses `var(--u-space-3)` and `var(--u-muted)`; no hex. The value chip is the `@unbnd/ui` `Pill` (neutral `variant="genre"`, not the amber accent — correct, it is informational not interactive).
- [x] No icon library, no inline SVG, no emoji.
- [x] Copy passes the no-slop rules: "{n}% match · {n} books in common" and "Not enough overlap yet" — concrete, active, no em dashes (middot separator), no banned filler.
- [x] Trust is not shown as a raw GrapeRank number. Taste match is a rating-agreement percentage (a distinct metric), not a trust weight/tier — no trust score leaks to the wire.

## Things tests can't catch
- [x] No secrets, no `console.log`, no commented-out code.
- [x] Error paths: the route reads are wrapped (best-effort degrade to an honest empty match) inside an outer `try/catch → next(err)`. The chip catches the fetch and renders nothing on failure.
- [x] Input validation: target resolved via `toHex` (validates npub/hex → 404 on garbage); observer from the session; GET with no body.
- [x] Concurrency: read-time compute, no shared mutable state. The chip effect guards a stale update with a `cancelled` flag.

## House rules check
- [x] PRD scope discipline: nothing from "Out of Scope" (payments, file hosting) touched.
- [x] POV-first: computed per observer (the session viewer) at read time, never stored as a global. v1 is raw pairwise (viewer↔target), the trust-weighted variant is a named later story.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/web/src/components/TasteMatchChip.tsx`** — the designed loading skeleton is deferred; the chip renders nothing during the brief fetch and appears on resolve (logged as a Deviation on the story). No flash of fabricated content; the empty / below-threshold / value states are all designed. A follow-up can add the skeleton pill. Optional.
2. **Response typing** — the API's `TasteMatchResponse` types `percentage` as optional on the `self:false` variant, while the web `TasteMatchResult` discriminates on `thresholdMet` so `percentage` is required when met. Both are correct and align at runtime (percentage present iff `thresholdMet`); the web's stricter shape just makes narrowing cleaner. No action needed.

## Verdict
**PASS** — the diff matches the story, ADR, and test plan; all gates are clean; no blocking issues. Mergeable as-is.
