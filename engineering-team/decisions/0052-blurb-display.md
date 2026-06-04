# ADR 0052: Book detail blurb display — clamp + inline Read more / Read less + Open Library source link

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/done/53-blurb-display.md`

**Accepted 2026-06-04.** Clamp `.bh-blurb` to **4 lines** (the `BookCard.css` `-webkit-line-clamp` pattern, guard-safe, no max-height); overflow detected via `scrollHeight > clientHeight` in `useLayoutEffect` + `ResizeObserver` (toggle shown only on overflow); Read more/Read less = `Link variant="plain-amber"` (default `<button>`, `aria-expanded`), in a new focused `<Blurb>` component; Source: Open Library link = `Link variant="plain-muted" as="a"` external (`https://openlibrary.org/works/{openLibraryId}`, bare id, `↗` glyph like Substack, no SVG, rendered only when present — `openLibraryId` already on `PublicBook`, no API change). Seeder `BLURB_MAX_CHARS` 700 → **2000** (logic/sanitizer unchanged). DELIBERATE labeled `book-detail.png` baseline update (lengthen the detail e2e fixture blurb + add its `openLibraryId`; regenerate in CI Docker; other baselines zero-diff). Re-backfill = epoch bump (→3) + cache-hit re-seed + re-index. Supersedes ADR 0051's cap-700 / no-read-more / no-baseline-update lines. Open-Qs resolved as the recommended defaults (clamp 4, source below the toggle in `<Blurb>`, fixture-detail-only, cap 2000, ResizeObserver).

## Context

Story 52 (ADR 0051) populated book blurbs from Open Library. The blurb now renders on the detail page: `BookHeader.tsx` (line 80) outputs `{book.blurb && <p className="bh-blurb">…</p>}`, and `.bh-blurb` is token-compliant (`BookHeader.css` lines 95–100). The data and the display both already exist. Story 53 refines *how* the blurb is shown and adds source attribution. It is presentation-and-attribution work on an existing field, **not** a data-model change.

Two problems surfaced once real blurbs landed (both confirmed against source during the survey):

1. **Under-cover whitespace.** `.bh` is a flex row (`BookHeader.css` line 8): a fixed cover `flex: 0 0 158px` / `height: 236px` (lines 14–23) on the left, a flexible `.bh-info` (`flex: 1`, lines 44–47) on the right. A long `.bh-blurb` (`font-size --u-font-size-14`, `line-height --u-leading-170`) stretches `.bh-info` taller than the 236px cover, so the left column ends well above the right and a band of empty space opens under the cover, above the "Claim this book" block. Clamping `.bh-blurb` collapsed shortens `.bh-info` below the cover height and removes the whitespace.
2. **Unsatisfying truncation.** ADR 0051 capped the seeded blurb at `BLURB_MAX_CHARS = 700` (`apps/seeder/src/description.ts` line 8) with a sentence/word-boundary cut + `…`. In the default view the hard cap reads as an arbitrary cut-off rather than a deliberate summary, and the full description is simply unavailable in the app.

### The binding user decisions (this ADR designs to exactly these)

- **Display = clamp + inline Read more / Read less** (NOT a modal, NO new primitive). The blurb shows collapsed to a few lines with an in-page disclosure toggle that expands/collapses it. The toggle is the existing `@unbnd/ui` `Link` primitive in its `plain-*` look, which renders a real `<button>` inside the primitive (correct a11y for an in-page disclosure). The toggle is shown **only when the blurb overflows the clamp**.
- **Full text in-app (Path A).** Raise the seeder blurb cap from 700 to ~2000 so Read more reveals the complete description in-app for the large majority of books (a rare book-length essay still gets capped). Because ADR 0051 caches the *raw* OL description (`DESC_CACHE_PATH`, Decision 5), re-running the backfill with the higher cap re-caps from cache and does **not** re-hit Open Library. Also add a **Source: Open Library ↗** link built from `openLibraryId`, honest attribution and a path to the canonical OL record.
- This is a **deliberate visual change** → a labeled `book-detail.png` baseline update per ADR 0039's intentional-change path; the fixture blurb is lengthened so the harness actually exercises the clamp + toggle.

### Acceptance criteria (quoted from the story, for confirmation)

- A long blurb renders clamped to ~3–4 lines with a visible **Read more** control.
- Activating **Read more** expands the full blurb inline; the control reads **Read less**; the control exposes correct `aria-expanded` (`false` collapsed, `true` expanded).
- A short blurb (no overflow) shows no control and the full short blurb.
- Collapsed, the right column is no taller than the cover for a typical long blurb (whitespace gone; verified by the labeled baseline).
- A book with `openLibraryId` shows a **Source: Open Library** link opening `https://openlibrary.org/works/{openLibraryId}` in a new tab with safe `rel`; absent gracefully when there is no `openLibraryId`.
- The seeder cap is raised from 700 to ~2000; `capBlurb`'s tests are updated; `sanitizeDescription` is unchanged; the seeder suite is green.
- All twelve `architecture-*` guards stay green; `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` green.
- `book-detail.png` is updated in its own clearly-labeled commit per ADR 0039; no other baseline changes.
- The operator re-backfill runbook is documented (epoch bump → cache hit → re-index).

