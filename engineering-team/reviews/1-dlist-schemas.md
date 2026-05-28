# Review: Story 1 — DList schemas for the core data model

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-28
**Diff:** `git diff aa3d507..61d540c` — the Implementer's commit.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass**. Three workspace projects (`@unbnd/api`, `@unbnd/schemas`, `@unbnd/web`) all clean.
- [x] `pnpm -r test` — **pass**. 62 schemas tests + 9 web tests = 71 passing, 0 failing.
- [x] `pnpm --filter @unbnd/web build` — **pass**. 215.10 kB JS (67.23 kB gzip), 34.98 kB CSS (6.42 kB gzip), 1.46 kB HTML, 129 modules transformed in 349 ms.
- [x] Lint not configured — skipped (per ADR; lint introduction would be its own ADR).

## Spec adherence

- [x] **AC-1** — TypeScript interfaces exist for all six §6 shapes. `BookRecord`, `BookGenre`, `BookRating`, `BookGenreTag`, `BookQualitySignal`, `BookShelf` are all exported from `@unbnd/schemas`.
- [x] **AC-2** — Shared envelope used by all six. Every shape's wire-event type is `UnsignedDListEvent<39999, T, P>`. Tests confirm.
- [x] **AC-3** — Cross-references use shared `DListAddress<39999>`. `BookRating.bookAddress`, both addresses on `BookGenreTag`, all `bookAddresses` on `BookShelf` — same type, same shape, same `formatAddress` helper.
- [x] **AC-4** — Fixtures refit. `apps/web/src/data/book-fixtures.ts:78–82,98` carries `parentHeader`, `authorName`, `format`, `source`, `language: "en"`. `genre-fixtures.ts:30,32` adds `parentHeader`. `profile-fixtures.ts` shelves built via `shelfFromCovers()` enforce the parallel-array invariant by construction. Fixture values unchanged in semantic content (the `language: "English" → "en"` is the schema's wire format; UI restores the display name via `displayLanguage()`).
- [x] **AC-5** — `pnpm -r typecheck` clean.
- [x] **AC-6** — All five smoke tests pass: Home, BookDetail Orbital, GenreBrowse Literary fiction, Submit, Profile mira-calloway. Spot-checked the BookDetail render in the dev server; visible output is identical to pre-refit baseline (after the `displayLanguage` fix).
- [x] **AC-7** — Z-tag parent reference typed. `UnsignedDListEvent.parentHeader: DListAddress<39998>`. Every `to*Event` emits a `["z", formatAddress(parentHeader)]` tag.

## ADR adherence

- [x] Files match the ADR's implementation notes: `packages/schemas/src/{envelope,concept-headers,BookRecord,BookGenre,BookRating,BookGenreTag,BookQualitySignal,BookShelf,index}.ts` all present and structured as specified.
- [x] Layering respected: schemas don't import from `apps/`, `apps/api` doesn't import the new package (yet), `apps/web` imports cleanly.
- [x] No new dependencies the ADR didn't authorize. Vitest, `@testing-library/react`, `happy-dom` are all in the ADR's Consequences block.
- [x] Three Implementer-phase refinements documented in the ADR's new "Refinements during Implementation phase" section: `p` tag on rating/genre-tag/quality-signal/shelf, `genreAtag` on bookGenreTag payload, `displayLanguage` helper for the ISO-code rendering. All three align with Tapestry conventions and preserve the ADR's intent.

## DList integrity

- [x] Event kinds correct: every wire event is kind 39999, every parent header is kind 39998.
- [x] D-tag patterns match the ADR:
  - BookRecord: `<slug>` (`packages/schemas/src/BookRecord.ts:74`).
  - BookGenre: `<slug>` (`BookGenre.ts:41`).
  - BookRating: `rating--<bookSlug>--<rater8>` (`BookRating.ts:64`).
  - BookGenreTag: `genre-tag--<bookSlug>--<genreSlug>--<tagger8>` (`BookGenreTag.ts:58`).
  - BookQualitySignal: `quality-signal--<bookSlug>--<signalSlug>--<tagger8>` (`BookQualitySignal.ts:57`).
  - BookShelf: `shelf--<user8>--<shelfSlug>` (`BookShelf.ts:60`).
- [x] Librarian pubkey resolved at runtime. Every `build*HeaderAddress` helper in `concept-headers.ts:11–14` takes `librarianPubkey: HexPubkey` as a parameter. No literal npub or hex anywhere in `packages/schemas/src/`. The fixture-only constant in `apps/web/src/data/fixture-constants.ts:14` is clearly documented and explicitly synthetic (63 zeros + "1"); deployments resolve at runtime.
- [x] Concept header references use stable `kind:pubkey:slug` addresses throughout. `formatAddress` produces the canonical string; `parseAddressOfKind(s, 39999)` narrows at decode time.
- [x] Word-wrapper JSON shape matches the ADR per shape. Each `to*Event` builds a `payload` with `word: { slug, name, title, wordTypes: ["word", "<discriminator>"] }` and a type-specific section.

## UI integrity (apps/web changes)

- [x] Brand tokens are the source of truth. The diff in `apps/web/src/components/` contains no new hex literals outside the existing per-component genre/signal color styling. Confirmed by `git diff ... | grep '^+.*#[0-9A-Fa-f]{6}'` returning no hits.
- [x] No icon library introduced. The added `displayLanguage` helper is plain text.
- [x] Copy follows the no-slop rules. The only new UI-facing strings are the language display names ("English", "Spanish", etc.) — neutral, factual, on-brand for a literate bookstore.
- [x] Trust shown as percentile tier strings. The fixture's existing "Top 2% curator", "Top 5% curator", "Top 8% curator" labels are preserved. No raw GrapeRank numbers leak into UI.
- [x] No emoji, no AI-slop chrome, no rhetorical contrasts, no em dashes in user-facing strings. (Em dashes appear in code comments and the ADR's prose — the rule applies to shipped UI text, not engineering documentation.)

## Things tests can't catch

- [x] **No secrets.** The fixture pubkeys are explicitly synthetic and documented as such. The `FIXTURE_LIBRARIAN_PUBKEY` is `"0".repeat(63) + "1"`. The `FIXTURE_MIRA_PUBKEY` is documented as a fixture-only value derived from the agent keypair recorded in memory, not a production secret.
- [x] **No debug logging.** Grep for `console.log` in the diff returns no hits.
- [x] **No commented-out code.** Old stubs were cleanly removed.
- [x] **Error paths handled.** `asHexPubkey`, `asEventId`, `parseAddress`, `parseAddressOfKind`, `toBookShelfEvent` (parallel-array invariant), `fromBookRatingEvent` / `fromBookGenreTagEvent` / `fromBookQualitySignalEvent` / `fromBookShelfEvent` (missing `p` tag) all throw with descriptive errors on bad input.
- [x] **No race conditions / concurrency concerns.** Conversion functions are pure data transformations with no shared state.
- [x] **Security.** No untrusted input reaches the conversion functions in this story; validation at the strfry-boundary is deferred to a later ADR.
- [x] **No scope creep.** Every change is either in `packages/schemas/`, in the three fixture files (per AC-4), in the two components that imported the renamed type (`BookHeader.tsx`, `RatingsBlock.tsx`), or in the ADR documentation. The smoke-test guards confirm no other UI behavior changed.

## House rules check

- [x] **PRD scope discipline.** Nothing from §11.3 "Out of Scope" sneaks in. No payment paths, no file hosting, no ebook sales, no social feed, no reading progress. Schemas-only story landed as scoped.
- [x] **POV-first respected.** Schemas carry per-author DList events; no global denormalized "the book's rating" or "the book's genre" field. Trust-weighted aggregations remain a query-time concern.
- [x] **Decentralized-first respected.** No author gate, no role check, no admin distinction. The Librarian is the seed publisher, not a gatekeeper.
- [x] **Filter-at-view-time respected.** No precomputed per-POV columns in the schemas. Future trust-weighted queries compose at read time.
- [x] **No new lint/typecheck/build tooling without an ADR.** Vitest, `@testing-library/react`, `happy-dom` were explicitly authorized in ADR 0001's Consequences block.
- [x] **Tapestry prior art cited.** The ADR's Context section names the three branches (`concept-graph`, `feat/communities`, `feat/pubkey-tagging-target`) with file paths.

## Findings

### Blocking

None.

### Non-blocking observations

1. **`payloadAs<P>` export in `packages/schemas/src/envelope.ts:151` is dead code.** Defined and exported with a comment about being "Used internally by `from*Event` implementations," but no shape module actually imports or calls it. Recommend either using it where the unknown-to-typed narrowing happens (e.g., the `from*Event` decoders) or removing the export in a small cleanup. Not blocking — unused exports are a minor smell, not a correctness issue.

2. **`BookDetailRecord` carries both `author` and `authorName` with identical values** (`apps/web/src/data/book-fixtures.ts:73,80,98`). The comment calls out `author` as a "display alias for the schema's `authorName`. Kept for the existing UI surface." Acceptable to ship — the only consumer of `book.author` is `BookHeader.tsx:27` and it works. Cleanup: rename that consumer to use `book.authorName` and drop the alias. Non-blocking.

3. **The ADR's per-shape "Implementation notes" sections still list the pre-amendment tag set.** The `Refinements during Implementation phase` appendix correctly captures the `p` tag additions and the `genreAtag` payload field, but a reader of the per-shape `BookRating` / `BookGenreTag` / `BookQualitySignal` / `BookShelf` sections will see the original tag list without `p`, and the original `BookGenreTag` payload without `genreAtag`. Recommend a follow-up edit that either inlines the amendment into each per-shape section or adds a one-line back-reference ("see Refinements §1") next to each affected tag list. Non-blocking — the ADR is consistent overall, just slightly easier to misread on a quick scan of one section.

## Verdict

**PASS.**

The implementation matches the story, the ADR, and the test plan. All quality gates pass. The fixture refit is value-preserving — the visible UI is identical to the pre-refit baseline. The three Implementer-phase wire-shape refinements are documented in the ADR and align with existing Tapestry conventions.
