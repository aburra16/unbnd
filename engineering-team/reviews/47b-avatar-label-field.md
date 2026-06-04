# Review: Story 47b — `Avatar` MOVE + `Label`/`Field` primitives

**Reviewer:** Claude (acting as Reviewer, independent / fresh context)
**Date:** 2026-06-04
**Story:** `engineering-team/stories/done/47-form-surface-primitives.md` (shared 47a+47b doc; 47a done)
**ADR:** `engineering-team/decisions/0048-avatar-label-field-primitives.md` (Accepted)
**Diff:** `git diff origin/main...HEAD` (branch `story-47b-avatar-label-field`, fix commit `0deb2d7`, PR #91)
**Run mode:** lean (Impl → Reviewer; no new guard per ADR 0048 §5)

## Verdict

**PASS** (re-review after fix — supersedes the prior CHANGES_REQUESTED below).

The sole blocking finding from the first pass — the orphaned third `set-field`
wrapper on the Settings npub block (the 5px column-gap regression) — is **resolved.**
The Implementer migrated that block from `<div className="set-field">` to
`<Field className="set-field">` (fix commit `0deb2d7`, +2/−2 in `Settings.tsx`),
so it now resolves `.u-field`'s `display:flex; flex-direction:column;
gap:var(--u-space-5)` — **byte-identical** to `origin/main`'s old `.set-field`
column rule. The npub label↔row spacing is back to the original 11px
(`set-nostr-label` 6px margin-bottom + 5px gap). No other `*-field` orphan exists
anywhere in `apps/web/src`. All four prior PASSES still hold (the fix touched only
`Settings.tsx`, 2 lines). All gates re-run green; `visual` is success and no `*.png`
changed. Story 47 is now complete (47a + 47b).

---

## Re-review (fix verification)

### Blocking finding resolved — `Settings.tsx:296` npub block (PASS)

- `Settings.tsx:296` now reads `<Field className="set-field">` … `</Field>` (was
  `<div className="set-field">`). Fix is the only delta vs. the prior-reviewed
  `c31d798`: the fix commit `0deb2d7` is +2/−2 in `Settings.tsx` (plus the review
  file). Confirmed via `git show 0deb2d7 -- apps/web/src/routes/Settings.tsx`.
- **Resolved layout is byte-identical.** `git show origin/main:apps/web/src/routes/Settings.css`
  showed `.set-field { display:flex; flex-direction:column; gap:var(--u-space-5) }`.
  `Field` renders `<div class="u-field set-field">`; `.u-field`
  (`packages/ui/src/components/Field.css:39-43`) carries exactly
  `display:flex; flex-direction:column; gap:var(--u-space-5)` — value-for-value
  the deleted rule. The npub block is a column again; the
  `set-nostr-label` (6px margin-bottom) + 5px gap = 11px, the origin/main spacing.
- **Right primitive.** The npub block's children are `<span class="set-nostr-label">`
  + `<div class="set-nostr-row">` (no `<label>`/input). `Field` renders a plain
  `<div>` (not `<label>`), so this is the correct wrapper; the `span`/`div`
  children are untouched. All three Settings `set-field` wrappers are now `<Field>`
  (lines 168, 237, 296); the full `Settings.tsx` diff vs. origin/main is the three
  wrapper migrations + the two label→`Label` swaps and nothing else.

### No other `*-field` orphan (PASS)

- `grep -rn '<div className="[a-z-]*-field'` across `apps/web/src` → **NONE.**
- Every `*-field` wrapper resolves to a `<Field>`: all three `set-field`
  (`Settings.tsx`), three `auth-field` (`AuthEmailSignup.tsx`), eleven `sub-field`
  (`Submit.tsx`). The only remaining `*-field` *class* is `author-edit-field` — a
  `<label className="author-edit-field">` in `AuthorEdit.tsx` (3 sites), which is
  **fenced out** by ADR 0048 (a different skin + implicit-association composition;
  its own layout rule retained in `AuthorEdit.css`, file byte-untouched). No bare
  `<div className="…-field">` wrapper remains.

### Prior PASSES re-confirmed (fix touched only Settings.tsx) (PASS)

- **Avatar MOVE byte-identical:** `diff` of `origin/main:apps/web/src/components/Avatar.css`
  vs. `HEAD:packages/ui/src/components/Avatar.css` → **IDENTICAL**; app-side
  `Avatar.*` deleted; no `components/Avatar` refs remain in `apps/web/src`+`test`.
- **Label/Field transcriptions:** `Field.css` `.u-label`/`.u-label--inline`/`.u-field`
  unchanged from the first pass; reference only `var(--u-*)`.
- **Input/Card untouched:** `ToggleSwitch.{tsx,css}`, `SearchBox.tsx`, `AuthorEdit.tsx`
  all `git diff --quiet origin/main...HEAD` → **UNTOUCHED**. No Card surface in diff.
- **No guard modified:** the only `test/` change vs. origin/main is
  `apps/web/test/components/avatar.test.tsx` (the re-point). No `*.png` changed.

### Gates re-run (PASS)

- `pnpm --filter @unbnd/ui test` — **PASS** (11 files, 16 tests).
- `pnpm -r typecheck` — **PASS** (all 10 projects Done, no errors).
- `pnpm --filter @unbnd/web test` — **PASS** (52 files, **300/300**; happy-dom
  teardown ECONNREFUSED noise prints, no test fails).
- `pnpm --filter @unbnd/web build` — **PASS** (`tsc --noEmit` + `vite build`, 457
  modules, 584ms).
- `gh pr checks 91` — **all pass:** Typecheck/test/build, Validate Caddyfile,
  **Visual regression** (run against fix commit `0deb2d7` = HEAD = pushed). No
  `*.png` baseline changed.

---

## First-pass review (superseded — retained for the record)

**Original verdict: CHANGES_REQUESTED (FAIL).**

One blocking zero-diff violation: a third, un-migrated `set-field` wrapper on the
Settings page lost its deleted column-layout rule, shifting the npub block's
internal spacing by **5px**. It escaped the `visual` job because the Settings
route has **no visual baseline** (the harness only captures signed-out
home/book/profile/search/auth-welcome and submit-at-rest). The binding constraint
for this story is ZERO-DIFF; this is a real, if small, pixel regression.

Everything else in the story is correct and byte-identical (Avatar MOVE, Label
skin, Field layout, all fences, all gates). The fix is one line.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS** (10/11 projects; all `Done`, no errors).
- [x] `pnpm --filter @unbnd/ui test` — **PASS** (11 test files, 16 tests; all 11 guard files green).
- [x] `pnpm --filter @unbnd/web test` — **PASS** (52 files, **300/300** tests, incl. the re-pointed `avatar.test.tsx`). A happy-dom teardown-abort stack trace prints but no test fails.
- [x] `pnpm --filter @unbnd/web build` — **PASS** (`tsc --noEmit` + `vite build`; 457 modules, built in 578ms).
- [x] `gh pr checks 91` — Typecheck/test/build **pass**, Validate Caddyfile **pass**, Visual regression **pass**.
- [ ] _Lint not configured — skipped._

## Avatar MOVE — zero-diff audit (PASS)

- `apps/web/src/components/Avatar.{tsx,css}` → `packages/ui/src/components/Avatar.{tsx,css}`.
- **`Avatar.css`: R100 (byte-identical rename)** — `git diff` shows zero content delta.
- **`Avatar.tsx`: R092** — diffed the moved file against `origin/main` modulo the declared deltas; **byte-identical** except exactly:
  1. import path `@unbnd/ui` → `../palette` (the cross-package `GENRE_PALETTE` import becomes intra-package; `packages/ui/src/palette.ts:28` exports it — resolves).
  2. `type Props` → `export type AvatarProps` (declaration + the usage in the function signature).
  - `hash` (FNV-1a), `initialsOf`, `BGS`/`INKS = GENRE_PALETTE.map(...)` order, the `useState` broken-image fallback, default `size = 30`, and both class strings (`avatar avatar-img` / `avatar avatar-initials`) are carried verbatim. No `className` prop exposed (correct — no re-skin vector).
- **Importers re-pointed (4):** `RatedByRow.tsx`, `AccountMenu.tsx`, `Profile.tsx`, `ProfileMe.tsx` now `import { Avatar } from "@unbnd/ui"`. The fifth call site (the `acct-trigger` child) is inside `AccountMenu`, covered. All four diffs are pure import re-points, **no JSX change**.
- **App-side Avatar deleted**; `grep` for `components/Avatar` across `apps/web/src` + `apps/web/test` → **no stale refs**.
- **Unit test:** kept in `apps/web/test/components/avatar.test.tsx`, import re-pointed to `@unbnd/ui` (OQ-1 resolved: kept-in-place, not moved to the package; no new test tooling added to `@unbnd/ui`). Passes inside the 300.
- **Visually gated:** `profile.png` + `home.png` baselines render Avatar; the `visual` job is green → the Avatar MOVE is genuinely zero-diff confirmed by the harness, not just by inspection.
- Index export added: `export { Avatar }` + `export type { AvatarProps }`.

## Label / Field — zero-diff audit (one BLOCKING defect)

**The primitives themselves are correct transcriptions.** `packages/ui/src/components/Field.css`:
- `.u-label` = `font-size-12` / `weight-medium` / `--u-ink-tint-70` — value-for-value the deleted `.auth-field/.sub-field/.set-field label` skin (verified identical across all three in `origin/main`).
- `.u-label--inline` = `display:flex; align-items:center; gap --u-space-8` — the extra layout the deleted `.sub-field label` rule carried.
- `.u-field` = `display:flex; flex-direction:column; gap --u-space-5` — the deleted column shared by `auth-field`/`sub-field`/`set-field` (OQ-2: all three verified `gap --u-space-5`, so `.u-field` may own it).
- References only `var(--u-*)`; mints no token. `className` is additive-only in both components (`u-label ${className}` / `u-field ${className}`).

**Migration correctness (verified):**
- `<div className="X-field">` → `<Field className="X-field">` renders `<div class="u-field X-field">` — the wrapper class passes through, so `.X-field input` descendant selectors and `.sub-row > .sub-field { flex:1 }` sibling layout still match. Confirmed `.sub-row > .sub-field` rule retained in `Submit.css`.
- **All 11 `Submit.tsx` Labels carry `u-label--inline`** (matching the *unconditional* flex the old `.sub-field label` applied to every sub-field label, hint or not). `Settings`/`Auth` labels correctly do **not** (their old label rule had no flex).
- No competing bare-element `label` selector exists in `apps/web` CSS (all are `.x-label` classes), so the `.sub-field label` (0,1,1) → `.u-label` (0,1,0) specificity drop changes nothing.
- The deleted per-form label-skin + wrapper-layout rules in `AuthForm.css`/`Settings.css`/`Submit.css` are exactly the rules now owned by `.u-label`/`.u-label--inline`/`.u-field`. Input skin rules left intact (no input/select/textarea skin line changed in the diff).
- `Field`/`Label` drop no attributes: every migrated `<div>` carried only `className`; every migrated `<label>` carried only `htmlFor` (+ children). `Label` spreads `...rest` so `htmlFor` survives.

### BLOCKING — `Settings.tsx:296` orphaned `set-field` wrapper (5px regression)

`Settings.tsx` has **three** `<div className="set-field">` in `origin/main`. The diff
migrated the first two (lines 168, 237 — the Substack and Display-name labeled-text
fields) to `<Field>`, but **left the third (line 296, the Nostr-identity npub block)
as a raw `<div className="set-field">`.** That div contains
`<span class="set-nostr-label">` + `<div class="set-nostr-row">`, not a `<label>`+input.

Because the migration **deleted** `.set-field { display:flex; flex-direction:column; gap:var(--u-space-5) }` from `Settings.css` (the layout is now owned by `.u-field`), this un-migrated div lost that rule and is now a default **block**:

- **Before:** flex column, `gap: 5px`; the npub label (`margin-bottom: 6px`) and the row were separated by `6px + 5px = 11px`.
- **After:** block; only the label's `6px` margin-bottom remains → **6px** between label and row.
- Net: **−5px vertical spacing** on the Settings npub block. `--u-space-5` resolves to `5px` (`packages/ui/styles/tokens.css`). The parent `.set-form` flex only spaces the section's direct children, not this div's internals, so it does not compensate.

This violates the story's binding ZERO-DIFF constraint. It was **not** caught by the
`visual` job because Settings has no baseline (see below).

**Asked change (do not need to use `<Field>`):** restore the npub block's layout so
it renders byte-identical — e.g. migrate it to `<Field className="set-field">`, OR
retain a `.set-field { display:flex; flex-direction:column; gap:var(--u-space-5) }`
rule (it would then double-apply harmlessly to the two migrated `u-field set-field`
divs, since `.u-field` already sets the same values). Re-confirm the Settings npub
block visually after the fix.

## Input untouched / Card untouched (PASS)

- **Input ESCALATED, left bespoke (honored):** no `Input` primitive built; no input/select/textarea **skin** rule changed (verified by grepping the CSS diff). `author-edit-field`, `ToggleSwitch.{tsx,css}`, `SearchBox.tsx` are **byte-untouched** (`git diff --quiet` clean for each). No `author-edit` line in the CSS diff.
- **Card untouched:** no `book-card`/`auth-card`/`ratings-panel`/`.card` surface in the diff. Card is out of all of Story 47 by user decision.

## Guards (PASS)

- **No guard file modified:** `git diff --name-only` shows no `architecture-*.test.ts` / `tokens.test.ts` change. The only `test/` change is the avatar.test re-point.
- **No new guard** (ADR 0048 §5: a no-raw-`<input>` guard cannot be green while `Input` is escalated — correctly not added).
- **11 guard files all green** (16 tests) including the new `Avatar.css`/`Field.css`, which reference only `var(--u-*)` → color/spacing/type/shape/motion/svg/token-ref guards hold; no `<button>`/`<svg>` added; button-literals guard (already shrunk by 47a) holds.

## The visual gate (the reason the defect slipped)

`gh pr checks 91` → **Visual regression: pass**, and **no `*.png` baseline changed**
in the diff (verified). However, the gate is **not** a backstop for the Label/Field
migration. `apps/web/e2e/visual/visual.spec.ts` captures exactly six screens, all
`auth: "signed-out"`:

- **Avatar** — covered (`profile.png`, `home.png`). Avatar MOVE genuinely gated.
- **`auth-field`** (AuthEmailSignup) — route `/auth/email-signup` is **not** in the spec (only `/auth/welcome`). Uncovered.
- **`sub-field`** (Submit) — `submit.png` captures the page **at rest** (`!adding` → the DuplicateCheck prompt). The `sub-field` form only renders once `adding` is set, so the migrated fields are **not** in the baseline. Uncovered.
- **`set-field`** (Settings) — Settings requires a session; **not in the spec at all.** Uncovered → the 5px regression passed CI undetected.

So "visual green" confirms Avatar only; the Label/Field byte-identical claim rests
on code inspection, which is where the orphan surfaced.

## OQ checks

- **OQ-1 (Avatar test location):** resolved — test kept in `apps/web/test/`, re-pointed to `@unbnd/ui`; no DOM-env/test tooling added to the package. OK.
- **OQ-2 (`Field` gap ownership):** confirmed — `auth-field`/`sub-field`/`set-field` all used `gap --u-space-5`, so `.u-field` owns it zero-diff. OK.
- **OQ-3 (Input escalation):** honored — no Input primitive, no new guard, no input skin touched. OK.

## Findings

### Blocking
1. **`apps/web/src/routes/Settings.tsx:296`** — ~~the third `<div className="set-field">` (Nostr-identity npub block) was not migrated to `<Field>`, but `.set-field`'s `display:flex; flex-direction:column; gap:var(--u-space-5)` layout rule was deleted from `Settings.css`. The npub label↔row spacing drops from 11px to 6px (−5px). Zero-diff violation, undetected because Settings has no visual baseline. Asked change: restore byte-identical layout for this block (migrate to `<Field className="set-field">`, or retain the `.set-field` column-layout rule). Re-verify visually.~~ **RESOLVED in fix commit `0deb2d7`** — migrated to `<Field className="set-field">`; resolved layout (`.u-field` flex column + `gap:var(--u-space-5)`) is byte-identical to the deleted `.set-field` rule. See the Re-review section above.

### Non-blocking
1. **Visual coverage gap (pre-existing, not introduced here).** Three of the migrated forms (`auth-field`/`sub-field`/`set-field`) are outside the `visual` baselines, so the zero-diff gate gave no protection to this story's main change. Not blocking for 47b, but worth filing: the at-rest `submit.png` never exercises the `sub-field` form, and Settings/email-signup have no baseline at all. A future story could add an authenticated-Settings and an expanded-Submit-form baseline so form-primitive migrations are genuinely gated.

## Verdict
**PASS** (re-review after fix commit `0deb2d7`). The sole blocking finding is
resolved byte-identical; all prior PASSES hold; all gates and the `visual` job
green. Story 47 (47a + 47b) is complete.