### Constraints that bind this design

- **The twelve `architecture-*` guards** (`packages/ui/test/architecture-*.test.ts`): no raw color/type/spacing/shape/motion literal, no raw `<button>`, no raw `<svg>` in `apps/web/src`. The Read-more toggle and the Source link are built from the `@unbnd/ui` `Link` primitive; the `-webkit-line-clamp` integer is a unitless property, not a tokenized axis, so it is guard-safe (already proven by `BookCard.css`).
- **The design system is the single source of truth** (`@unbnd/ui`, ADR 0038): primitives + tokens; no new primitive, no new icon, no hex literal outside `tokens.css`.
- **ADR 0039 gate** (`maxDiffPixelRatio: 0`): every non-intended pixel diff fails the visual job. This story's *one* intended diff is `book-detail.png`, regenerated in the pinned Playwright Docker image and committed in a labeled commit; every other baseline stays zero-diff.
- **No AI-slop** in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- **PRD scope:** §5.4 Book Detail (the back-cover blurb and the page's information design); §6.2 lists `blurb` as the optional description field. This changes presentation and attribution of an existing field, not the data model. No PRD §11.3 out-of-scope item is touched.

### DList shapes touched

None. The blurb already lives in the kind-39999 record `content` (ADR 0051) and `openLibraryId` is already on the record; this ADR changes presentation and raises a seeder constant. No new kind, d-tag, tag, or word-wrapper shape. The Tapestry branch survey does not apply — this is front-end presentation + a seeder constant, no protocol shape.

### Verified survey (read directly against source, 2026-06-04)

- **Whitespace cause — confirmed.** `BookHeader.css`: `.bh` `display:flex`, cover `flex:0 0 158px`/`height:236px`, `.bh-info` `flex:1`. Long `.bh-blurb` outgrows the cover.
- **The clamp pattern is already guard-clean in this repo.** `BookCard.css` lines 57–60 (`.book-title`): `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;` plus `min-height:2.6em`. It passes all twelve guards (the line-clamp integer and the `em`-based `min-height` are not token-guarded literals). The same pattern extends to `.bh-blurb` for the collapsed state.
- **The `Link` primitive API — confirmed** (`packages/ui/src/components/Link.tsx`, exported from `@unbnd/ui` as `Link`, types `LinkProps<T>`/`LinkVariant`). `LinkVariant = "plain-amber" | "plain-muted" | "button-primary" | "button-secondary"`. It is polymorphic via `as?: T` (`Tag = (as ?? DEFAULT_TAG[variant])`). `DEFAULT_TAG` maps `plain-amber`/`plain-muted` → `"button"` and `button-*` → `"a"`. So:
  - **plain-* default to a real `<button>`** — exactly the in-page disclosure element for the Read-more toggle, rendered *inside* the primitive (outside the `apps/web/src` no-raw-`<button>` guard scope). The toggle passes `onClick`, `aria-expanded`, `type` etc. through `...rest`.
  - For an external **anchor** wearing the `plain-amber` look, pass `as="a"` to override the default `<button>` tag; `href`/`target`/`rel` flow through `...rest`.
  - `.u-link--plain-amber` (Link.css lines 43–56): `color --u-amber`, `font-weight --u-font-weight-medium`, `background:none; border:none; padding:0; font:inherit; cursor:pointer`, hover underline. `.u-link--plain-muted` (lines 64–75): muted text, ink on hover, `font-size --u-font-size-13`. Both reference only existing `var(--u-*)` tokens.
- **`openLibraryId` on the read path — confirmed present.** `apps/web/src/lib/api.ts` `PublicBook` declares `openLibraryId?: string` (line 112). `apps/api/src/books/effective.ts` Picks `openLibraryId` into `PublicBook` (line 33) and `toPublicBook` maps it (line 50); it survives the effective-book overlay merge. `BookDetail.tsx` passes the read `book` straight into `<BookHeader book={book} …>` (lines 162–163). **`openLibraryId` reaches `BookHeader`'s `book` prop on the live read — no API/read-mapping change is needed.**
- **The stored `openLibraryId` shape — confirmed bare.** `apps/seeder/src/openlibrary.ts` `workId()` (lines 15–17) strips the `/works/` prefix: `/works/OL45804W` → `OL45804W`; `mapWorkToBookRecord` sets `openLibraryId: workId(work.key)` (line 44). The stored value is the **bare** id (e.g. `OL45804W`), so the canonical URL is `https://openlibrary.org/works/${openLibraryId}` with no extra prefixing.
- **The existing external-link affordance.** `WhereToRead.tsx` (lines 20–31) renders a trailing `↗` (U+2197) inside an `aria-hidden="true"` span, with `target="_blank" rel="noreferrer noopener"`; `ProfileMe.tsx`/`Profile.tsx` render "Writes on Substack ↗" the same way. The `↗` is a **text glyph, not an SVG**, so it is guard-safe (no `<svg>` introduced). These existing sites use bespoke raw `<a>` classes (`wtr-link`, the Substack link) that ADR 0047 deliberately left out of `Link`'s scope — they are pre-existing and untouched. A *new* link, by the design-system discipline, goes through the `Link` primitive; the `↗` affordance is reproduced as a text glyph for consistency.
- **The cap to raise.** `apps/seeder/src/description.ts` `export const BLURB_MAX_CHARS = 700;` (line 8) is the default `max` of the pure `capBlurb` (line 90). `apps/seeder/test/description.test.ts` pins it: `expect(BLURB_MAX_CHARS).toBe(700)` (line 127) and several `<= 700` length assertions (lines 144, 145…). `sanitizeDescription` (lines 30–79) is independent of the cap and stays untouched.
- **The visual baseline.** Spec `apps/web/e2e/visual/visual.spec.ts`; the detail baseline is `apps/web/e2e/visual/visual.spec.ts-snapshots/book-detail.png`; route map + fixtures in `apps/web/e2e/visual/fixtures/index.ts`. The current fixture blurb (`fixtures/index.ts` lines 49–51, in the shared `book()` factory) is ~2 lines — too short to overflow the clamp, so as-is it would exercise neither the clamp nor the Read-more toggle. The fixture blurb must be lengthened so the baseline captures the collapsed-clamped state with the toggle visible.
- **Re-backfill mechanics (ADR 0051).** The checkpoint is epoch-namespaced (`CHECKPOINT_EPOCH`, ADR 0051 Decision 3) and the per-record fingerprint covers `blurb`; the raw OL description is disk-cached (`DESC_CACHE_PATH`, Decision 5). Bumping the epoch re-publishes every record once (same d-tag → replace, no dupes); raising the cap changes the published `blurb`, so the fingerprint differs and the record re-publishes; the cache means the higher cap re-caps from stored raw text without re-hitting OL. Re-index is the existing `index` compose profile, no code change.

## Options considered

The load-bearing decisions are (1) the clamp line count + collapse mechanism, (2) the overflow-detection approach, (3) the toggle's `Link` wiring and component shape, (4) the Source link's `Link` wiring + placement, and (5) the cap number. The options frame (1)–(3); (4) and (5) follow from the survey and the binding decisions.

### Option A — Clamp via `-webkit-line-clamp` (collapsed class), measured overflow detection in a small extracted `<Blurb>` component, toggle and source link both through `Link` (CHOSEN)

A focused `<Blurb>` sub-component owns the blurb's collapsed/expanded state, the overflow measurement, the toggle, and the source link, so `BookHeader` stays a thin layout container. The collapsed state applies a `.bh-blurb--clamped` class (the `-webkit-box` / `-webkit-line-clamp` pattern, mirrored from `BookCard.css`); expanding removes the class. Overflow is detected by measuring `scrollHeight > clientHeight` on the clamped paragraph via a ref in a `useLayoutEffect`, re-measured on blurb change and on resize; the toggle renders only when `hasOverflow` is true. The toggle is `Link variant="plain-amber"` (its default `<button>`) carrying `aria-expanded` and an `onClick` that flips `expanded`. The source link is `Link variant="plain-muted" as="a"` with `href`/`target="_blank"`/`rel="noreferrer noopener"` and a trailing `↗` text glyph.

- Pros: byte-for-byte reuses the repo's existing guard-clean clamp pattern; the line-clamp integer is not a token-guarded literal; measurement is robust (it reflects the *rendered* layout, not a char-count guess, so it is correct across font metrics, zoom, and the 620px responsive breakpoint); the extracted `<Blurb>` keeps `BookHeader` readable and gives the Tester a focused unit surface; both new controls go through `Link`, so the twelve guards stay green with no new primitive and no raw `<button>`/`<a>`/`<svg>`. The toggle is a real `<button>` (correct a11y for an in-page disclosure) and the source link is a real `<a>` (correct for navigation).
- Cons: a measured-overflow component must re-measure on resize (a `ResizeObserver` or a window-resize listener) and on blurb change, a small amount of effect wiring; in the deterministic visual harness the measurement runs once at the captured viewport (1280×800), which is exactly what we want the baseline to capture. Mitigated below by pinning the measurement to `useLayoutEffect` (pre-paint, no flicker) and a `ResizeObserver` on the paragraph.

### Option B — Clamp via a tokenized `max-height` + a char-count overflow heuristic

Collapse by setting a `max-height` (computed from a line-height token × line count) and show the toggle when `book.blurb.length` exceeds a threshold.

- Pros: no measurement effect; the toggle visibility is a pure render-time check, trivially deterministic.
- Cons: a `max-height` pixel/`em` value is a shape/spacing literal that the guards police (a raw `max-height` is exactly the kind of geometry literal `architecture-shape-literals`/`architecture-spacing-literals` exist to catch; expressing it as a token introduces a one-off token for a value the `-webkit-line-clamp` integer expresses for free). A char-count heuristic is wrong at the boundary: 3–4 lines of a wide-glyph or CJK blurb overflow at a different char count than a narrow-glyph one, and the 620px responsive breakpoint changes the wrap, so a fixed threshold both shows the toggle when no overflow exists and hides it when it does. Rejected: it trades a correct measurement for a guard-fragile geometry literal and a heuristic that mis-fires at the exact boundary the AC tests.

### Option C — A new `Disclosure`/`ReadMore` design-system primitive

Add a reusable expand/collapse primitive to `@unbnd/ui`.

- Pros: reusable if other surfaces later need a clamp + disclosure.
- Cons: the binding decision is explicitly **no new primitive**; the `Link` primitive already renders the correct `<button>` element for an in-page toggle, so the only genuinely new code is the clamp CSS + the measurement, which belong at the single call site (the book detail blurb). A primitive for one caller is premature abstraction and widens the design-system surface and its guard/baseline obligations for no current second consumer. Rejected per the binding decision and YAGNI.

## Decision

We choose **Option A.** It reuses the repo's already-guard-clean `-webkit-line-clamp` clamp pattern (no geometry literal, no new token), detects overflow by measuring the *rendered* layout (correct at the AC boundary and across the responsive breakpoint, unlike Option B's char-count heuristic), keeps the toggle a real `<button>` and the source link a real `<a>` both through the existing `Link` primitive (twelve guards green, no new primitive — unlike Option C), and isolates the new behavior in a small `<Blurb>` sub-component so `BookHeader` stays a thin layout container and the Tester gets a focused unit surface. The seeder cap rises to **2000**, the visual baseline is updated deliberately in a labeled commit, and the operator re-runs the existing ADR-0051 epoch-bump backfill.

