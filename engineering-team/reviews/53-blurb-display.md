# Review: Story 53 — Book detail blurb display (clamp + Read more / Read less + Open Library source link)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-04
**Story:** `engineering-team/stories/done/53-blurb-display.md`
**ADR:** `engineering-team/decisions/0052-blurb-display.md` (Accepted)
**Test plan:** `engineering-team/stories/done/53-blurb-display.test-plan.md`
**Diff:** `git diff origin/main...HEAD` — branch `story-53-blurb-display`, PR #98.
Commits: `0ef0d5d` ADR, `64e8c71` tests (Tester), `a6b6494` implementation (Implementer), `e1d6751` baseline (labeled).

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS**. All 11 workspace projects Done (apps/web, apps/seeder, apps/api, packages/ui, … all clean).
- [x] `pnpm --filter @unbnd/web test` — **PASS**. 53 files / **310 tests**, incl. `test/components/blurb.test.tsx` (**10 tests**). (A happy-dom `AbortError` teardown line prints to stderr; it is pre-existing fetch-teardown noise, not a failure — every test passes.)
- [x] `pnpm --filter @unbnd/seeder test` — **PASS**. 7 files / **51 tests** (incl. `pins the cap constant at 2000` and the at-cap 2000-char + grown overflow inputs).
- [x] `pnpm --filter @unbnd/ui test` — **PASS**. 13 files / 20 tests; **all 12 `architecture-*` guards GREEN** (button-literals, svg-literals, color/type/spacing/shape/motion-literals, token-refs, page-frame, palette-sync, breakpoints, theme-completeness).
- [x] `pnpm --filter @unbnd/web build` — **PASS**. `tsc --noEmit && vite build`, 461 modules, built in ~0.6s.
- [x] `gh pr checks 98` — **all green**: `Typecheck, test, build` pass; `Validate Caddyfile` pass; **`Visual regression` pass** (zero-diff against the new `book-detail.png` baseline; all other baselines zero-diff).
- [ ] _Lint not configured — skipped._

## Test integrity (verified independently)

- The Tester authored the Story-53 tests in commit `64e8c71`: `apps/web/test/components/blurb.test.tsx`, the `apps/seeder/test/description.test.ts` cap changes, and the test-plan. **The Implementer commit `a6b6494` touched ZERO test files** — its file set is exactly `apps/seeder/src/description.ts`, `apps/web/e2e/visual/fixtures/index.ts`, `Blurb.css`, `Blurb.tsx`, `BookHeader.css`, `BookHeader.tsx`. No weakening, no modification.
- **No `packages/ui/test/*` guard and no `tokens.test.ts` changed anywhere on the branch** (`git diff --name-only origin/main...HEAD | grep -E 'packages/ui|tokens\.test'` → none).
- The baseline PNG is in its own clearly-labeled commit (`e1d6751`), separate from implementation, message states the intended delta and that only `book-detail.png` changes.
- One observation (non-blocking): ADR §Implementation-notes suggested the prop name `text`; the component uses `blurb`. The Tester's tests pin `blurb=`/`openLibraryId=`, so the Implementer conformed to the authoritative test contract, not the non-binding ADR note. Behaviorally identical; not an issue.

## Spec adherence (every AC has a passing test)

- [x] Long blurb → clamped + visible Read more — blurb tests (`aria-expanded=false` + clamp modifier class).
- [x] Read more expands inline → Read less, `aria-expanded` flips, clamp removed; Read less collapses — blurb tests (toggle + second click).
- [x] Short blurb (no overflow) → no control, full short blurb visible — blurb tests.
- [x] `openLibraryId` present → external `Source: Open Library` link to `https://openlibrary.org/works/{id}`, new tab, safe `rel` — blurb test asserts `role="link"` (a real `<a>`).
- [x] No `openLibraryId` → source link absent — blurb test.
- [x] No blurb → component renders nothing (`null`) — blurb test (`.bh-blurb` absent).
- [x] Seeder cap 700 → 2000; `capBlurb` tests updated; `sanitizeDescription` unchanged — seeder suite green.
- [x] Twelve guards green; typecheck/test/build green — confirmed above.
- [x] `book-detail.png` updated deliberately in its own labeled commit; no other baseline change — confirmed.
- [x] Collapsed right column ≤ cover (whitespace gone) — not unit-testable; verified by the deliberate baseline + green Visual-regression check (per test-plan / ADR §6).
- Re-backfill runbook is documented in ADR 0052 §7 (epoch 3 bump → cache-hit re-seed → re-index). Operator step, post-merge; not a code artifact.

## Design-system compliance (critical — this added new UI)

