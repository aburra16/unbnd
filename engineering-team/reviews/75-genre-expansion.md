# Review: Story 75 — Genre expansion to 16

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff main...HEAD` (impl commit `46635ad`)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0, no failing files). Story suites: seeder `genres` 10/10 + `taxonomy` 3/3, web `genre-color` 5/5.
- [x] `pnpm --filter @unbnd/web build` — **pass**.
- [x] ui suite 13/13 (the **palette-sync guard stays green** — `GENRE_PALETTE` untouched).
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1: taxonomy → 16 genres; `GENRE_COLORS` gives 16 distinct browse-card colors.
- [x] AC-2: `subjectsToGenres` derives from the record's preserved `subjects` only; `recast.ts` performs **no OL fetch**.
- [x] AC-3/AC-4: the recast publishes librarian genre assertions; the existing `aggregateGenreBooks` + `/api/genres/:slug/books` + `/genre/:slug` surface them (unchanged, generic).
- [x] AC-5: idempotent + non-destructive — structural via the `tagassert--<book>--<genre>--<asserter8>` d-tag (librarian re-writes replace; other asserters untouched); `buildRecastAssertions` is deterministic (tested).
- [x] AC-6: no-match → no assertion (book unsorted, tested); empty genres flagged in the recast yield report for dropping before launch.

## ADR adherence (0073)
- [x] All four parts built as decided: +8 taxonomy; shared `subjectsToGenres` (seed path + recast); no-fetch `recast.ts` + `seed:recast`; `GENRE_COLORS` decoupled from the cover-gradient hash.
- [x] The science-fiction disambiguation and the literary-fiction fallback are implemented and tested.
- [x] `RelayFilter` gained `since`/`until` (forwarded verbatim in the REQ) to page past the relay cap — minimal, additive, no query-impl change (the filter is JSON-stringified into the REQ).
- [x] Cover gradients untouched (`GENRE_PALETTE.length` unchanged).

## DList integrity
- [x] Reuses kind-39998 `book-tags` (genre elements) + kind-39999 `book-tag-assertions` (librarian, polarity 1) — existing shapes/d-tags. Reads book records' preserved `subject` tags (no write, no fetch). Librarian pubkey from the nsec at runtime.

## UI integrity
- [x] `GENRE_COLORS` hex lives in `palette.ts` (the sanctioned palette home); `view-model`/components carry no new hex. No icon library. Genre names are plain (no slop).

## Things tests can't catch
- [x] No secrets; the `console.log`s in `recast.ts` are intentional ops/CLI reporting (yield report), not debug cruft; no commented-out code.
- [x] `seed:recast` is checkpointed + idempotent, so a mid-run relay drop resumes safely.

## Findings

### Blocking
_None._

### Non-blocking
1. **Substring matching false-positives (`subjects → genres`) — RESOLVED in review.** Switched the matcher from `includes()` to **word-boundary** matching (a leading `\b`, suffixes allowed). `"conscience"` no longer matches `science`; `"nonfiction"` no longer trips the fiction fallback (a latent bug the substring version had); whole-word + plural forms (`"Social science"`, `"Sciences"`) still match. Locked with a regression test. Seeder 14/14, `pnpm -r test` green.
2. **Recast paging assumes < relay-cap books per `created_at` second.** `recast.ts` cursors by `until = oldest`; the `oldest >= until → break` guard prevents an infinite loop but would **stall before completion** if more than `RECAST_PAGE_SIZE` (500) books share a single `created_at` second (a dense bulk seed). At the current seed rate (~tens/sec) this never triggers, but it is fragile. The recast is **untested ops code** (the paging loop specifically). *Suggestion: a `(created_at, id)` keyset cursor, or simply verify `booksSeen` ≈ the known catalog size in the yield report after the live run.*
3. **The 8 new genre-card colors are engineer-picked.** `GENRE_COLORS` values were chosen for distinctness, not design-validated for contrast on the parchment card (used as text color + a `0F` tint). *Suggestion: a quick design pass to confirm contrast/brand fit before launch.*
4. **Ops run required (recorded).** The catalog only shows the new genres after `seed:recast` is run against staging (paging ~11.2k). Added to the book's Deploy/ops notes alongside #72/#74. The yield report doubles as the AC-6 empty-genre check.

## Verdict
**PASS** — all gates green, all ACs covered (pure logic by test; recast by its tested core + the ops run), ADR 0073 + house rules adhered to, covers untouched, palette-sync green. The non-blocking items are the ADR-acknowledged heuristic tradeoff (1), a low-likelihood paging fragility in untested ops code (2), a design-confirmation nicety (3), and the deploy step (4).
