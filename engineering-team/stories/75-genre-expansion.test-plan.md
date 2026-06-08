# Test Plan: Story 75 — Genre expansion to 16

**Story:** `engineering-team/stories/75-genre-expansion.md`
**ADR:** `engineering-team/decisions/0073-genre-expansion.md`
**Date:** 2026-06-07

## Coverage map
The deliverable is mostly **pure, deterministic logic** (the `subjects → genres` derivation + the recast assertion builder) plus data (taxonomy, palette). Those get unit tests. The recast *script* (connect → page → publish) is one-time ops orchestration verified by the run, not unit-tested; its testable core (`buildRecastAssertions`) is covered.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (14+ taxonomy) | `defines the expanded 16 UI genres` | `apps/seeder/test/taxonomy.test.ts` | unit |
| AC-1 (distinct color per genre) | `assigns 16 distinct colors` + `yields 16 distinct genre-card colors` | `apps/web/test/lib/genre-color.test.ts` | unit |
| AC-2 (derive from preserved subjects, no fetch) | `subjectsToGenres` describe (pure, no I/O) — signature subjects per genre, case-insensitive, disambiguation, fallback, multi/none | `apps/seeder/test/genres.test.ts` | unit |
| AC-3 / AC-4 (recast → books appear under a genre; browse returns them) | `buildRecastAssertions` builds librarian polarity-1 genre assertions per derived genre (the events the recast publishes; the existing `aggregateGenreBooks` + `/api/genres/:slug/books` then surface them — covered by their own existing tests) | `apps/seeder/test/genres.test.ts` | unit |
| AC-5 (idempotent + non-destructive) | `is deterministic (idempotent): same record → same genres` (+ structural: librarian-authored, stable `tagassert--<book>--<genre>--<asserter8>` d-tag → replace-not-duplicate, other asserters untouched) | `apps/seeder/test/genres.test.ts` | unit + structural |
| AC-6 (unmatched book unsorted; empty genre absent) | `produces no assertions for a record whose subjects match no genre` + `subjectsToGenres([...]) → []`; empty-genre drop is a recast yield-report step (ADR §3.4) | `apps/seeder/test/genres.test.ts` | unit |

## Edge cases
- [x] `"Science fiction"` does **not** leak into `science` or `literary-fiction` (the headline disambiguation).
- [x] `literary-fiction` is a **fallback**: plain `"Fiction"` → `["literary-fiction"]`; `["Fiction","Fantasy"]` → fantasy, not literary-fiction.
- [x] Case-insensitive matching.
- [x] Multi-genre (`["Fantasy fiction","Romance"]` → both); no-match → `[]`; empty subjects → `[]`.
- [x] Cover gradients untouched — `coverGradient` still returns a stable `{from,to,ink}` (the decoupling guard); the ui palette-sync guard stays green (GENRE_PALETTE unchanged).
- **Recast live run (not unit-tested):** paging the books concept + publishing across ~11.2k records is a one-time ops step (`seed:recast`). Its pure core (`buildRecastAssertions`) is tested; the run + per-genre yield report + empty-genre drop are verified at deploy and recorded in the book's Deploy/ops notes.

## Test infrastructure
- Vitest. Seeder unit at `apps/seeder/test/`; web at `apps/web/test/lib/`. All pure — no relay, no fetch.
- `buildRecastAssertions` returns `BookTagAssertion[]` (pure), so idempotency + shape are tested without a relay; the connect/page/publish loop in `recast.ts` is orchestration.
- The genre-card colors come from `@unbnd/ui` `GENRE_COLORS`; the web test imports it directly and checks `genreColor()` reads it.

## How to run

```
pnpm --filter @unbnd/seeder exec vitest run test/genres.test.ts test/taxonomy.test.ts
pnpm --filter @unbnd/web exec vitest run test/lib/genre-color.test.ts
pnpm -r typecheck && pnpm --filter @unbnd/ui test
```

## Verification
The new/updated tests fail against the stubs (`subjectsToGenres`/`buildRecastAssertions` return `[]`; `STARTER_TAXONOMY` still has 8 genres; `GENRE_COLORS` is empty so `genreColor` collides). Confirmed 2026-06-07:

```
 ❯ apps/seeder  test/genres.test.ts    (10 tests | 9 failed)
 ❯ apps/seeder  test/taxonomy.test.ts  ( 3 tests | 1 failed)
 ❯ apps/web     test/lib/genre-color.test.ts ( 5 tests | 4 failed)
```

`pnpm -r typecheck` clean. No regressions: ui 13/13 (palette-sync green), seeder's other 13 files pass, web's other 61 files pass. The green assertions in the new files are stub coincidences (`[]` no-match cases, the cover-gradient guard).
