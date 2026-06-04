# Review: Story 54 — Remove the dead `apps/web/src/data` fixtures and close the guard blind spot

**Reviewer:** Claude (acting as Reviewer, independent, fresh context)
**Date:** 2026-06-04
**Diff:** `git diff origin/main...HEAD` (commit `821c094`, PR #99, branch `story-54-dead-fixture-cleanup`)
**Story:** `engineering-team/stories/done/54-dead-fixture-cleanup.md`
**ADR:** `engineering-team/decisions/0053-guard-scope-tighten.md` (Accepted)
**Cycle:** LEAN (no separate Tester — the red→green reproduction is the test, reproduced by the Reviewer below).

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 10 projects Done (schemas, search, ui, indexer, promoter, seeder, web, trust, shelves, api). No errors.
- [x] `pnpm -r test` — **PASS.** Every project green:
  - `packages/ui` 13 test files passed (all 12 architecture guards + tokens).
  - `apps/web` **52** test files passed (was 53 on origin/main; the one removed file is exactly `apps/web/test/fixtures.test.ts` — confirmed by diffing the two file lists, all other 52 identical).
  - `apps/api` 85 passed / 2 skipped; `packages/schemas` 12; `packages/search` 2; `packages/trust` 5; `apps/seeder` 7; `apps/promoter` 5; `apps/indexer` 2; `apps/shelves` 3. Zero failures repo-wide.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit && vite build`; 461 modules transformed, built in 588ms, no errors.
- [x] CI `gh pr checks 99` — **all green:** `Typecheck, test, build` pass; `Validate Caddyfile` pass; **`Visual regression` pass (59s)** — zero-diff, no render path changed, no baseline updated.
- [ ] _Lint not configured — skipped._

## Dead-chain confirmation (my own grep, not the author's)

Repo-wide grep across `apps/` + `packages/` (excluding `node_modules`) for every importer/symbol of the deleted files:

```
grep -rn -E "book-fixtures|genre-fixtures|fixture-constants|bookRecords|genreRecords|FIXTURE_LIBRARIAN_PUBKEY" \
  apps packages --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.json --exclude-dir=node_modules
→ ZERO MATCHES
```

- `apps/web/src/data/` — **does not exist** on this branch (`ls` → No such file or directory). Confirmed it is the only `data` dir under any scan root (`find apps/web/src packages/ui/src -type d -name data` → none).
- The four deleted files (`book-fixtures.ts`, `genre-fixtures.ts`, `fixture-constants.ts`, `apps/web/test/fixtures.test.ts`) had **zero live importers**. `fixtures.test.ts` was the sole importer of `bookRecords`/`genreRecords`, and was itself a self-referential conformance test (no application code exercised).
- The e2e visual harness uses its **own separate fixtures** at `apps/web/e2e/visual/fixtures/index.ts` — it defines its own `FIXTURE_*` constants inline and imports nothing from the deleted `src/data` files. Confirmed by reading its import block.

**Verdict: the deletion is safe. The four files were genuinely dead.**

## Guard-diff verdict (`git diff origin/main...HEAD -- packages/ui/test/`)

- [x] **Minimal + correct.** The diff touches exactly the nine scanning guards (`architecture-color-literals`, `-type-literals`, `-spacing-literals`, `-shape-literals`, `-motion-literals`, `-button-literals`, `-svg-literals`, `-page-frame`, `-breakpoints`). In each, the ONLY logic change is the removal of the `"data",` entry from `SKIP_DIRS`; every other changed line is a comment correction.
  - Confirmed: filtering the diff to added/removed lines that are neither `+++/---` headers, nor comments, nor the `"data",` entry → **empty set**. No other SKIP_DIRS logic changed.
- [x] **Zero residual `data` references.** `grep -rniE '"data"|src/data|fixture data|fixture-data' packages/ui/test/` → **ZERO**. No guard still claims `data` / `apps/web/src/data` is excluded.
- [x] **Universal skips intact.** All nine guards still carry the six universal skips (`node_modules`, `dist`, `.git`, `engineering-team`, `e2e`, `test`) — verified 6/6 per guard.
- [x] **Three non-scanning guards untouched.** `architecture-token-refs.test.ts`, `architecture-palette-sync.test.ts`, `architecture-theme-completeness.test.ts` are not in the diff. `token-refs` confirmed to have never carried a `"data"` entry.
- [x] **Reworded comments accurate + slop-free.** The corrected comments no longer claim `data` is excluded; they now read e.g. "Visual-harness fixtures are scope-excluded, consistent with the color guard." No em dash was introduced by the diff: every `+` line in the guard diff was scanned and **none** contains an em dash. (The em dashes that exist elsewhere in these files are pre-existing prose untouched by this story.)

**Verdict: guard edits are minimal, correct, universal skips intact, the three non-scanning guards untouched.**

## Independent red→green reproduction (color guard)

1. Planted `apps/web/src/data/__probe.ts` with `export const PROBE = "#ABCDEF";`.
2. Ran the color guard alone (`vitest run test/architecture-color-literals.test.ts` in `@unbnd/ui`) → **FAILED**, with the explicit offender:
   `apps/web/src/data/__probe.ts contains hex literal: #ABCDEF`.
   This proves the `data` skip is genuinely gone — the guard now scans `apps/web/src/data/`.
3. Deleted the probe, `rmdir apps/web/src/data` (the now-empty dir is gone), re-ran the color guard → **PASS** (1 test passed).
4. Confirmed no probe artifact left behind: `apps/web/src/data` does not exist, `git status --porcelain` is **clean**.

**Verdict: red→green reproduced. The skip removal is real, not cosmetic.**

## Spec adherence (acceptance criteria)

- [x] Dead directory removed (`book-fixtures.ts`, `genre-fixtures.ts`, `fixture-constants.ts`); empty dir gone.
- [x] Dead test removed (`apps/web/test/fixtures.test.ts`); web suite is exactly one file fewer (53→52).
- [x] Guard blind spot closed; stale comments corrected; universal skips unchanged.
- [x] Red→green demonstrated by the Reviewer on the color guard (above).
- [x] No production code touched outside the deleted `data/` directory (scope check below).
- [x] Gates green; `visual` zero-diff, no baseline updated.
- [x] Slop-free: no em dash introduced; reworded comments read cleanly.

## ADR adherence

- [x] Files changed match ADR 0053's decision exactly: four deletions + the nine named guards de-skipped, token-refs untouched, universal skips preserved.
- [x] No new dependencies. No layering change. Test-only guard scope tightening + dead-code deletion; no `packages/ui/src`, `packages/ui/styles`, tokens, or primitives touched.

## Scope

`git diff origin/main...HEAD --name-only` filtered to anything outside `apps/web/src/data/`, `apps/web/test/fixtures.test.ts`, `packages/ui/test/`, and `engineering-team/` → **empty**. No production source, no app CSS, no behavior change. The story/ADR claims match the diff.

## Findings

### Blocking
None.

### Non-blocking
1. **`AGENTS.md:27`** — the orientation doc still lists `apps/web/src/data/` as "(fixtures that the screens render against)". That pointer is now a dead reference (and was already inaccurate after the Story 9 live-data swap). This story explicitly scopes doc re-pointing out (Out of scope: doc/follow-up re-points are separate stories), so it is **not blocking** here. Worth a one-line follow-up to drop the `src/data` clause from AGENTS.md §1 so new agents are not sent to a deleted directory.

## Verdict
**PASS**
