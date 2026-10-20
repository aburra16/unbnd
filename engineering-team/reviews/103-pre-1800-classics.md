# Review: Story 103 — Books first printed before 1800 show again

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-20

## Quality gates (full workspace, run by reviewer)
- [x] `pnpm -r --no-bail typecheck`, `lint`, `build`: every package clean.
- [x] `pnpm -r --no-bail test`: every package green (api 1010 + 13 skipped as on main, web 450, schemas 168, seeder 145, indexer 28, promoter 38, librarian 44, trust 64, search 16, shelves 29, relay 22, ui 20, guide-lint 13).
- [x] Red set at `775e3b3`: 23 failing for the missing behavior, typecheck clean.

## Spec adherence (ADR 0091)
- [x] §1 `PRINT_ERA_START = 1450` and `credibleYear` in `packages/schemas/src/BookRecord.ts`, re-exported through the schemas index; 1449 and 1450 boundaries tested.
- [x] §2 `isJunkRecord` flags only a present year after `currentYear`; `RECORD_YEAR_MIN` removed. Future year, denylist, missing title and author cases unchanged.
- [x] §3 Every read projection reports `credibleYear`: `toPublicBook` (all API book reads: detail, shelves, For You, homepage, profile, claims, author edits), `toSubmission` (both submission lists), `normalizeDoc` (autofill), `buildBookDocument` (the only indexer path; the Meili hit mapping passes the indexed value through). Stored-data writers (seeder mapper and fingerprint, promoter, submission template) are untouched, as the ADR requires.
- [x] §4 Seed gate uses the shared floor; its private `YEAR_MIN` is gone.
- [x] §5 Submit form `min={PRINT_ERA_START}`.
- [x] No stale 1800 claims in source; the remaining mention in `BookRecord.ts` is the deliberate note on why the floor went.

## Findings
#### Blocking
_None._
#### Non-blocking
1. AC 1 names Hamlet; `parseBook` tests use Gulliver's Travels and The Canterbury Tales, and Hamlet is covered in the oracle and submission tests. Same code path; left as is.
2. The submission template accepts any `publishYear` from a non-browser client (pre-existing). Projections hide a pre-print year, so it is harmless; belongs with the next-year mismatch noted in the story's out-of-scope list.

## Live check owed after merge and deploy
`GET /api/books/ol-ol20600w` (404 on staging before this change), `ol-ol362427w` (Romeo and Juliet) and `ol-ol52114w` (The War of the Worlds, no year) return 200; search finds Gulliver's Travels after the indexer's next rebuild.

## Verdict
**PASS.**
