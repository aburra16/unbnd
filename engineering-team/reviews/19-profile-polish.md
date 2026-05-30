# Review: Story 19 — Polish the logged-in profile (enriched shelves, account-menu nav, honest activity counts)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-30
**Diff:** `git diff 61f5d29...feat/profile-polish` (merge-base `61f5d294`, HEAD `2333a69`)
**Story:** `engineering-team/stories/done/19-profile-polish.md`
**ADR:** `engineering-team/decisions/0019-profile-polish.md`
**Test plan:** `engineering-team/stories/done/19-profile-polish.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (exit 0, all packages).
- [x] `pnpm -r test` — **pass**. `apps/api` 305 passed / 10 skipped (44 files); `apps/web` 85 passed (20 files); `packages/schemas` 72; `packages/search` 11; `apps/seeder` 12; `apps/indexer` 6. New Story-19 suites green: `routes/shelves-enriched`, `routes/profile-stats`, `ratings/own-counts`, `tags/own-counts`, `account-menu`, `profile-me-polish`. The migrated Story-18 suites (`routes/shelves`, `shelf-control`, `profile-me-shelves`) green. Search/trust architecture guards green.
- [x] `pnpm --filter @unbnd/web build` — **pass** (exit 0, 437 modules, 591ms).
- [x] _Lint not configured — skipped._

## Spec adherence

- [x] Every acceptance criterion has a passing test asserting real behavior.

| AC | Coverage | Verdict |
|---|---|---|
| AC-1 enriched shelf books | `shelves-enriched.test.ts` (PublicBook title/author/cover); `profile-me-polish.test.tsx` (title+author render, link to `/book/<slug>`, no raw slug) | covered |
| AC-2 missing-book honesty | `shelves-enriched.test.ts` omit-and-recount + no `ol-ghost` leak | covered |
| AC-3 Your profile | `account-menu.test.tsx` menuitem → `/profile/me` | covered |
| AC-4 Your shelves | `account-menu.test.tsx` menuitem → `/profile/me#shelves`, ordering, closes on activate; `id="shelves"` + hash-scroll effect review-verified per ADR Q2 | covered |
| AC-5 books rated | `ratings/own-counts.test.ts` (book-keyed, re-rate once, no-review still counts) + `profile-stats.test.ts` | covered |
| AC-6 reviews | `ratings/own-counts.test.ts` (trim, subset, latest-wins drops review) + `profile-stats.test.ts` | covered |
| AC-7 tags applied | `tags/own-counts.test.ts` ((book,tag) pair, dispute/retract excluded, re-apply) + `profile-stats.test.ts` | covered |
| AC-8 honest stat | `profile-stats.test.ts` (present-0; omit-on-throw per stat; ratings-throw drops both) + `profile-me-polish.test.tsx` (present 0 shows, absent hidden, whole-call-fail hides all) | covered |
| AC-9 toShelfSlug dedupe | `shelf-control.test.tsx` empty-name guard + normal-name slug; import dedupe review-verified | covered |
| AC-10 doc-comment | review-verified — comment rewritten, no longer claims `BookShelf` wire type | covered |

- [x] No criterion silently dropped.
- [x] No behavior added beyond the story.

## ADR adherence

- [x] Files match ADR 0019 implementation notes: enriched `/api/shelves/mine` (one batch read, omit+recount), new session-gated `/api/profile/me/stats`, `countOwnRatings` (book-keyed) + `countOwnAppliedTags` ((book,tag)-keyed), `dedupeRatings` left untouched, `parseBook` exported from `books.ts`, AccountMenu nav, ProfileMe BookGrid + hash-scroll, ShelfControl `toShelfSlug` swap with empty-name guard, `Shelf.books: PublicBook[]`, `api.profile.meStats()`.
- [x] Layering respected — enrichment lives in the route layer (`EnrichedShelf` local type); `shelves/aggregate.ts` `Shelf.books` stays `ShelfBook[]` (membership layer unchanged). No web↔api cross-import.
- [x] No new dependencies. No new tooling.

## DList integrity

- [x] No new event shapes. Existing kind-39999 reads (`book-shelves`, `books`, `book-ratings`, `book-tag-assertions`).
- [x] Librarian pubkey resolved at runtime via `lib() = deps.config.librarianPubkey`; all concept handles built from it (`booksConcept`, `ratingsConcept`, `tagsConcept`). No hardcode.
- [x] Concept addresses use stable `39998:<lib>:<slug>` form.

## UI integrity

- [x] Brand tokens used. New `.acct-item` uses `var(--u-ink)`; the `:hover` `rgba(26, 26, 46, 0.04)` is the established ink-tint pattern already in AccountMenu.css (identical value at the `acct-id:hover`) and across the component CSS set. No new accent/genre hex literal.
- [x] No icon library, no emoji, no SVG added.
- [x] Copy passes no-slop rules. New strings: "Your profile", "Your shelves", "Books rated", "Reviews", "Tags applied", "Give the shelf a name." Plain nouns, no em dashes, no rhetorical contrasts, no filler verbs, no "nostr" leak to a normal-user surface.
- [x] npub-display / hex-internal honored — `PublicBook` carries no hex/parent header (`shelves-enriched` boundary test asserts no `LIB` hex, no `parentHeader`, no `bookAtag`); stats are integers only.
- [x] Trust tiers — N/A; no trust-weighted output (single-author `authors:[user.pubkeyHex]` reads, POV-independent).

