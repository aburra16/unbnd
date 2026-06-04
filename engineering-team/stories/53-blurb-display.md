# Story 53: Book detail blurb display — clamp, Read more, and an Open Library source link

**Status:** Draft
**Created:** 2026-06-04
**Type:** Feature

## Background

Story 52 (ADR 0051) populated book blurbs from Open Library. The blurb now renders on the book detail page: `BookHeader.tsx` (line 80) outputs `{book.blurb && <p className="bh-blurb">…</p>}`, and `.bh-blurb` is token-compliant. The data and the display both already exist — this story refines *how* the blurb is shown, plus one piece of attribution.

Two problems surfaced once real blurbs landed:

1. **Under-cover whitespace.** The header is a flex row (`.bh`): a fixed 158×236 cover on the left, a flexible `.bh-info` column on the right (`BookHeader.css` lines 8–47). A long blurb stretches `.bh-info` taller than the 236px cover, so the left column ends well above the right column. On the detail page that opens a band of empty space under the cover, above the "Claim this book" block. The whitespace is a direct consequence of the right column outgrowing the fixed-height cover — confirmed in the survey.
2. **Unsatisfying truncation.** ADR 0051 capped the seeded blurb at 700 chars with a sentence/word-boundary cut + ellipsis. In the default view that hard cap reads as an arbitrary cut-off rather than a deliberate summary, and the full description is simply unavailable in the app.

The user made two binding decisions for this story (these deliberately supersede the "capped to 700, no read-more UI, no full-description storage, no baseline update" line in ADR 0051):

- **Display = clamp + inline "Read more".** Show the blurb collapsed to roughly three to four lines by default, with an inline **Read more / Read less** disclosure that expands and collapses it in place. Collapsed, the right column becomes shorter than the cover, which removes the whitespace; expanded, the reader gets the full text without leaving the page. This is **not** a modal — there is no Modal primitive and adding one is out of scope.
- **Full text in-app (Path A).** Raise the seeder blurb cap from 700 to roughly 2000 chars so Read more reveals the complete description in-app for the large majority of books (a rare book-length essay still gets capped). Because the seeder caches the *raw* OL description (ADR 0051 Decision 5 / the `desc-cache`), re-running the backfill with the higher cap re-caps from cache and does **not** re-hit Open Library. Also add a **Source: Open Library** link on the detail page — honest attribution and a path to the canonical OL record, built from the book's `openLibraryId`.

