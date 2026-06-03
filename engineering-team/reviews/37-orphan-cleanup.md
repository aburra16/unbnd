# Review: Story 37 — Orphaned web component cleanup + retire Story 36 files

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, did not write the code; re-derived every claim)
**Date:** 2026-06-03
**Branch / commit:** `story-37-orphan-cleanup` @ `5164901`
**PR:** #80 (`aburra16/unbnd`)
**Diff:** `git diff origin/main...HEAD` (`git show 5164901`)
**Classification:** refactor, no behaviour change — "Implementer → Reviewer only" tier (Tester phase intentionally skipped). No Story-37 file or dedicated ADR exists; scope is sourced from `engineering-team/phase2-prd.md:258` and `engineering-team/phase1-deferred-and-tradeoffs.md:58` ("Orphaned component cleanup").

## Verdict: **PASS**

The diff is exactly what it claims: 12 file deletions (six components × `.tsx` + `.css`) and two pure `git mv` renames (R100, zero content change) of the Story-36 files into `stories/done/`. The diff adds **zero lines** of code anywhere. I independently confirmed every deleted component has zero importers, zero JSX usages, zero test references, and zero CSS imports across the **entire** workspace (apps + packages), not just `apps/web/src`. All three gates pass when I run them myself. No house rules are touched (no copy, no crypto, no hex, no new deps). The git mv is complete with nothing left behind.

Findings below are all **non-blocking** — they record newly-orphaned sibling code (`SignalPill`, two fixture files) that the deletion left dead but that was out of this story's named scope. They do not block merge.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 9 workspace projects clean (schemas, search, trust, indexer, promoter, seeder, web, shelves, api). Zero errors.
- [x] `pnpm --filter @unbnd/web test` — **PASS. 300 passed across 52 test files**, 0 failures. (The `ECONNREFUSED 127.0.0.1:3000` line is caught/mocked stderr from an existing test, not a failure.)
- [x] `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit` + `vite build` succeed; 444 modules transformed; bundle `index.js` 355.03 kB / `index.css` 47.99 kB. No build-time reference to a deleted file.
- [x] PR #80 CI (`gh pr checks 80`) — **all green:** "Typecheck, test, build" pass; "Validate Caddyfile" pass. PR state OPEN, mergeable MERGEABLE. (My local run is the source of truth; CI agrees.)
- [ ] _Lint not configured — skipped (per house rules)._

The Implementer's reported "typecheck 9/9, web 300 tests, web build" matches my independent run exactly.

---

## Independent verification of the deletion

**1. Zero importers of each deleted component (whole repo).**
For each of `ActionBar`, `AuthorCard`, `GenreHeader`, `GenreControls`, `SubgenrePills`, `Pagination`:
- `grep -rnE "components/(...)"` across `apps` + `packages` → **no matches** (static import, `import type`, dynamic `import()`, `React.lazy` all covered by the module-path search).
- `grep -rnE "<(...)\b"` for JSX usages → **no matches**.
- No barrel/`index.*` exists under any `components/` dir (components are imported by direct path), so no re-export path to check.
- Case-insensitive repo-wide search (`grep -rniI`, excluding `node_modules`/`.git`/`dist`): the only hits on the component **names** are in two planning docs describing this very cleanup (`phase2-prd.md:258`, `phase1-deferred-and-tradeoffs.md:58`). No code hit.

**`Pagination` disambiguation (the one risky name).** There are 20 case-insensitive hits for "pagination", but **all** refer to the unrelated paged-API-reads feature / the `gb-pagination` CSS class in `unbnd-wireframes.html` / story docs — lowercase `pagination`, never the deleted `Pagination` React component. `grep -E "<Pagination[ />]"` and the `components/Pagination` import search both return nothing. No collision.

**2. Zero test references.** `grep -rlnE "ActionBar|AuthorCard|GenreHeader|GenreControls|SubgenrePills"` across `*.test.ts` / `*.test.tsx` → **no matches**. (`Pagination` excluded from this grep because the paged-reads tests legitimately use the word; verified separately that no test imports/renders the component.)

**3. No CSS references.** `grep -rnE "(...)\.css"` for `@import` / bundler entry of the six deleted `.css` files → **no matches**. The deleted CSS was imported only by its own now-deleted `.tsx`.

**4. git mv correct and complete.**
- `engineering-team/stories/36-for-you-shelf.md` and `...36-for-you-shelf.test-plan.md` → **both present under `stories/done/`**, **neither left behind** in `stories/`.
- `git show 5164901 --summary -M` reports both as `rename ... (100%)`; `--numstat` shows `0 0` for both → pure moves, no content edits.

**5. House-rule / scope compliance.**
- `git diff origin/main...HEAD | grep '^+'` (excluding `+++` headers) → **zero added lines**. Pure deletions + renames.
- No `package.json` / `pnpm-lock.yaml` changes → no new deps. No new hex literals, no copy, no crypto, no new lint/build tooling. Nothing from PRD §11.3 out-of-scope.

---

## Findings

### Non-blocking — newly-orphaned sibling code (cascade orphans)

The deleted components were the last consumers of three other artifacts. The deletion leaves these fully dead. They are the **same category** of orphan as the six components, but were not in this story's named scope, so they are noted, not required:

- **N1. `SignalPill` in `apps/web/src/components/Pill.tsx`** now has zero importers (only the deleted `AuthorCard` used it). `Pill.tsx` itself must stay — `GenrePill` is still imported by `BookHeader`, `TagControl`, `ShelfControl`. So this is an unused *export within a live file*, not a deletable file.
- **N2. `apps/web/src/data/book-fixtures.ts`** now has zero importers anywhere in the repo (its `AuthorInfo` type was used only by the deleted `AuthorCard`).
- **N3. `apps/web/src/data/genre-fixtures.ts`** now has zero importers anywhere (its `GenreRecord` / `CuratorDot` types were used only by the deleted `GenreHeader` / `GenreControls`).

Recommendation (follow-up, not a blocker): a small sweep to drop `SignalPill` and the two orphaned fixture files would finish the dead-code removal this story started. These pre-date this change and were already dead-in-waiting; leaving them does not affect correctness, types, tests, or build (all green above).

### Pre-existing, unrelated to this diff (informational only)

- `apps/web/src/components/AuthForm.css` exists with no matching `AuthForm.tsx`. Pre-existing; not introduced or touched by this change. Out of scope; flag only.

---

## Summary

A clean, well-scoped deletion refactor. Claims verified independently from a fresh context; nothing surprising in the diff. Gates green locally and in CI. Merge is safe. The only loose thread is the trailing dead code in N1–N3, which is non-blocking and a reasonable follow-up.

**PASS.**