## Things tests can't catch

- [x] No secrets, no `console.*`/`debugger`, no TODO/FIXME, no commented-out code in the changed source.
- [x] Honesty model correct end-to-end: route wraps each read independently (`.then(ok, () => ({ok:false}))`); a present field includes a true `0`; an absent field is hidden; a ratings throw drops `booksRated`+`reviews` together; a whole-call failure (`ProfileMe` catch → `setStats(null)`) renders zero stat cells while shelves still render (independent read).
- [x] `countOwnRatings` keys by **book** (`bookSlug`), not pubkey; `countOwnAppliedTags` keys by **(book,tag)** with disputes (latest -1) / retracts excluded; `dedupeRatings` unchanged (still pubkey-keyed for the public per-book read).
- [x] AC-2 falls out of the server filter — unresolvable slug dropped, `count: books.length`. No catalog read when `distinctSlugs` is empty (guarded + tested).
- [x] Single batch read with cross-shelf slug dedup (`new Set(...flatMap)`), tested.

## House rules check

- [x] PRD §11.3 scope discipline — no activity feed, no reading progress, no federation, no payments. Counts only, shelves enriched.
- [x] POV-first — every read is the user's own author filter; no aggregate-across-authors, no GrapeRank, no observer param. Correct application of the N/A case.
- [x] Scope locked: changed files are only `AccountMenu.{tsx,css}`, `ShelfControl.tsx`, `ProfileMe.tsx`, `profile-fixtures.ts`, `lib/api.ts` (web) and `shelves.ts`, `books.ts` (export only), `profile-stats.ts`, `ratings/summary.ts`, `tags/aggregate.ts`, `index.ts` (api) plus tests/eng-team docs. **No `Nav.tsx`** (no top-nav link), **no public `Profile.tsx`** (no Mira retirement / public-profile change), **no public-shelf-browse**. Confirmed.
- [x] No new lint/typecheck/build tooling.

## Judgment calls requested

**Kick-back resolution (AC-1 `.book-title` scoping).** Legitimate, not a weakening. `BookCard.tsx` renders `book.title` twice for a cover-less book — once in `.book-cover-title` (gradient fallback) and once in `.book-title` (meta label). "North Woods" has no `coverUrl`, so scoping that one assertion to `{ selector: ".book-title" }` is the correct accommodation of established BookCard behavior. The no-raw-slug assertion (`queryByText("ol-ol21177w")` not present) is intact; "Orbital"/"Samantha Harvey"/"Daniel Mason" still assert enriched title+author render; the BookCard link test asserts `href="/book/ol-ol21177w"`. The test genuinely verifies enriched rendering.

**Three fixture migrations — all forced, none gutted.**
- (a) `shelf-control.test.tsx`: `{bookSlug,bookAtag}` → PublicBook (`{slug,title,authorName,format}`). **Forced** by the predicate change `b.bookSlug` → `b.slug`; without it the membership "Remove" chip would not render and `findByRole(/remove/i)` would fail. The polarity-`-1` retract assertion (and the "move" two-write assertion) are preserved.
- (b) `shelves.test.ts` grouped-read: mock made concept-routed (returns book records when `#z` ends with "books"). **Genuinely forced** — the implementation now recomputes `count: books.length` from enrichment survivors, so with no catalog records both slugs would be omitted and `count` would be `0`, not `2`. The test plan under-predicted this (it claimed the test "asserts only on count … so it does not break"; it does break). The `count===2` assertion plus the author-scoped filter assertions are preserved. Not a convenience edit.
- (c) `profile-me-shelves.test.tsx`: added `api.profile.meStats` mock (required — `ProfileMe` now calls it in its effect; absent mock throws) + PublicBook fixtures (required by the `BookGrid`/`toCardBook` render path). The original assertions (shelf names, `count===2`, honest empty state) are unchanged.

**`parseBook` exported from `books.ts` vs. a new module.** Acceptable. The ADR explicitly offered "extract … or import from the books route — Implementer picks the smaller diff." Exporting the existing function is the one-line, no-duplication choice; the `PublicBook`/`toPublicBook` projection stays single-sourced.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/web/src/data/profile-fixtures.ts`** — the AC-10 doc-comment fix is correct, but the `ProfileShelfFixture` is now only used by the public `/profile/:handle` Mira mock. The ADR Consequences flagged it may become unused if `/profile/me` stops rendering it; it is still in use on the public route, so no action. Noted for the future public-profile story.
2. **`apps/web/src/routes/ProfileMe.tsx`** — the hash-scroll `useEffect` re-runs on every `shelves` change; harmless (guarded by `location.hash !== "#shelves"`) and matches the ADR's "scroll on hash change AND after shelves load" intent. No change needed.

## Verdict
**PASS**