- **No raw `<button>`** in `apps/web/src`: the Read-more toggle is `Link variant="plain-amber"` (default `<button>` rendered *inside* the `@unbnd/ui` primitive, outside the app-code guard scope). `grep` for `<button` in `Blurb.tsx` → none.
- **No raw `<svg>`**: the `↗` (U+2197) is a **text glyph** inside an `aria-hidden="true"` span. `grep` for `<svg` → none. `architecture-svg-literals` guard green.
- **No raw `<a>` re-skin**: the Source link is `Link variant="plain-muted" as="a"` external. `grep` for `<a ` in `Blurb.tsx` → none.
- **No raw color/type/spacing/shape/motion literal in `Blurb.css`**: only `var(--u-*)` tokens (`--u-font-size-14`, `--u-leading-170`, `--u-ink-tint-74`, `--u-space-8/12/6`). The `-webkit-line-clamp: 4` is a unitless integer (guard-safe, same as `BookCard.css`'s `:2`). `grep` for hex/px/rem/em → none.
- All 12 `architecture-*` guards GREEN (run directly).

## ADR / component-behavior conformance

- Clamp to **4 lines** via `.bh-blurb--clamped` (the `-webkit-box` / `-webkit-line-clamp` BookCard pattern), bound to `!expanded`. Expanding removes the class. No `max-height`, no animation.
- Overflow detected via **`scrollHeight > clientHeight`** (NOT `getBoundingClientRect`) in a `useLayoutEffect`, re-measured by a **`ResizeObserver`** on the paragraph, **guarded** for absence (`if (typeof ResizeObserver === "undefined") return;`), disconnected on unmount. Deps `[blurb]`.
- Read more/Read less toggle shown **only on overflow** (`hasOverflow &&`); `aria-expanded` flips false↔true; label flips "Read more"↔"Read less"; clamp class toggles.
- Source link from `openLibraryId` → `https://openlibrary.org/works/${openLibraryId}`, `target="_blank"`, `rel="noreferrer noopener"`, rendered only when present.
- Returns `null` when no blurb.
- Wired into `BookHeader.tsx`: the inline `<p className="bh-blurb">` replaced with `<Blurb blurb={book.blurb} openLibraryId={book.openLibraryId} />`; the `hasAuthorOverlay` "From the author" attribution stays in `BookHeader`, after `<Blurb>`, unchanged.
- `.bh-blurb` base rule **moved** from `BookHeader.css` to `Blurb.css` **byte-identical** (same four declarations, same tokens) — confirmed only one `.bh-blurb {` definition exists now (in `Blurb.css`); no duplicate, no lost styling. The expanded blurb renders exactly as before.
- `openLibraryId` reaches the header: already on `PublicBook` (`apps/web/src/lib/api.ts:112`); passed through `BookDetail.tsx` → `BookHeader` → `Blurb`.

## The seeder cap

- `BLURB_MAX_CHARS` **700 → 2000** in `apps/seeder/src/description.ts` (the only logic change is the constant + its doc-comment). `capBlurb` and `sanitizeDescription` bodies **unchanged**. Seeder suite (51) green, including the cap pin and the grown over-cap/at-cap inputs the Tester adjusted so they still genuinely overflow 2000.

## The deliberate baseline (ADR 0039 discipline)

- `git diff --name-only origin/main...HEAD` shows **only `apps/web/e2e/visual/visual.spec.ts-snapshots/book-detail.png`** among the baselines (the other 5 PNGs untouched).
- The e2e fixture change (`apps/web/e2e/visual/fixtures/index.ts`) is **the detail book only** (`THE_BOOK`): a lengthened multi-paragraph blurb that overflows the 4-line clamp + `openLibraryId: "OL45804W"`. `HOME_BOOKS` untouched.
- The baseline is its own clearly-labeled commit (`e1d6751`).
- **`gh pr checks 98` → Visual regression PASS** = zero-diff against the new baseline, all other baselines zero-diff. This green re-run + the new baseline are the evidence the render is correct (clamp + controls + source link, whitespace resolved); the reviewer cannot render locally.

## Scope

- No schema/API change — `openLibraryId` already on `PublicBook`; `git diff` over `apps/api`/`packages/schemas` shows **no new field**.
- No modal, no overlay/effective-book change, no new primitive, no `packages/ui/src` touched (`git diff --name-only` over those paths → none).
- Only `apps/web` (Blurb + BookHeader) + `apps/seeder` (cap) + the e2e fixture + the one baseline. No PRD §11.3 out-of-scope item touched.

## Things tests can't catch

- [x] No secrets, no `console.log`/debug, no commented-out code in the new source.
- [x] `ResizeObserver` absence guarded; observer disconnected on unmount.
- [x] External link uses `rel="noreferrer noopener"` (matches repo external-link safety).
- [x] No-slop copy: "Read more" / "Read less" / "Source: Open Library" — no em dash, no exclamation, no filler. `↗` is a text glyph.
- [x] POV-first / decentralization unaffected (presentation + a seeder constant).

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/web/src/components/Blurb.tsx` prop `blurb`** — ADR §Implementation-notes suggested `text`; the component uses `blurb` (matching the Tester's pinned test contract). Behaviorally identical, fully tested. No action.

## Verdict
**PASS** — the diff matches the story, ADR 0052, and the test plan; all gates (typecheck, web + seeder + ui tests, build) and all three PR checks (incl. Visual regression) are green; test integrity intact (Implementer touched no tests/guards); the new UI is design-system-compliant (primitives + tokens, 12 guards green); the cap change and the single deliberate `book-detail.png` baseline are confirmed; scope is clean.