### 1. The clamp — 4 lines, `-webkit-line-clamp` on a collapsed class

- **Line count: 4** (the upper end of the story's "roughly three to four"). At `.bh-blurb`'s `font-size --u-font-size-14` and `line-height --u-leading-170`, four lines occupy roughly `14px × 1.7 × 4 ≈ 95px`. Stacked under `.bh-title` (~32px incl. margin), `.bh-author`, `.bh-meta`, and `.bh-tags`, the collapsed `.bh-info` stays comfortably **at or below** the 236px cover height for a typical long blurb, which is what removes the under-cover whitespace (AC-4). Four lines reads as a deliberate summary, not a one-line stub. (Three would clamp tighter but reads thin against the title/meta stack above it; four is the better balance and still ≤ cover height. The Implementer holds the latitude to drop to 3 only if a measured render shows 4 lines pushing `.bh-info` past the cover for the fixture blurb — but 4 is the pinned target and the expected value.)
- **Mechanism:** a `.bh-blurb--clamped` modifier class applied in the collapsed state, carrying the `BookCard.css` pattern verbatim:
  ```css
  .bh-blurb--clamped {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  ```
  The base `.bh-blurb` (font-size/line-height/color/margin) is unchanged. Expanding **removes** the modifier class (no `max-height` pixel hack, no animated height). The `-webkit-line-clamp: 4` integer is a unitless property, not a tokenized axis, so it is guard-safe — exactly as `BookCard.css`'s `-webkit-line-clamp: 2` already is. No new token, no raw color/type/spacing/shape/motion literal.
- **No transition requirement.** Expand/collapse is an instant class toggle. If any transition is ever added it must use existing motion tokens (`--u-duration-*` / `--u-ease-*`); none is required here and none is added (animating a `-webkit-box` height is unreliable anyway).

### 2. Overflow detection — measure `scrollHeight > clientHeight` while clamped

Show the toggle **only** when the clamped blurb actually overflows:

- A `ref` on the `.bh-blurb` paragraph. In a `useLayoutEffect` (pre-paint, so the toggle never flickers in/out after first paint), with the clamp class applied, read `el.scrollHeight > el.clientHeight` and set a `hasOverflow` boolean state. `scrollHeight` is the full content height; `clientHeight` is the clamped (visible) height; `>` means the content exceeds the clamp, i.e. there is more to read.
- **Re-measure triggers:** (a) on `book.blurb` change (effect dependency on the blurb text — a different book or an overlay blurb re-measures); (b) on resize, via a `ResizeObserver` attached to the paragraph (the 620px responsive breakpoint re-wraps the blurb, changing whether it overflows). The observer is disconnected on unmount. A window-`resize` listener is the acceptable fallback if a `ResizeObserver` is undesirable, but the `ResizeObserver` on the element is preferred (it fires on the element's own box changes, not only window resizes).
- **Measure while clamped:** `hasOverflow` is always measured against the clamped height, independent of the `expanded` state — so once expanded (clamp removed), `hasOverflow` stays true and the **Read less** control stays rendered. Concretely: keep the clamp class bound to `!expanded`, but compute overflow from a measurement taken with the clamp applied (e.g. measure on mount/blurb-change/resize before the user expands; the first `useLayoutEffect` runs while collapsed). The toggle renders iff `hasOverflow`.
- This is deterministic for the visual harness: at the fixed 1280×800 capture viewport the measurement runs once and resolves identically every run; the lengthened fixture blurb overflows 4 lines, so the baseline captures the clamped blurb **with the Read more control visible**.

### 3. The Read more / Read less toggle — `Link variant="plain-amber"` (its default `<button>`), in a `<Blurb>` sub-component

- Extract a focused **`<Blurb>`** component (`apps/web/src/components/Blurb.tsx`) that owns the blurb paragraph, the `expanded`/`hasOverflow` state, the measurement effect, the toggle, and the source link. `BookHeader` renders `<Blurb text={book.blurb} openLibraryId={book.openLibraryId} />` in place of the current inline `{book.blurb && <p className="bh-blurb">…</p>}`, keeping `BookHeader` a thin layout container. (The current `hasAuthorOverlay` "From the author" attribution stays in `BookHeader`, rendered after `<Blurb>`, unchanged.)
- The toggle is the `@unbnd/ui` `Link` primitive in its `plain-amber` look, rendered as its **default `<button>`** (no `as` override needed — `DEFAULT_TAG["plain-amber"] === "button"`):
  ```tsx
  <Link
    variant="plain-amber"
    aria-expanded={expanded}
    onClick={() => setExpanded((v) => !v)}
  >
    {expanded ? "Read less" : "Read more"}
  </Link>
  ```
  `aria-expanded`, `onClick`, and `type` flow through the primitive's `...rest`. The element is a real `<button>` rendered inside `Link` (in `packages/ui`, outside the `apps/web/src` no-raw-`<button>` guard scope), so the guard stays green. `aria-expanded` is `false` collapsed and `true` expanded (AC). The label is **"Read more"** / **"Read less"** — plain, two words, no AI-slop (no em dash, no exclamation, no filler).
- Token-styled by the `plain-amber` skin (amber text, medium weight, underline-on-hover) — no raw literals at the call site. Any layout residue (e.g. a small top margin separating the toggle from the blurb) is an additive layout-only class using spacing tokens (`--u-space-*`), per ADR 0038 §2.

### 4. The Source: Open Library link — `Link variant="plain-muted" as="a"`, external, built from `openLibraryId`

- Rendered only when `book.openLibraryId` is present (graceful absence otherwise — AC-6). Built directly from the bare stored id:
  ```tsx
  {openLibraryId && (
    <Link
      variant="plain-muted"
      as="a"
      href={`https://openlibrary.org/works/${openLibraryId}`}
      target="_blank"
      rel="noreferrer noopener"
    >
      Source: Open Library <span aria-hidden="true">↗</span>
    </Link>
  )}
  ```
  `as="a"` overrides `plain-muted`'s default `<button>` tag so it renders a real navigational `<a>` (the correct element for an external link); `href`/`target`/`rel` flow through `...rest`. The `↗` (U+2197) is a **text glyph in an `aria-hidden` span**, mirroring the existing `WhereToRead`/Substack external-link affordance — it introduces **no `<svg>`**, so the no-raw-`<svg>` guard stays green. `rel="noreferrer noopener"` matches the repo's existing external-link safety (`WhereToRead.tsx`). The label **"Source: Open Library"** is honest attribution, no slop.
- **Placement:** inside `<Blurb>`, on its own line **below the blurb and the Read more / Read less toggle** (the toggle, then the source link, in a small footer row under the blurb). Rationale: the toggle is an action on the blurb text and belongs immediately under it; the source attribution sits just below as a quiet, persistent provenance line (it is shown whenever `openLibraryId` exists, independent of overflow/expanded state). Keeping both inside `<Blurb>` co-locates all blurb-related affordances and keeps `BookHeader` clean. (Alternative considered: putting the source link in `.bh-meta`. Rejected — the meta row is structured catalog facts (year, pages, ISBN); a clickable external provenance link reads better adjacent to the prose it sources.)

### 5. The seeder cap — `BLURB_MAX_CHARS = 2000`

- Raise `BLURB_MAX_CHARS` from `700` to **`2000`** (`apps/seeder/src/description.ts` line 8). 2000 chars ≈ 320–340 words — a few full paragraphs, enough to carry the complete description for the large majority of OL works, while a rare book-length essay still gets a clean cap. `capBlurb`'s logic is **unchanged**: the same sentence-then-word-boundary cut, the same single `…`, the same "never exceed `max`, never mid-word" rule — only the default `max` constant changes. `sanitizeDescription` is **unchanged** (independent of the cap). The number is the Architect's pin; the Implementer holds latitude to land at a nearby round value (e.g. 1800–2200) only if a Tester/observer reason emerges, but **2000 is the pinned target**.

### 6. The visual baseline — deliberate, labeled `book-detail.png` update

- **Lengthen the fixture blurb** in `apps/web/e2e/visual/fixtures/index.ts`. The shared `book()` factory (lines 44–57) sets the same short ~2-line blurb on every fixture book. Replace that blurb string with a **multi-paragraph blurb long enough to overflow the 4-line clamp** at the 1280×800 capture viewport, so `book-detail.png` captures the collapsed-clamped blurb **with the Read more control visible**. (The fixture book also flows into Home/Search/Profile fixtures; those screens render the blurb in a `BookCard`/search context that already clamps to 2 lines and does not use `<Blurb>`, so a longer blurb there is harmless — but the Tester must confirm those baselines remain zero-diff after the fixture change, since the card clamp already truncates. If a longer shared blurb perturbs a non-detail baseline, the cleaner option is to give **only the detail fixture book** (`THE_BOOK` / `FIXTURE_SLUG`, lines 68–72) the long blurb and leave the others short — the Tester picks the minimal-perturbation approach; the **recommended** path is a long blurb on the detail fixture only, so `book-detail.png` is the sole intended diff.)
- **Add the `openLibraryId`** to the detail fixture book (`THE_BOOK` / `BOOK_GET`) so the **Source: Open Library** link renders in the baseline (e.g. `openLibraryId: "OL45804W"`). Without it the source link is absent from the baseline and the AC-5 path is uncaptured.
- **Regenerate `book-detail.png`** in the pinned `mcr.microsoft.com/playwright:v<pinned>-jammy` image via the documented `test:visual:update` command (ADR 0039), and commit it in **its own clearly-labeled commit** stating the intended visual delta (clamped blurb + Read more control + Source link) and the brand-rule review. **`book-detail.png` is the only baseline that changes**; every other baseline stays zero-diff. The orchestrator runs the CI baseline regeneration (no local Docker) per the ADR-0039 workflow.

### 7. Re-backfill (operator runbook, reusing ADR 0051)

After merge, the operator re-runs the existing ADR-0051 backfill so the live catalog carries the fuller (2000-cap) blurbs:

1. Pull the fresh seeder image: `docker compose --profile seed pull seeder`.
2. Re-run with a **bumped epoch**: `CHECKPOINT_EPOCH=3 docker compose --profile seed run --rm seeder` (epoch 2 was the ADR-0051 blurb backfill; this is the next epoch). The epoch bump makes the seeder treat every record as not-yet-done. Because the raised cap changes the published `blurb`, the **per-record fingerprint differs**, so every record with a longer-than-700 raw description re-publishes (same slug d-tag → replace, no dupes); records whose blurb is unchanged by the cap re-publish nothing on a second pass. The **raw-description cache** (`/data/desc-cache`) means the higher cap re-caps from stored raw text **without re-hitting Open Library**.
3. Re-index: `docker compose --profile index run --rm indexer` (the indexer already maps `blurb`; upsert by `id = slug` is idempotent).
4. Verify on the live detail page: a long-description book shows the clamped blurb + Read more + Source link; a short one renders without the toggle.

The cap change alone is sufficient to make the fingerprint differ for affected records, so the epoch bump + re-seed (cache hit) + re-index is the complete sequence; no manual file surgery.

## Consequences

- **Enables:** the under-cover whitespace is removed (collapsed `.bh-info` ≤ cover height); the full description is readable in-app via Read more; honest Open Library provenance via the Source link; the existing guard-clean clamp pattern and the existing `Link` primitive are reused with no new primitive and no new token.
- **Constrains / makes harder:** `<Blurb>` adds a measured-overflow effect (a `useLayoutEffect` + `ResizeObserver`), the one piece of new runtime logic; it is isolated to one component. The detail page now depends on the clamp rendering correctly across the 620px responsive breakpoint (the `ResizeObserver` re-measure handles it). The fixture blurb is longer, so the Tester must keep the non-detail baselines zero-diff (recommended: long blurb on the detail fixture only).
- **New debt / follow-ups:** none intended. The `<Blurb>` component is a clean, reusable shape if another long-text surface ever needs a clamp + disclosure (but it is not promoted to a primitive now — YAGNI). Edition-description fallback remains the ADR-0051 future non-goal (out of scope). The cap number may want one tuning pass after observing real OL output at 2000 — cheap, the raw-description cache avoids re-fetch.
- **Affects existing fixtures?** Yes — **e2e/visual fixtures only**: `apps/web/e2e/visual/fixtures/index.ts` (lengthen the detail fixture blurb; add `openLibraryId` to the detail fixture book) and **one** committed baseline `apps/web/e2e/visual/visual.spec.ts-snapshots/book-detail.png` (deliberate, labeled). No app data fixture (`apps/web/src/data/*`) changes; no other baseline changes. The seeder `description.test.ts` cap assertions change (Tester's job — see Implementation notes).
- **New dependency?** No. The clamp is CSS; the toggle and source link use the existing `@unbnd/ui` `Link` primitive; the `↗` is a text glyph (no icon library, no SVG). No new runtime or dev dependency.
- **PRD section change required?** No. PRD §5.4 already describes the back-cover blurb and the page's information design; §6.2 already lists `blurb` as optional. This refines presentation and adds attribution of an existing field. Phase-2 polish; recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors. The Architect is read-only on source; these are targets for the Implementer.

- **New: `apps/web/src/components/Blurb.tsx` (+ `Blurb.css`).**
  - Props: `{ text: string; openLibraryId?: string }`.
  - State: `expanded: boolean` (default `false`); `hasOverflow: boolean` (default `false`).
  - Ref on the `.bh-blurb` paragraph; `useLayoutEffect` measuring `el.scrollHeight > el.clientHeight` (clamp class applied) → `setHasOverflow`; deps `[text]`. A `ResizeObserver` on the paragraph re-runs the measurement on resize; disconnect on unmount.
  - Render: `<p ref className={"bh-blurb" + (!expanded ? " bh-blurb--clamped" : "")}>{text}</p>`; then a footer row: the **Read more / Read less** `<Link variant="plain-amber" aria-expanded={expanded} onClick={…}>` rendered **only when `hasOverflow`**; then the **Source: Open Library ↗** `<Link variant="plain-muted" as="a" href={`https://openlibrary.org/works/${openLibraryId}`} target="_blank" rel="noreferrer noopener">` rendered **only when `openLibraryId`** is present.
  - `Blurb.css`: `.bh-blurb--clamped` (the `-webkit-box`/`-webkit-line-clamp:4` block above); a layout-only footer-row class for the toggle/source spacing using `--u-space-*` tokens. No raw color/type/spacing/shape/motion literal; references only `var(--u-*)`. (Move the existing `.bh-blurb` base rule from `BookHeader.css` lines 95–100 into `Blurb.css`, or keep it in `BookHeader.css` and add only the modifier + footer classes in `Blurb.css` — the Implementer keeps the base `.bh-blurb` declarations byte-identical so the *expanded* blurb renders exactly as today.)
- **Edit: `apps/web/src/components/BookHeader.tsx`** — replace the inline `{book.blurb && <p className="bh-blurb">{book.blurb}</p>}` (line 80) with `{book.blurb && <Blurb text={book.blurb} openLibraryId={book.openLibraryId} />}`. Import `Blurb`. The `hasAuthorOverlay` "From the author" attribution (line 81) stays in `BookHeader`, after `<Blurb>`, unchanged. Import `Link` from `@unbnd/ui` **only inside `Blurb.tsx`** (not `BookHeader`).
- **No API / read-mapping change.** `openLibraryId` already reaches `BookHeader`'s `book` prop (`PublicBook.openLibraryId`, mapped in `apps/api/src/books/effective.ts` and passed through `BookDetail.tsx`). Confirmed; nothing to add.
- **Edit: `apps/seeder/src/description.ts`** — change `export const BLURB_MAX_CHARS = 700;` (line 8) to `2000`. `capBlurb` and `sanitizeDescription` are otherwise unchanged. Update the doc-comment "~110-120 words, a true back-cover length" to the new range (~320–340 words) without AI-slop.
- **Tests the Tester updates** (`apps/seeder/test/description.test.ts`): the cap pin `expect(BLURB_MAX_CHARS).toBe(700)` (line 127) → `toBe(2000)`; the `<= 700` length bounds in the over-cap tests (lines 144–145, and the "word ".repeat(400) ≈2000-char input on line 142 must be regenerated longer so it still overflows the 2000 cap — e.g. `"word ".repeat(800)`); the custom-`max` test (lines 148–154) is unaffected (passes an explicit `max`). `sanitizeDescription` tests are unchanged. The under-cap test's `"a".repeat(700)` (line 136) is now under the cap and returns unchanged — still correct, but the Tester should add an at-exact-cap case at 2000.
- **Edit (Tester/Implementer): `apps/web/e2e/visual/fixtures/index.ts`** — give the detail fixture book (`THE_BOOK` / `FIXTURE_SLUG`) a multi-paragraph blurb long enough to overflow the 4-line clamp at 1280×800, and add `openLibraryId` to it (e.g. `"OL45804W"`) so the Source link renders in the baseline. Recommended: long blurb on the detail fixture only, leaving the other fixture books' short blurb, so only `book-detail.png` changes.
- **Baseline (orchestrator): `apps/web/e2e/visual/visual.spec.ts-snapshots/book-detail.png`** — regenerate in the pinned Playwright Docker image via `test:visual:update`; commit in its own clearly-labeled commit per ADR 0039 (message states the intended visual delta + the brand-rule review). Confirm every other baseline is zero-diff. The orchestrator runs the CI baseline regeneration (no local Docker).
- **Operator runbook:** documented in §7 above (epoch bump → seeder cache-hit re-publish → re-index). Reuses the ADR-0051 runbook; only the epoch number advances.

## Out of scope

- **No modal / Modal primitive.** The disclosure is inline only.
- **No new design-system primitive.** The toggle and the source link both use the existing `@unbnd/ui` `Link`; the clamp is CSS at the call site. No `Disclosure`/`ReadMore` primitive.
- **No raw `<button>`, no raw `<a>` re-skin, no raw `<svg>`, no raw color/type/spacing/shape/motion literal** introduced in `apps/web/src`. The `↗` is a text glyph; the clamp integer is a unitless property; both new controls go through `Link`.
- **No schema change.** The blurb already lives in kind-39999 `content`; `openLibraryId` already on the record; the cap is a seeder constant. No new kind, d-tag, or tag.
- **No API / read-mapping change.** `openLibraryId` already reaches the read path.
- **No effective-book / author-overlay change.** The verified-author blurb overlay (ADR 0033 §5) is untouched; the clamp/expand/source link apply to whatever effective blurb is rendered.
- **No catalog-size expansion.** This is display + cap + re-backfill of the existing catalog; the ~10K expansion stays a separate story. No PRD §11.3 out-of-scope item (payments, hosting, ebook sales, social feed, reading progress, federation) is touched.
- **No edition-description fallback** (ADR 0051 left it a future enhancement; still out).
- **No animation requirement.** Expand/collapse is an instant class toggle; any future transition must use existing motion tokens.

## Supersession

This ADR **supersedes** the following lines of **ADR 0051** (which remains Accepted for everything else — the seeder fetch/sanitize/cap split, the epoch checkpoint, the raw-description cache, the fingerprint, the re-backfill mechanics):

- ADR 0051's pinned cap **`BLURB_MAX_CHARS = 700`** is superseded by **`2000`** (this ADR §5). `capBlurb`'s cut logic is unchanged; only the constant changes.
- ADR 0051's "**No read-more / expander UI and no full-description storage — capped to back-jacket length**" (Out of scope / the binding decision in its Context) is superseded by the clamp + inline Read more / Read less of this ADR (§1–§3). The full description is now revealed in-app via Read more (Path A), not stored separately.
- ADR 0051's "**No e2e baseline update — the existing fixture already covers `.bh-blurb`**" (Out of scope / Consequences) is superseded by the deliberate, labeled `book-detail.png` baseline update of this ADR (§6), with the fixture blurb lengthened to exercise the clamp + toggle.

## Open questions for the gate

- **OQ-1 (clamp line count).** Pinned at **4** lines (story's "three to four"). Confirm 4 over 3: 4 reads as a deliberate summary and still keeps collapsed `.bh-info` ≤ the 236px cover for a typical long blurb; the Implementer drops to 3 only if a measured render shows 4 lines exceeding the cover for the fixture blurb. Confirm 4 is acceptable as the pinned target.
- **OQ-2 (Source link placement).** Recommended **below the blurb and the Read more toggle**, inside `<Blurb>` (a quiet provenance line under the prose), not in `.bh-meta`. Confirm this over a `.bh-meta` placement.
- **OQ-3 (fixture-blurb scope).** Recommended: lengthen **only the detail fixture book's** blurb (and add its `openLibraryId`), leaving the other fixture books short, so **`book-detail.png` is the sole intended baseline diff**. Confirm over a shared-blurb change that could perturb Home/Search/Profile baselines (which the Tester would then have to re-verify zero-diff).
- **OQ-4 (cap number).** Pinned at **2000**. Confirm 2000 as the new `BLURB_MAX_CHARS` (Implementer latitude only to a nearby round value if a Tester/observer reason emerges).
- **OQ-5 (overflow re-measure mechanism).** Recommended a `ResizeObserver` on the paragraph (re-measures on the 620px breakpoint re-wrap) over a window-`resize` listener. Confirm the `ResizeObserver` approach.
