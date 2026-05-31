# Review: Story 24 — Make user identities clickable → reach any profile

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-31
**Diff:** `git diff main...feat/clickable-profiles` (merge-base `3997526`, branch tip `856db56`)
**Story:** `engineering-team/stories/done/24-clickable-profiles.md`
**ADR:** `engineering-team/decisions/0024-clickable-profiles.md`
**Test plan:** `engineering-team/stories/done/24-clickable-profiles.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass.** All 6 workspace projects clean (schemas, search, indexer, seeder, api, web).
- [x] `pnpm -r test` — **pass.** Full workspace green:
  - apps/web: 32 files, 149 passed
  - apps/api: 61 files, 471 passed | 10 skipped
  - packages/schemas: 8 files, 72 passed
  - packages/search: 2 files, 11 passed
  - apps/indexer: 2 files, 6 passed
  - apps/seeder: 4 files, 12 passed
  - The 3 new Story-24 files contribute 20 cases (rated-by-row 11, reviews-list-byline 5, submissions-submitter-link 4), all green. Story-18..23 suites and the search/trust guards stay green.
- [x] `pnpm --filter @unbnd/web build` — **pass.** `tsc --noEmit && vite build`, 431 modules, built in 528ms.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1 (every rater surfaced, reviewers + rate-only, count matches) — `RatedByRow` consumes the active perspective's full `ratings` array; reviewers in `ReviewsList`, all raters in the roster. Covered.
- [x] AC-2 (each identity links to `/profile/<npub>`) — badges, byline, submitter all `Link` to `/profile/${npub}` with the raw npub from the response.
- [x] AC-3 (rate-only rater shows name + `★ score`, links, no fabricated text) — expanded grid `RaterBadge detailed` renders name + `★ {score}`; no review text fabricated.
- [x] AC-4 (submitter present → link; absent → nothing, no crash) — `CommunitySubmissions.tsx:62-69`, ternary on `s.submitter`.
- [x] AC-5 (npub display, hex never required) — diff grep for `npubEncode|[0-9a-f]{64}|nip19|getPublicKey` returns NONE; all three test files assert no 64-hex in href or visible text.
- [x] AC-6 (perspective consistency) — `RatedByRow ratings={reviews}` where `reviews` is the already-derived House/`weighted` array (`RatingsPanel.tsx:63/70`); `renders exactly the perspective array's raters, in order` proves it links the passed set without widening.
- [x] AC-7 (layout preserved, reviews keep weight) — `RatingsBlock` untouched; `RatedByRow` sits between it and `ReviewsList`. `ratings-panel.test.tsx` is **untouched on the branch** and still passes (empty fixtures → no badge/byline mount).
- [x] AC-8 (no fabrication; zero ratings → nothing) — `RatedByRow` returns `null` for empty; `ReviewsList` keeps its text filter + null-on-empty guard, so a rate-only-only book renders the roster and no reviews block.
- [x] AC-9 (byline resolves kind-0 name, falls back to shortNpub, links) — `ReviewByline` uses `useProfileMeta` + `displayNameOf(meta, shortNpub(npub))`, identical to `RaterBadge`, so a reviewer who is also a badge resolves one kind-0 (Story-19 cache dedup).

## ADR adherence
- [x] Option A implemented exactly: `RatedByRow.tsx` + `.css`, leaf `RaterBadge` self-fetching via cached `useProfileMeta`, `CAP = 5`, `+N` chip is a `<button>` (not a Link), expand-in-place, byline + submitter are minimal `Link` wraps.
- [x] Files match implementation notes 1–6. Web-only; no API edit (diff touches only `apps/web` + engineering-team docs).
- [x] No new dependencies; `Link`, `Avatar`, `useProfileMeta`, `displayNameOf`, `shortNpub` are all existing.
- [x] Option B (batched endpoint) correctly avoided.

## UI integrity (apps/web)
- [x] Brand tokens only. `RatedByRow.css` and `CommunitySubmissions.css` additions use `--u-amber`, `--u-amber-hover`, `--u-ink`, `--u-border`, `--u-border-hover`, `--u-surface`, `--u-parchment` — all defined in `tokens.css`. No new hex literal in the diff. (`Avatar.tsx`'s identity-color arrays are pre-existing, not in this diff, and are the sanctioned per-component identity styling.)
- [x] No icon library. The only glyph is the existing `★`.
- [x] Deterministic Avatar fallback (seed = npub) and dead-picture→initials inherited from `Avatar`.
- [x] Copy: "Rated by" label, `+N` chip, `aria-label="Show all N raters"`, `title`/`aria-label` carrying the resolved name. No em dashes, no rhetorical contrasts, no banned verbs, no emoji. Passes `feedback_unbnd_copy_and_visual.md`.
- [x] No raw GrapeRank numbers introduced.

## Things tests can't catch
- [x] No secrets, no `console.log`, no commented-out code in the diff.
- [x] Lazy-on-expand is structurally sound: `shown = expanded ? raters : raters.slice(0, CAP)`; collapsed renders only `shown` (≤5) `RaterBadge`s, so the overflow hooks never mount until `expanded`. The chip is a button that flips `expanded` in place; no extra route. Verified the test proves it: `does not render the 6th+ rater (nor fire its kind-0 fetch) before expand` asserts (a) `collapsedHrefs` excludes `/profile/<npub(6)>`, (b) `useProfileMeta` not called with npub(6) or npub(8) while collapsed, (c) badge-6 present after expand.
- [x] Dedup-by-npub in `RatedByRow` preserves perspective order and collapses a defensive duplicate to one badge.
- [x] No race conditions; `useProfileMeta` already owns cancellation + once-per-session fetch.

## Tester's brittle-assertion fix — audited, no coverage loss
The impl commit (`856db56`) removed one line from `rated-by-row.test.tsx`: a `queryByRole("link", { name: new RegExp(npub(6).slice(0,10)) })` substring assertion. All fixture npubs share `shortNpub` = `npub1rater` (the per-rater digit is elided), so that by-name query matched all 5 visible collapsed badges and threw "multiple elements" — un-satisfiable, not a real check. The lazy guarantee remains proven by the surviving assertions in the same test: exact-href absence of badge-6, `useProfileMeta` not called for npub(6)/npub(8) while collapsed, and badge-6 present after expand. The removed line was strictly weaker and broken; no genuine coverage was lost. This is a legitimate test-correctness fix, not a weakening.

## House rules check
- [x] PRD §11.3 scope held: links only — no people-search, no Follow buttons on bylines, no shelf-owner attribution, no API change, no new profile data, no new route.
- [x] POV-first respected: the row renders whatever the active perspective's array carries; trust math untouched.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`RatedByRow.tsx:39`** — the collapsed-pile badge and the expanded-grid badge share the `rated-by-badge` class with the grid variant added via `rated-by-badge-grid`; fine as-is. No action needed.
2. **Design note for staging:** the collapsed overlapping avatar pile with the `+N` chip and the expanded name+score grid read cleanly and match the "compact roster under the summary" intent. Worth an eyes-on pass at staging with a real >5-rater book to confirm the negative-margin pile and the 220px name truncation look right with live kind-0 pictures. Not a blocker.

## Verdict
**PASS**