PRD anchor: §5.4 Book Detail Page (the back-cover blurb and the page's information design); §6.2 lists `blurb` as the optional description field. This story changes presentation and attribution of an existing field, not the data model.

## User-facing description

As a Reader, I want a book's description shown compactly with a Read more control and an honest link back to its Open Library record, so that the detail page stays tight and balanced while still letting me read the whole description in the app and verify where it came from.

## Acceptance criteria

Testable from the outside. Each gets at least one test (the Tester picks the exact harness — unit, the visual baseline, or both).

- [ ] Given a book whose blurb is long enough to overflow the collapsed clamp, when the detail page loads, then `.bh-blurb` is shown clamped to roughly three to four lines and a **Read more** control is visible.
- [ ] Given the clamped blurb, when the reader activates **Read more**, then the full blurb expands inline and the control reads **Read less**; activating **Read less** collapses it again. The control exposes the correct `aria-expanded` state (`false` collapsed, `true` expanded).
- [ ] Given a book whose blurb is short enough that it does **not** overflow the clamp, when the detail page loads, then no Read more / Read less control is shown and the full (short) blurb is visible.
- [ ] Given the collapsed state, when the page renders, then the right column is no taller than the cover for a typical long blurb, so the under-cover whitespace is gone (verified by the deliberate `book-detail.png` baseline update below).
- [ ] Given a book with an `openLibraryId`, when the detail page loads, then a **Source: Open Library** link is shown that opens the canonical OL work record (`https://openlibrary.org/works/{openLibraryId}`) in a new tab with safe `rel`.
- [ ] Given a book with no `openLibraryId`, when the detail page loads, then the Source link is absent (graceful, no broken link).
- [ ] Given the seeder, the blurb cap constant is raised from 700 to roughly 2000; `capBlurb`'s unit tests are updated to the new cap; `sanitizeDescription` is unchanged; the seeder test suite is green.
- [ ] All twelve `architecture-*` guards stay green (no raw color/type/spacing/shape/motion literal, no raw `<button>`, no raw `<svg>` introduced in `apps/web/src`; the Read more toggle and the source link are built from the `@unbnd/ui` `Link` primitive); `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/web build` are green.
- [ ] The `book-detail.png` visual baseline is updated **deliberately, in its own clearly labeled commit** (per ADR 0039's intentional-visual-change path); no other baseline changes.
- [ ] The operator re-backfill runbook is documented: bump the checkpoint epoch, re-run the seeder (cache hit — no OL re-fetch), re-index.

## DList shapes touched

No new or changed shape. The blurb already lives in the kind-39999 record `content` (ADR 0051); this story changes its presentation and raises a seeder constant, not the schema.

- `kind:39999` — book record (the `blurb` it already carries in `content` is the text being clamped/expanded; `openLibraryId` it already carries is the source-link input). No write-shape change.

## Survey (read-only, to ground the Architect)

- **The whitespace cause — confirmed.** `BookHeader.css`: `.bh` is `display: flex` with a fixed `flex: 0 0 158px` / `height: 236px` cover and a `flex: 1` `.bh-info`. A long `.bh-blurb` (`font-size --u-font-size-14`, `line-height --u-leading-170`) makes `.bh-info` taller than the cover, so the left column ends above the right and the detail page shows whitespace under the cover above "Claim this book." Clamping `.bh-blurb` collapsed shortens `.bh-info` below the cover height and removes it.
- **The Link primitive API — real, confirmed.** `packages/ui/src/components/Link.tsx` (exported from `@unbnd/ui` as `Link`, type `LinkProps`/`LinkVariant`). It is render-agnostic via `as`: it renders a raw `<a>` by default, or any element/component passed as `as` (e.g. `as="button"` for an in-page action). Closed variant set: `plain-amber`, `plain-muted` (both default to a real `<button>` element inside the primitive — the correct a11y element for an in-page toggle, and *outside* the app-code `no-raw-<button>` guard scope), and `button-primary` / `button-secondary` (default to `<a>`). So the **Read more / Read less** toggle is a `Link` rendered as a button (a `plain-*` variant), and the **Source: Open Library** link is a `Link` rendered as an external anchor (`target="_blank"` + `rel`, extra props flow through `...rest`). The exact variant for each and the precise `as`/prop wiring are the Architect's to pin — no raw `<button>` and no new primitive.
- **`openLibraryId` availability — already surfaced.** `apps/web/src/lib/api.ts` `PublicBook` already declares `openLibraryId?: string` (line 112). The API server already maps it: `apps/api/src/books/effective.ts` `PublicBook` Picks `openLibraryId` (line 33) and `toPublicBook` sets it (line 50), and it survives the effective-book overlay merge. So the OL source URL can be built from the data the detail page already receives — **no read-mapping addition appears to be needed.** The Architect should confirm the field reaches `BookHeader`'s `book` prop on the live read path (it is a straightforward Pick, but worth a one-line confirmation).
- **The cap to raise.** `apps/seeder/src/description.ts`: `export const BLURB_MAX_CHARS = 700;` (line 8), used as the default `max` of the pure `capBlurb`. `apps/seeder/test/description.test.ts` pins it: `expect(BLURB_MAX_CHARS).toBe(700)` (line 127) and several cap-length assertions (`<= 700`) that change with the new cap. `sanitizeDescription` is independent of the cap and stays untouched.
- **The clamp pattern is already guard-clean in this repo.** `apps/web/src/components/BookCard.css` (lines 57–60) already uses `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden` and passes all twelve guards (the line-clamp integer is not a token-guarded literal). The same pattern extends to `.bh-blurb` for the collapsed state.
- **The visual baseline.** The detail-page baseline is `apps/web/e2e/visual/visual.spec.ts-snapshots/book-detail.png` (the spec is `apps/web/e2e/visual/visual.spec.ts`; route map + fixtures in `apps/web/e2e/visual/fixtures/index.ts`). The current fixture blurb (`fixtures/index.ts` lines 49–51) is short — two lines — so as-is it would render *below* the clamp and exercise neither the clamp nor the Read more control. To make the harness actually cover the clamped + Read more state, the fixture blurb must be long enough to overflow the clamp; the baseline then captures the collapsed clamped blurb with the control visible. This is the deliberate, labeled baseline change (and any fixture-blurb lengthening that goes with it).
- **Re-backfill mechanics (ADR 0051).** The seeder checkpoint is epoch-namespaced (`CHECKPOINT_EPOCH`, ADR 0051 Decision 3 / runbook §2) and the raw OL description is disk-cached (`DESC_CACHE_PATH`, Decision 5). Bumping the epoch re-publishes every record once (same d-tag → replace, no dupes); the cache means the higher cap re-caps from stored raw text without re-hitting OL. Re-index is the existing `index` compose profile, no code change.

## In scope

- **Web — clamp + disclosure.** Clamp `.bh-blurb` to roughly three to four lines in the collapsed state (CSS, token-compliant, no raw color/type/spacing/shape/motion literals; line-clamp via the existing `-webkit-box` pattern). Add a **Read more / Read less** toggle built from the `@unbnd/ui` `Link` primitive (rendered as a button), shown **only when the blurb actually overflows the clamp** (the Architect picks the overflow-detection approach). The toggle expands/collapses the blurb inline and carries a correct `aria-expanded`.
- **Web — source link.** Add a **Source: Open Library** link on the detail page, built as a `Link` primitive (external anchor, new tab, safe `rel`) from the book's `openLibraryId` (→ `https://openlibrary.org/works/{openLibraryId}`). Absent gracefully when the book has no `openLibraryId`. If the survey's confirmation finds `openLibraryId` is *not* reaching `BookHeader` on the live read, surface it on `PublicBook` (a small read-mapping addition only — no schema change); the survey indicates it is already present.
- **Seeder — raise the cap.** Raise `BLURB_MAX_CHARS` from 700 to roughly 2000 (the Architect pins the exact number). Update the `capBlurb` unit tests to the new cap (the `toBe(700)` pin and the `<= 700` length bounds). `sanitizeDescription` unchanged. Seeder tests green.
- **Re-backfill — operator runbook.** Document the operator step set: bump the checkpoint epoch, re-run the seeder (cache hit, no OL re-fetch), re-index via the existing profile. Cheap because the raw-description cache avoids OL re-fetch.
- **Visual — deliberate baseline update.** Lengthen the fixture blurb enough to overflow the clamp so the harness covers the clamped + Read more state, and update `book-detail.png` deliberately in a clearly labeled commit per ADR 0039. No other baseline changes.

## Out of scope

- **No modal / Modal primitive.** The disclosure is inline only. No new design-system primitive — the toggle and the source link both use the existing `Link`.
- **No raw `<button>`, no raw `<svg>`, no raw color/type/spacing/shape/motion literals** introduced in `apps/web/src` (the twelve guards stay green).
- **No schema change.** The blurb already lives in `content`; the cap is a seeder constant. No new kind, d-tag, or tag.
- **No effective-book / author-overlay change.** The verified-author blurb overlay (ADR 0033 §5) is untouched; the clamp/expand applies to whatever effective blurb is rendered.
- **No catalog-size expansion.** This is display + cap + re-backfill of the existing catalog; the ~10K expansion stays a separate story (PRD §11.3 out-of-scope items — payments, hosting, ebook sales, social feed, reading progress, federation — are not touched).
- **No edition-description fallback** (ADR 0051 left it a future enhancement; still out).

## Open questions (for the Architect)

1. **Clamp line count + collapse mechanism.** Roughly three to four lines — pin the exact number and confirm the `-webkit-box` / `-webkit-line-clamp` approach (matching `BookCard.css`) for `.bh-blurb`, and the expand/collapse mechanism (toggle a class / state, no animation requirement beyond existing motion tokens if any transition is used).
2. **Overflow detection.** How to show the Read more control *only* when the blurb overflows the clamp (e.g. measure scrollHeight vs clientHeight, a ResizeObserver, or a length/line heuristic). Pick the approach that is deterministic enough for the visual harness and accessible.
3. **The Link wiring.** Which `Link` variant + `as` for (a) the in-page Read more / Read less toggle (a `plain-*` variant rendered as a button) and (b) the external Source: Open Library link (rendered as an anchor with `target`/`rel`). Confirm both stay inside the primitive's API with no raw `<button>`/`<a>` re-skin.
4. **The exact cap number.** ~2000 — pin it (and confirm it is the new `capBlurb` default / `BLURB_MAX_CHARS`, with the cap tests updated to match).
5. **`openLibraryId` on the read path.** Confirm `openLibraryId` actually reaches `BookHeader`'s `book` prop on the live `/api/books/:slug` read (the survey shows it is Picked into `PublicBook` and mapped). If it does not, the small read-mapping addition is in scope; if it does, no API change.
6. **Baseline-update plan.** Confirm the fixture-blurb lengthening (in `apps/web/e2e/visual/fixtures/index.ts`) needed to exercise the clamped + Read more state, and that `book-detail.png` is the only baseline that changes, updated in its own labeled commit per ADR 0039.
7. **Re-backfill sequencing.** Confirm the epoch-bump + re-seed (cache hit) + re-index sequence and whether the cap change alone is enough to make the per-record fingerprint differ so the higher-capped blurbs re-publish (it should, since the content changes), reusing ADR 0051's runbook.

## Linked artifacts

- Depends on: Story 52 / ADR 0051 (blurb seeding, the raw-description cache, the epoch checkpoint, the existing display path).
- Relates to: ADR 0039 (visual-regression harness — the intentional-baseline-update path), ADR 0047 (the `Link` primitive), ADR 0033 (effective-book overlay — untouched).
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)

## Phase-2 note

This is Phase 2 work (post-MVP polish of the book detail page). It changes presentation and attribution of an existing field and is a deliberate visual change, so the labeled baseline update is expected rather than a red flag — consistent with the design-system epic's discipline (tokens + primitives, twelve guards green, deliberate visual changes get a labeled baseline per ADR 0039).
