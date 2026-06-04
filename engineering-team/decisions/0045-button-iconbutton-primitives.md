# ADR 0045: `Button` and `IconButton` primitives, the bespoke-button migration, and the no-raw-`<button>` guard

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/45-button-iconbutton-primitives.md`

**Approved 2026-06-03** at the architecture gate, after the user reviewed the full variant mapping, risks, and tradeoffs. Original decision: **Option A, pure zero-diff refactor** (reproduce every outlier exactly via a closed typed `tone` enum plus additive-layout-only `className`; no visual normalization; no baseline update).

**Revised 2026-06-03 (Option 3, normalization).** During Test Design / early Implementation the Implementer escalated a contract-level problem with Option A: the buttons are genuinely, accidentally inconsistent, and reproducing all of them zero-diff forces an ugly grab-bag `tone` axis (six-plus values for text color, fill, border, radius, and weight) that encodes accidental drift as if it were intentional design. That is the exact debt the umbrella epic exists to remove, and the standing quality bar forbids shipping it. The user reviewed the escalation and chose **Option 3: build the `Button`/`IconButton` primitives AND normalize the accidentally-inconsistent subset onto a clean variant set now.** This story is therefore reclassified from a behavior-preserving refactor to a **deliberate visual-change story**: the normalized buttons WILL diff the Story-39 `visual` job, so this story updates the affected baselines on purpose, in a clearly-labeled commit, after the user signs off the per-button deltas and reviews the before/after (ADR 0039's intentional-visual-change path). Status stays **Accepted**; the sections below are rewritten to the clean-variant + normalization plan. The zero-diff `tone`-grab-bag decision (old Option A) is retained in "Options considered" as the rejected baseline.

The two decisions Option 3 hands to the user (resolved in §0 "Judgment calls"): (1) whether the ink-fill curation buttons (`tagc-apply`, `shelfc-add`, `dc-proceed`, `author-edit-save`) are an intentional distinct design that earns its own `variant="ink"`, or accidental drift that normalizes to `primary` (amber); (2) the handful of smaller normalizations (muted secondary text, odd radii, the two toggle looks, the standardized focus ring). Every button that changes pixels is enumerated in §2's normalization table and drives the baseline update; every button that stays zero-diff is marked so its baseline does not move.

**USER SIGN-OFF 2026-06-03 (all judgment calls resolved):** JC-1 = **KEEP `variant="ink"`** (the ink-fill is an intentional "commit this curation action" language, distinct from the amber primary; not normalized to amber). JC-2 = normalize muted secondary text → `--u-ink`. JC-2b = keep `rp-personalize`'s amber outline via the `accent` flag (zero-diff). JC-3 = normalize the odd radii + the lone pill → `--u-radius` (8px) per variant. JC-4 = unify the two toggle looks onto `--u-elevation-1b` + `--u-radius-6`. JC-5 = **fold in the standardized 2px amber `:focus-visible` ring on every button** (WCAG 2.4.7; free against the at-rest baselines). The Implementer builds to exactly this; the normalized buttons in §2 drive the deliberate, labeled baseline update.

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03; §2 primitive component library and the `className` rule, §6 CI guards, §7 package and CSS delivery). Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job: `maxDiffPixelRatio: 0`, and the discipline that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Builds on the `@unbnd/ui` source-export precedent set by **ADR 0040** (`GENRE_PALETTE`/`SEMANTIC_COLORS` from `packages/ui/src/*`, re-exported from `index.ts`) and the guard precedent set by ADRs 0040 to 0044 (`packages/ui/test/architecture-*.test.ts`, mirroring `packages/trust/test/architecture.test.ts`). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 8, the first structural story). It does not relitigate 0038 or 0039.

This is the first story to build a real React primitive on the token foundation. The token axes are complete (Stories 40 to 44), so every value a button needs already exists as a semantic token; this story mints no tokens. The design judgment here is the prop contract, the **clean minimal variant set** the buttons collapse onto, the **per-button normalization plan** (which buttons are reproduced zero-diff and which change pixels, with the exact deltas), the **judgment calls** the user signs off, the scope deferrals, and how the guard stays honest given those deferrals.

## Context

### Acceptance criteria (quoted from the story)

- `@unbnd/ui` provides a typed `Button` and `IconButton` (exported from `packages/ui/src/index.ts`), each with a `variant`/`size`/state prop contract per ADR 0038 §2, styled only against existing semantic tokens, no new tokens.
- State rides on real typed props (`disabled`, `loading`, `aria-pressed`/selected, `type`); no `className` that can re-skin; any permitted `className` is additive layout-only.
- No raw `<button>` remains in `apps/web/src`; every button goes through `Button` or `IconButton` (including the polymorphic `cta-btn` `<Btn>`'s button branch, resolved per the open questions).
- Every migrated button preserves its click handler, `type`, `disabled`, `aria-*`, visible label, and (for toggles) selected state and `aria` semantics exactly.
- Every bespoke button CSS class no longer styles a hand-rolled button; the styling lives in the primitive. Classes that also style non-button siblings keep only their non-button rules (the Architect identifies these).
- Primitive CSS is co-located in `@unbnd/ui`, imported by the primitive, references only existing semantic tokens.
- A no-raw-`<button>` guard scans `apps/web/src`, finds none, passes; allowlist names only the primitive source files.
- Prior guards stay green; `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` all pass.
- (Original AC, superseded by the Option-3 pivot) "The Story-39 `visual` job is zero-diff; no baseline is updated." **Revised:** the in-scope buttons that are already consistent migrate **zero-diff** (no baseline change); the accidentally-inconsistent subset is **normalized** onto the clean variant set, which changes pixels and therefore **updates the Story-39 baselines deliberately**, in a clearly-labeled commit, after the user signs off the per-button deltas in §2 and reviews the before/after. The split (which buttons hold, which move) is enumerated in §2 and is itself an acceptance gate: a normalized button MUST match its stated target delta, and a zero-diff button MUST NOT move.

### The corrected, verified survey (read directly against `apps/web/src` on `story-45-button-primitives`, 2026-06-03)

The umbrella audit and the story both say "38 raw `<button>`s." A line-accurate read corrects this:

- **A literal `<button>` grep returns 38 hits, but one is a comment** (`CopyButton.tsx:2`: `// <button> so it is keyboard-focusable…`). The true count of raw `<button>` **JSX elements is 37**, across 21 files. The guard (below) must not count comment lines, and the ADR records 37 as the real number so the AC ("none remain") is judged against the real set.
- The tokens are already migrated: every bespoke button class references `var(--u-*)` for color, spacing, radius, type, and motion (the work of Stories 40 to 44). So this migration moves **markup and class structure**, not token values. The exact pixels each button renders are fully determined by the token-backed declarations captured below.

Two survey clustering claims are wrong and are corrected here, because they change the scope:

1. **`auth-btn-secondary` is NOT a raw `<button>`.** All three call sites (`AuthNostrConnect.tsx:143`, `AuthNostrConnect.tsx:166` via `Link`, `AuthWelcome.tsx:33`) put `auth-btn-secondary` on a `react-router` `<Link>`, never on a `<button>`. It is a button-*styled link*, which is the `Link` primitive's job (epic story 10), not `Button`'s. It does not appear in the raw-`<button>` set and is **out of scope** here. (The story's "secondary" cluster listed it; the code disagrees.)
2. **`shelfc-remove` is a labeled text button, not an icon "×".** Its content is the word `Remove` (`ShelfControl.tsx:196`). It is `Button variant="secondary" size="sm"`, **not** `IconButton`. The survey's "remove × affordance" is inaccurate.

A third correction affects deferral, not count:

3. **`searchbox-hit` (the `role="option"` search result row) is a raw `<button>`** (`SearchBox.tsx:111`) that the story's named-class list omits. It is a full-width, two-line composite list option (`<span class="searchbox-hit-title">` over `<span class="searchbox-hit-author">`), not a control button. It is a `role="option"` listbox item, semantically a different primitive. It is in the raw-`<button>` set (so the guard sees it) and must be dealt with explicitly (see Scope deferrals).

### The full per-button inventory (all 37, file → class → resolved styling → state/a11y)

Resolved styling is the token-backed CSS as it renders today. "Fill/text" lists `background` / `color`; "border" the border; "radius" the `border-radius` token; states list hover/disabled/selected/focus.

**Cluster 1: amber-fill filled CTAs (primary candidates).**

| # | File | Class | Fill / text | Border | Radius | Weight | Padding | States / a11y |
|---|---|---|---|---|---|---|---|---|
| 1 | `routes/AuthEmailSignup.tsx:134` | `auth-submit` | `--u-amber` / `--u-parchment` | none | `--u-radius` | medium | `12 16` | hover `--u-amber-hover`; `type="submit"`; `disabled` while submitting |
| 2 | `routes/AuthNostrConnect.tsx:171` | `auth-submit` | same | none | `--u-radius` | medium | `12 16` | hover; `type="button"`; `disabled` connecting |
| 3 | `routes/Submit.tsx:296` | `sub-submit-btn` | `--u-amber` / `--u-parchment` | none | `--u-radius` | medium | `12 28` | hover; `disabled` (opacity .5, `cursor:not-allowed`); `type="submit"` |
| 4 | `components/RatingControl.tsx:198` | `rate-submit` | `--u-amber` / `--u-parchment` | none | `--u-radius` | **semibold** | `10 18` | `align-self:flex-start`; hover `:not(:disabled)`; `disabled` opacity .5 |
| 5 | `components/FollowButton.tsx:165` | `follow-btn follow-follow` | `--u-amber` / `--u-parchment` | `1px --u-amber` | `--u-radius` | semibold | `8 16` | `min-width:116px`; inline-flex+gap (icon+label); `aria-pressed="false"`; `:focus-visible` 2px amber outline |
| 6 | `routes/Settings.tsx:201,267` | `set-save` (×2) | `--u-amber` / **`--u-night`** | none | `--u-radius` | semibold | `9 20` | hover `:not(:disabled)`; `disabled` opacity .55; `type="submit"`; `aria-label` |
| 7 | `components/CallToAction.tsx:20` (button branch of `<Btn>`) | `cta-btn` | `--u-amber` / `--u-parchment` | none | `--u-radius` | medium | `10 26` | hover; `display:inline-block`; polymorphic (also renders `<a>`) |
| 8 | `routes/Home.tsx:133` | `foryou-invite-btn` | `--u-amber` / **`--u-ink`** | none | `--u-radius` | semibold | `8 16` | hover |

Divergences inside Cluster 1: text color is `--u-parchment` on six, **`--u-night`** on `set-save`, **`--u-ink`** on `foryou-invite-btn`; weight is medium on three and semibold on four; padding varies (`12 16`, `12 28`, `10 18`, `9 20`, `10 26`, `8 16`); `follow-follow` adds a border, a `min-width`, and a focus ring. These are the zero-diff pressure points.

**Cluster 2: outline / surface secondary (secondary candidates).**

| # | File | Class | Fill / text | Border | Radius | Weight | Padding | States |
|---|---|---|---|---|---|---|---|---|
| 9 | `routes/Settings.tsx:209` | `set-clear` | transparent / `--u-ink` | `1px --u-border-hover` | `--u-radius` | medium | `9 20` | hover border `--u-amber`; `disabled` opacity .55 |
| 10 | `routes/Search.tsx:97` | `search-more-btn` | `--u-surface-card` / `--u-ink` | `1px --u-ink-tint-20` | `--u-radius` | medium | `10 22` | hover border `--u-ink`; `disabled` opacity .6 |
| 11 | `routes/CommunitySubmissions.tsx:58` | `cs-promote` | transparent / `--u-ink` | `1px --u-border` | `--u-radius` | medium | `5 12` | hover border+text `--u-amber`; `disabled` opacity .6 |
| 12 | `components/CopyButton.tsx:53` | `copy-btn` | transparent / `--u-ink` | `1px --u-border-hover` | `--u-radius` | medium | `4 10` | hover border `--u-amber`; `:focus-visible` 2px amber; icon+text label |
| 13 | `components/PoVBar.tsx:68` | `pov-btn` | transparent / `--u-muted` | `1px --u-border-hover` | `--u-radius` | (inherit) | `5 12` | hover text+border `--u-ink`; `disabled` opacity .4 |
| 14 | `components/RatingsPanel.tsx:97` | `rp-personalize` | transparent / `--u-amber` | `1px --u-amber` | `--u-radius` | medium | `7 16` | hover bg `--u-amber-tint-08` |
| 15 | `components/ClaimControl.tsx:88` | `claim-btn` | `--u-surface` / `--u-ink` | `1px --u-line-warm` | **`--u-radius-7`** | semibold | `9 16` | hover border `--u-ink`; `disabled` opacity .6; `appearance:none` |
| 16 | `components/FollowButton.tsx:132` | `follow-btn follow-following` | `--u-surface` / `--u-ink` | `1px --u-border` | `--u-radius` | semibold | `8 16` | `aria-pressed="true"`; `.is-unfollow` turns text+border `--signal-negative`, focus outline `--signal-negative`; icon+label |
| 17 | `components/ShelfControl.tsx:190` | `shelfc-remove` | transparent / `--u-muted` | `1px --u-ink-tint-20` | `--u-radius-6` | (inherit) | `2 8` | `disabled` opacity .5; label "Remove" |

Divergences: radius is `--u-radius` on most but **`--u-radius-7`** on `claim-btn` and **`--u-radius-6`** on `shelfc-remove`; border color varies (`--u-border`, `--u-border-hover`, `--u-ink-tint-20`, `--u-amber`, `--u-line-warm`); fill is `transparent` on most but `--u-surface`/`--u-surface-card` on three; text color is `--u-ink` on most, `--u-muted` on two, `--u-amber` on `rp-personalize`; `follow-following` carries the red `.is-unfollow` state.

**Cluster 3: ink-filled "primary" (NOT amber). The clearest outlier.**

| # | File | Class | Fill / text | Border | Radius | Weight | Padding | States |
|---|---|---|---|---|---|---|---|---|
| 18 | `components/TagControl.tsx:206` | `tagc-apply` | **`--u-ink`** / `--u-surface-card` | `1px transparent` | `--u-radius-6` | medium | `8 16` | `disabled` opacity .5 |
| 19 | `components/ShelfControl.tsx:256` | `shelfc-add` | **`--u-ink`** / `--u-surface-card` | `1px transparent` | `--u-radius-6` | medium | `8 16` | `disabled` opacity .5 |
| 20 | `components/DuplicateCheck.tsx:112` | `dc-proceed` | **`--u-ink`** / `--u-surface-card` | `1px transparent` | `--u-radius` | medium | `9 18` | hover opacity .92 |
| 21 | `components/AuthorEdit.tsx:132` | `author-edit-save` | **`--u-ink`** / `--u-on-ink` (`#FFF`) | none | `--u-radius-pill` | semibold | `8 18` | `disabled` opacity .6 |

These read as the affirmative action on their surface but are ink-filled, not amber-filled. They share `background:--u-ink`, white-ish text, no current amber. `radius` and `weight` and the text token (`--u-surface-card` vs `--u-on-ink`) and the pill radius on `author-edit-save` all differ.

**Cluster 4: ink-outline secondary partner to Cluster 3.**

| # | File | Class | Fill / text | Border | Radius | Weight | States |
|---|---|---|---|---|---|---|---|
| 22 | `components/TagControl.tsx:214` | `tagc-dispute` | transparent / `--u-ink` | `1px --u-ink-tint-20` | `--u-radius-6` | medium | `disabled` opacity .5 |
| 23 | `components/DuplicateCheck.tsx:99` | `dc-proceed dc-proceed-quiet` | transparent / `--u-ink` | `1px --u-ink-tint-20` | `--u-radius` | **regular** | hover opacity .92 |

`dc-proceed-quiet` is a modifier on `dc-proceed` that overrides fill to transparent, border to `--u-ink-tint-20`, and weight to regular. It is effectively the Cluster-4 outline twin.

**Cluster 5: ghost / text (no border, transparent).**

| # | File | Class | Fill / text | Radius | Weight | States / a11y |
|---|---|---|---|---|---|---|
| 24 | `components/AccountMenu.tsx:86` | `acct-signout` | none / `--u-ink` | `--u-radius-7` | (inherit) | `width:100%`, `text-align:left`, `border-top`; hover `--u-red-tint-08` bg + `--signal-negative` text; `disabled` opacity .6; `role="menuitem"` |
| 25 | `components/SearchBox.tsx:127` | `searchbox-seeall` | none / `--u-amber` | `0 0 7 7` | medium | `width:100%`, `text-align:left`, `border-top`; hover `--u-amber-tint-06` bg |
| 26 | `components/RatingsPanel.tsx:76,85` | `rp-tab` (×2) | none / `--u-muted` | `--u-radius-6` | medium | `role="tab"`, `aria-selected`; selected `.rp-tab-on` → `--u-surface-card` bg + `--u-ink` + elevation |
| 27 | `components/PoVBar.tsx:36,45` | `pov-sw` (×2) | none / `--u-muted` | `--u-radius-7` | medium | `role="tab"`, `aria-selected`; selected `.pov-sw-active` → `--u-surface-card` bg + `--u-ink` + elevation |

`rp-tab` and `pov-sw` are segmented-toggle tab controls inside a track. `acct-signout` and `searchbox-seeall` are full-width left-aligned text rows with a top divider.

**Cluster 6: link-styled text buttons.**

| # | File | Class | Styling | Notes |
|---|---|---|---|---|
| 28 | `routes/AuthEmailSignup.tsx:60,71` | `auth-linklike` (×2) | `background:none; border:none; padding:0; font:inherit; color:--u-amber; medium`; hover underline | A real `<button>` styled as an inline link (mode switch) |
| 29 | `routes/Submit.tsx:158` | `sub-back` | `border:none; background:none; padding:0; color:--u-muted`; hover `--u-ink` | A back affordance |

**Cluster 7: pill / toggle selectable.**

| # | File | Class | Styling | State |
|---|---|---|---|---|
| 30 | `components/GenrePillSelector.tsx:27` | `gps-pill` | `--u-radius-20` pill; transparent / `--u-muted`; `1px --u-border-hover` | `.gps-on` → amber-tinted selected; `.gps-off` → opacity .4 disabled |
| 31 | `components/RatedByRow.tsx:103` | `rated-by-more` | `--u-radius-pill`; `--u-surface` / `--u-amber`; `1px --u-border`; `height:30px; min-width:30px` | overflow "+N" count chip; `aria-label` |

**Cluster 8: icon-only (`IconButton` candidates).**

| # | File | Class | Content | Notes |
|---|---|---|---|---|
| 32 | `components/AccountMenu.tsx:58` | `acct-trigger` | `<Avatar>` | `padding:0; border:none; background:none; border-radius:--u-radius-circle`; `aria-haspopup`, `aria-expanded`, `aria-label`; `:focus-visible` 2px amber |
| 33 | `components/RatingControl.tsx:169` | `rate-star` (×5) | `<Star>` SVG | `background:none; border:none; padding:--u-space-2`; `aria-label="Rate n of 5"`, `aria-pressed`; hover color |

**Cluster 9: the search-result option (different primitive).**

| # | File | Class | Content | Notes |
|---|---|---|---|---|
| 34 | `components/SearchBox.tsx:111` | `searchbox-hit` | two stacked spans | `role="option"`, `aria-selected="false"`; full-width two-line composite; a listbox item, not a control |

(JSX-element counts, where one button written inside a `.map` is one element: Cluster 1 = 8 (`auth-submit` ×2, `sub-submit-btn`, `rate-submit`, `follow-follow`, `set-save` ×2, `cta-btn`, `foryou-invite-btn`), Cluster 2 = 9, Cluster 3 = 4, Cluster 4 = 2, Cluster 5 = 6 (`rp-tab` ×2, `pov-sw` ×2, `acct-signout`, `searchbox-seeall`), Cluster 6 = 3 (`auth-linklike` ×2, `sub-back`), Cluster 7 = 2, Cluster 8 = 2 (`acct-trigger`; `rate-star`, one `<button>` in a five-iteration `.map`), Cluster 9 = 1. Sum = 37 raw `<button>` JSX elements, the corrected real count.)

### Constraints that bind this design

- **Two render outcomes, both gated by Story-39** (ADR 0039). Under Option 3 the prime directive is no longer "every button zero-diff." It is: (a) the already-consistent buttons migrate zero-diff (markup change only, no pixel change), and (b) the normalized subset changes pixels to the exact deltas in §2 and updates the baseline deliberately, in a labeled commit, after sign-off. The `visual` job is still the backstop on every key screen; it now proves two things instead of one: the zero-diff set held, and the normalized set moved to precisely the intended look (the reviewer diffs the new baseline PNGs against the before/after in §2, never a silent re-baseline). Per ADR 0039, baselines are regenerated **only inside the pinned Playwright Docker image** via the documented `test:visual:update` command, committed separately from the structural change.
- **No new tooling** (`CLAUDE.md`; ADR 0038 §6/§7). The guard is a Vitest test under the existing `pnpm -r test`. No build step for `@unbnd/ui`.
- **No new tokens** (story out-of-scope). Every value the primitive needs already exists in `tokens.css`.
- **No AI-slop** in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- **The `className` rule** (ADR 0038 §2): a `className`, if allowed at all, is additive layout-only and never a re-skin.
- In-repo prior art governs; the Tapestry branch survey does not apply (story "DList shapes touched: None").

### Package-config facts that constrain the implementation (verified)

- `packages/ui/package.json` already declares `react`/`react-dom` as **peer** deps and exports `.` → `./src/index.ts` (no build step). Good.
- `packages/ui/tsconfig.json` has `lib: ["ES2022"]` (no `"DOM"`) and **no `jsx` setting**, and the package has **no `@types/react` dependency**. A `.tsx` React component will not typecheck under the package's own `tsc --noEmit` until: `jsx: "react-jsx"` is added, `"DOM"`/`"DOM.Iterable"` are added to `lib`, and `@types/react` + `@types/react-dom` are added as **dev** deps (pinned exact, no caret, per the version-pin house rule). This is a real, load-bearing Implementer step.
- `packages/ui/vitest.config.ts` includes `test/**/*.test.ts` only; the guard is a `.ts` file, so no config change is needed for it. No component-render unit test is required (the `visual` gate proves rendering; a render smoke test is optional and out of scope).
- `apps/web` already consumes `@unbnd/ui` as `workspace:*` source through Vite `Bundler` resolution and imports both a JS export (`SEMANTIC_COLORS`) and the CSS export (`@unbnd/ui/styles/tokens.css`). So importing `{ Button, IconButton }` from `@unbnd/ui` and shipping the primitive's co-located CSS works with zero new wiring.

## §0. JUDGMENT CALLS FOR THE USER (sign off before implementation)

Option 3 makes a small set of deliberate visual decisions. Each is presented with options and a recommendation; the orchestrator brings these to the user, and the answers fix §1 (the variant set) and §2 (the normalization deltas). Until they are signed off, the Implementer does not touch a baseline.

**JC-1. The ink-fill "curation action" buttons: intentional `variant="ink"`, or normalize to `primary` (amber)?** This is the #1 call. Four buttons fill with `--u-ink` and white-ish text instead of amber: `tagc-apply` (apply a genre tag), `shelfc-add` (add to shelf), `dc-proceed` (proceed past the duplicate check), `author-edit-save` (save author edits). They are not one-offs; they share a fill (`--u-ink`), a near-white text, and a "commit this curation action" role. The question is whether that shared look is **intentional design** (a deliberate second affirmative style that says "this is a curation commit, distinct from the amber primary CTA") or **accidental drift** (four buttons that should have been amber and never were).

- **Option 3a, keep ink as an intentional `variant="ink"`.** A fifth, named, closed variant: `background:--u-ink; color:--u-surface-card`. The four buttons map to `variant="ink"`. Amber stays the single accent (ink is not an accent; it is the text color used as a fill, which is within the parchment-on-ink elevation model, not a second accent hue). These four buttons then render **zero-diff** (their look is preserved, just centralized), except the two intra-cluster deltas normalized under JC-3 (radius, the pill, weight, the text token).
  - Pro: preserves a real, consistent design signal; honors "amber is the only accent" because ink-as-fill is not an accent; keeps these four zero-diff on color.
  - Con: a fifth variant beyond the §2 four the umbrella named; one more concept for every future button author to reason about; if the design team later decides ink-fill was a mistake, retiring it is a second normalization story.
- **Option 3b, normalize to `variant="primary"` (amber).** The four become amber-filled `--u-parchment`-text primaries. The clean set stays exactly the §2 four variants, no `ink`. These four buttons **change pixels** (ink fill → amber fill, text token flips) and drive the baseline update.
  - Pro: the smallest honest variant set; one affirmative style across the whole app; kills the inconsistency outright; nothing to retire later.
  - Con: collapses a distinction that may be intentional (a tag-apply now looks identical to a "Sign up" CTA); it is a visible, app-wide change to four interaction surfaces that the design team did not explicitly ask to remove.

  **Recommendation: 3a, keep `variant="ink"` as an intentional, named variant.** The four buttons are internally consistent and share a coherent role (commit a curation action), which is the signature of intent, not accident. Amber as the single *accent* is preserved (ink-fill reads as a weighted surface, not a competing accent color), so the brand rule holds. This also keeps the larger, more visible pixel change (four affirmative surfaces flipping to amber) out of this story; if the design team wants ink gone, that is a clean, clearly-scoped follow-up with its own before/after, rather than a side effect of building the primitive. **A `variant` (not a `tone`) is the right axis** because the ink look is a complete alternate skin (fill + text together), not a one-property tweak. If the user prefers the absolute-minimum four-variant set, 3b is clean and well-defined; it simply pushes a bigger, more visible normalization into this story.

**JC-2. The muted-text secondary buttons: normalize muted text to ink?** Two secondary buttons use `--u-muted` body text where the rest of the secondary cluster uses `--u-ink`: `pov-btn` (the PoV "personalize" control) and `shelfc-remove` (the "Remove" affordance). Under a clean `variant="secondary"` whose canonical text is `--u-ink`, these either keep a muted sub-tone or normalize up to ink.

- **Option A, normalize to `--u-ink`** (recommended): both become standard secondary buttons; text darkens slightly. Small, defensible pixel change; removes a sub-tone the variant set would otherwise have to carry.
- **Option B, preserve muted via a `tone`/modifier**: keeps them zero-diff but reintroduces exactly the grab-bag axis Option 3 exists to remove.

  **Recommendation: A, normalize muted secondary text to `--u-ink`.** It is a barely-perceptible darkening that earns a cleaner variant. (`pov-btn` and `shelfc-remove` both change pixels; see §2.) Note: `rp-personalize`'s amber text+border is a *different* case (an amber-outline secondary, see JC-2b) and is kept; muted-vs-ink is the only sub-tone collapsed here.

**JC-2b. The amber-outline secondary (`rp-personalize`): keep as a `secondary` sub-variant, or fold in?** `rp-personalize` is transparent fill, `--u-amber` text, `1px --u-amber` border. This is a genuine, intentional look (an amber-outline "personalize" affordance), not drift.

- **Recommendation: keep it, as a named `secondary` look selected by a small closed modifier (e.g. an `accent` boolean on secondary, or a dedicated `variant="secondary-accent"`).** It is one intentional style, not a grab-bag; it stays **zero-diff**. (Alternative: normalize to plain ink-outline secondary, losing the amber call-out. Rejected; the amber outline is a deliberate emphasis the design uses to mark the personalize action.)

**JC-3. Unify the odd radii and the `author-edit-save` pill.** Three radius outliers exist against the canonical control radius. The clean set should pick one radius per variant.

- `claim-btn` uses `--u-radius-7` (7px) where its secondary peers use `--u-radius` (8px). **Recommend normalize 7px → 8px** (`--u-radius`). One stray pixel of corner; sub-perceptible; removes a stray token. `claim-btn` changes pixels (+1px corner radius).
- `tagc-apply`, `shelfc-add`, `tagc-dispute`, `shelfc-remove` use `--u-radius-6` (6px). **Recommend normalize 6px → the variant's canonical radius** (ink/secondary settle on `--u-radius` 8px, matching `dc-proceed`'s already-8px ink look). These change pixels (+2px corner radius). This makes the ink variant and the secondary variant each carry exactly one radius.
- `author-edit-save` uses `--u-radius-pill` (999px, a full pill) on top of ink fill and semibold weight. This is the single ugliest combination in the inventory (pill + ink + semibold, matching no other button). **Recommend normalize the pill → `--u-radius` (8px)** so it becomes a normal ink-variant button. `author-edit-save` changes pixels (pill → 8px corner, the largest single normalization). If the user wants to keep a pill anywhere, it should be a deliberate, named choice, not a lone outlier on one save button.

  **Recommendation: normalize all three to one radius per variant (`--u-radius` 8px).** Each is a small, honest corner change that collapses three stray radius tokens onto one. All three buttons appear in §2 as pixel-changing.

**JC-4. Unify the two segmented-toggle looks.** The two tab/segment controls have near-identical selected styles that differ only in a shadow alpha and a radius: `rp-tab-on` = `--u-elevation-1b` (`0 1px 3px ink-tint-12`) + `--u-radius-6` (6px); `pov-sw-active` = `--u-elevation-1c` (`0 1px 3px ink-tint-14`) + `--u-radius-7` (7px). The difference is two percent of shadow opacity and one pixel of radius, invisible side by side and certainly accidental.

- **Recommend unify both onto one selected look:** pick `--u-elevation-1b` + `--u-radius-6` (or `1c`+`7`; the Implementer picks one and both toggles use it). `pov-sw`/`pov-sw-active` then change pixels by an imperceptible shadow-alpha and 1px-radius delta; `rp-tab` holds (if 1b/6 is chosen) or changes by the same tiny delta (if 1c/7 is chosen). This lets a single `selected` look on `variant="ghost"` carry both toggles with no sub-tone. (Alternative: keep two selected looks via a modifier. Rejected; the difference is accidental and sub-perceptible, exactly the drift Option 3 removes.)

  **Recommendation: unify onto `--u-elevation-1b` + `--u-radius-6`.** One toggle (`pov-sw`) changes by a sub-perceptible shadow/radius delta; both then share one `selected` look.

**JC-5. Standardize a focus ring across all buttons now?** Today only `follow-btn`, `copy-btn`, and `acct-trigger` declare a `:focus-visible` ring (2px `--u-amber`, 2px offset); the unfollow state uses a `--signal-negative` ring. Most buttons have no explicit focus style and fall back to the UA default. Under Option A this stayed a deferred a11y story because adding a ring is a pixel change on `:focus-visible`. **Under Option 3 we are already updating baselines**, so folding the ring in here is natural and is a real WCAG 2.4.7 (focus visible) win.

- **Option A, standardize the 2px amber `:focus-visible` ring on every `Button`/`IconButton` now** (recommended). The danger state keeps the `--signal-negative` ring. All buttons gain a consistent, visible keyboard-focus indicator. This is an a11y improvement, not just a normalization. It does **not** change the at-rest screenshots (focus rings render only on `:focus-visible`), so it costs **no at-rest baseline change**; it would only show in a focus-state capture, which the Story-39 baseline set does not include. So it is effectively free against the current baseline and strictly better for keyboard users.
- **Option B, defer to a later a11y story.** Cleaner scope, but leaves the gap open and forgoes a free, natural-to-fold-in win while we are already in the buttons.

  **Recommendation: A, standardize the 2px amber `:focus-visible` ring across all buttons in this story.** It is the right altitude (we own every button's CSS this story), it closes a real a11y gap, and against the at-rest Story-39 baselines it is zero-cost (focus rings do not appear at rest). The §4 a11y plan is updated to specify it.

**Net of the recommendations:** the clean set is `variant: primary | secondary | ink | ghost | danger`, `size: sm | md | lg`, state props (`selected`, `block`, `loading`, `disabled` passthrough), one small closed `accent` flag on secondary for `rp-personalize`, additive-layout-only `className`, and a standardized focus ring. The `tone` grab-bag is **eliminated**. If the user picks 3b instead of 3a, `ink` drops and the set is the four-variant `primary | secondary | ghost | danger`.

## Options considered

The load-bearing decisions are (1) the prop contract and the `className` policy, (2) the clean variant set and which buttons normalize vs migrate zero-diff onto it, (3) the scope deferrals and how the guard stays honest, and (4) the guard's detection strategy. Options are framed around the first two; the rest follow.

### Option 3: Build the primitives AND normalize the accidentally-inconsistent subset onto a clean variant set, updating baselines deliberately (CHOSEN)

`Button` and `IconButton` expose a clean, minimal contract (§1): `variant: primary | secondary | ink | ghost | danger` (the `ink` member subject to JC-1), `size: sm|md|lg`, state via real props (`selected`, `block`, `loading`, `disabled` passthrough), one small closed `accent` flag on secondary for the deliberate amber-outline look, and an additive-layout-only `className`. The already-consistent buttons migrate **zero-diff**. The accidentally-inconsistent subset is **normalized** onto the clean variants per the §0 judgment calls and the §2 deltas: muted secondary text → ink, three stray radii → one radius per variant, the lone pill → standard radius, the two near-identical toggle looks → one. There is **no `tone` grab-bag**. A standardized `:focus-visible` ring is folded in (JC-5; an a11y win, zero at-rest baseline cost). The link-styled buttons (`auth-linklike`, `sub-back`), the pill/toggle controls (`gps-pill`, `rated-by-more`), and the `role="option"` search row (`searchbox-hit`) are still **deferred** to their proper primitives (`Link`, `Pill`, a listbox option), guard-allowlisted by class name with a recorded reason. The normalized buttons diff the Story-39 `visual` job, so this story updates the affected baselines deliberately, in a clearly-labeled commit, after the user signs off §2.

- Pros: delivers the clean variant set the epic exists to reach; removes the accidental inconsistency now, while we already own every button's CSS, instead of shipping a grab-bag `tone` axis that encodes drift as if it were design (debt the quality bar forbids); the resulting API is honest and minimal; the focus ring is a free a11y win; the guard still ships green via the named class-based deferrals.
- Cons: this story now changes pixels on a defined subset, so it is a deliberate visual-change story that updates baselines (more review surface than a pure refactor) and needs the user's sign-off on the §2 deltas and the before/after. Mitigated: every pixel-changing button is enumerated with its exact delta, the changes are individually small and defensible, and the baseline update is a separate labeled commit per ADR 0039, not a silent re-baseline.

### Option A (the prior decision, now superseded): pure zero-diff, outliers reproduced via a typed `tone` grab-bag

The original Accepted decision. `Button` carries the §2 four variants plus a closed `tone` enum (`default`/`ink`/`night`, and growing) to reproduce every divergent button **zero-diff**; no normalization; no baseline update.

- Pros: zero pixel change, so the visual gate stays a pure backstop; no design sign-off needed.
- Cons: **the Implementer escalated this as unworkable without debt.** The honest `tone`/sub-tone enum needed to reproduce the real divergence is a six-plus-value grab-bag (text color across `--u-parchment`/`--u-night`/`--u-ink`/`--u-muted`/`--u-amber`, fills across transparent/`--u-surface`/`--u-surface-card`/`--u-ink`, radii across 6/7/8/pill, two weights), which freezes accidental inconsistency into the type system as if it were intentional. That is exactly the debt the umbrella epic and the standing quality bar exist to remove. Rejected on the user's Option-3 decision: normalize the messy subset now rather than encode it.

### Option C: A permissive `className`/`style` escape hatch on `Button` to absorb every per-site delta

Give `Button` a single base look and let each call site pass its bespoke class through to reproduce its pixels.

- Pros: trivially zero-diff (the old classes still apply); smallest component.
- Cons: **defeats the entire point** and violates ADR 0038 §2's load-bearing rule ("a `className`, if allowed at all, is additive layout-only and never a way to re-skin"). A restyle would still be an N-site sweep because the skin still lives at the call site. It would also make the guard meaningless (every button is "migrated" but nothing is centralized). Rejected on the §2 rule and the epic's purpose.

## Decision

We choose **Option 3**. It is the only option that reaches the clean, minimal variant set the epic targets without shipping the `tone` grab-bag that Option A's zero-diff constraint forces (the debt the Implementer escalated), and without the §2-violating re-skin hatch of Option C. The cost is that this story changes pixels on a defined, enumerated subset and updates the Story-39 baselines deliberately, in a labeled commit, after the user signs off the §0 judgment calls and the §2 deltas. The deferred `Link`/`Pill`/listbox sites and their reasoned guard allowlist carry over unchanged from the prior plan.

### 1. The prop contract

**`Button`** extends the intrinsic button props so every native attribute passes through, then adds the typed design axes:

```ts
// packages/ui/src/components/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

// "ink" is subject to JC-1: keep it (3a, recommended) or drop it and map the
// four ink-fill buttons to "primary" (3b). The contract below shows 3a.
export type ButtonVariant = "primary" | "secondary" | "ink" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // default "primary"
  size?: ButtonSize;         // default "md"
  // `accent` is the only sub-modifier that survives: it selects the deliberate
  // amber-outline look on variant="secondary" (rp-personalize, JC-2b). It is a
  // single boolean tied to one intentional style, NOT a re-skin axis. It has no
  // effect on other variants. (If JC-2b resolves to "fold in", this is dropped.)
  accent?: boolean;
  loading?: boolean;         // see §4 a11y plan; sets aria-busy, renders no spinner yet
  // `selected` models the -on/-active toggle state; sets the selected class.
  // It does NOT force aria-pressed (tabs use aria-selected; the caller passes
  // the correct aria for its role). Distinct from native `disabled` (passed through).
  selected?: boolean;
  // `block` makes the button full-width (the width:100% / flex:1 layout cases),
  // a layout prop, NOT a skin. This removes the only legitimate reason a call
  // site would want a width className.
  block?: boolean;
  className?: string;        // ADDITIVE LAYOUT-ONLY (see className policy)
  children: ReactNode;
}
```

The `tone` axis from the prior (Option A) plan is **removed entirely**: normalization (§2) collapses the divergence that `tone` existed to reproduce, so no grab-bag enum is needed. The only surviving sub-modifier is the single `accent` boolean on `secondary`, tied to one intentional amber-outline look.

- `type` is **not** defaulted to `"submit"`. Native `<button>` defaults to `type="submit"`; today every call site sets `type` explicitly (`button` or `submit`). To preserve that exactly and avoid a latent form-submit regression, the primitive **requires the caller to keep passing `type`** (it flows through `ButtonHTMLAttributes`); the Implementer carries each site's existing `type` verbatim. (Defaulting `type="button"` would change two `type="submit"` sites' behavior; defaulting `"submit"` would change ~30 `type="button"` sites'. Passing through is the zero-diff choice.)
- `onClick`, `disabled`, `aria-*`, `role`, `form`, `onMouseDown`, `key` all flow through the intrinsic spread.

**`IconButton`** is the icon-only sibling. It has no visible text, so an accessible name is **required**:

```ts
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  "aria-label": string;          // REQUIRED; there is no visible text
  variant?: "ghost" | "bare";    // the two icon-only looks in use (see map)
  size?: ButtonSize;
  shape?: "circle" | "square";   // acct-trigger is a circle; rate-star is bare
  selected?: boolean;            // rate-star uses aria-pressed
  className?: string;            // additive layout-only
  children: ReactNode;           // the icon node (an SVG today; the <Icon> registry is story 9)
}
```

The icon child is passed as `children` (the raw `<Star>` / `<Avatar>` node today), **not** an `icon-name` prop: the icon registry does not exist yet (ADR 0038 §3, epic story 9), so `IconButton` is the button wrapper only and carries whatever icon node the call site passes today, byte-for-byte. When story 9 builds the registry, `children` becomes `<Icon name>` with no change to `IconButton`'s contract.

**The `as`/polymorphism question (link-or-button):** `Button` is **not** made polymorphic in this story. The one polymorphic case (`cta-btn` `<Btn>`, an `<a>` or `<button>`) is split: its `<button>` branch becomes `<Button>`, its `<a>` branch stays a raw `<a>` until the `Link` primitive (story 10). A general `as` prop would invite re-introducing link-vs-button ambiguity and would need the `Link` primitive's design to be settled first. Deferring polymorphism keeps `Button` a button. (See the `cta-btn` resolution in the map.)

#### The `className` policy (ADR 0038 §2)

`Button`/`IconButton` accept a `className`, **constrained to additive layout-only** and documented as such in the component's doc comment and enforced in spirit by the guard's allowlist (the only files that may carry button *skin* classes are the primitive sources). The skin (color, border, radius, fill, weight, padding, the variant look) is owned entirely by the primitive's own CSS and is **not** reachable through `className`. The legitimate layout needs in the survey are:

- **Full-width / `flex:1`**: `auth-btn-row .auth-submit { flex:1 }`, `acct-signout { width:100% }`, `searchbox-seeall { width:100% }`, `set-save`/`set-clear` in `.set-actions`. These are handled by the typed **`block` prop** (full-width) plus the *parent's* existing layout CSS (the row/track classes stay on the parent `<div>`, unchanged). No skin escapes.
- **`align-self:flex-start`** (`rate-submit`, `sub-submit-btn`): a one-line layout rule. The parent context already provides the flex column; this is the button positioning itself. Handled by an additive layout `className` (e.g. the existing `.rate-submit` rule's `align-self` is kept as a *layout-only* leftover class on the element, OR folded into a `block={false}` default with the parent setting alignment). The Implementer keeps these as additive layout classes that carry **no** color/border/radius/fill; the guard (color/spacing/etc. guards from 40-44 plus this story's review) ensures they are layout-only.

The rule the ADR fixes: **a `className` on `Button` may set margin, grid/flex placement, `align-self`, or width-context, and nothing else.** If a call site needs a different *look*, that is a missing `variant`/`size`, raised to the gate, not a `className`. Under Option 3 the buttons collapse onto clean variant slots, so there is **no case-(c) overflow**: every in-scope button lands on a named variant/size/state, either zero-diff or normalized to it (§2). The `className` escape hatch is therefore needed only for genuine layout (`block`, `align-self`, margins), never for skin.

### 2. The CLEAN VARIANT SET and the NORMALIZATION PLAN (every in-scope button → target, ZERO-DIFF or NORMALIZE + exact delta)

The clean set the in-scope buttons collapse onto (recommendation 3a; if the user picks 3b, `ink` folds into `primary`):

- **`variant="primary"`** (amber CTA). `background:--u-amber; color:--u-parchment; border:none; border-radius:--u-radius (8px)`, hover `--u-amber-hover`. The single accent affirmative action.
- **`variant="ink"`** (JC-1, ink-fill curation commit). `background:--u-ink; color:--u-surface-card; border:none; border-radius:--u-radius (8px)`. "Commit this curation action."
- **`variant="secondary"`** (outline). `background:transparent; color:--u-ink; border:1px --u-border; border-radius:--u-radius (8px)`. Plus the closed `accent` flag (JC-2b) for the amber-outline look (`color`+`border` → `--u-amber`).
- **`variant="ghost"`** (text-forward, no border, transparent fill). Carries the `selected` toggle look (one unified surface-card-fill + `--u-elevation-1b` + `--u-radius-6` per JC-4) and full-width menu/footer rows via `block`.
- **`variant="danger"`** (`--signal-negative`). Defined for contract completeness; red at rest is unused (red is a state, see below).
- **`size: sm | md | lg`** carries the padding scale. **state props:** `selected`, `block`, `loading`, `disabled` passthrough; `accent` (secondary only). Every button has a standardized 2px amber `:focus-visible` ring (JC-5).

Each row below states: target → **ZERO-DIFF** (already on the clean slot, only markup/class moves) or **NORMALIZE** (pixels change; lists the exact delta). Buttons grouped by target variant so the user can see what each variant looks like and which buttons move. **Every NORMALIZE row drives the baseline update.** Token pixel facts used below (verified against `packages/ui/styles/tokens.css`): `--u-radius`=8px, `--u-radius-6`=6px, `--u-radius-7`=7px, `--u-radius-pill`=999px; `--u-elevation-1b`=`0 1px 3px ink-tint-12`, `--u-elevation-1c`=`0 1px 3px ink-tint-14`.

**→ `variant="primary"` (amber fill, `--u-parchment` text, 8px radius).**

| Button | Target | ZERO-DIFF / NORMALIZE | Exact delta |
|---|---|---|---|
| `auth-submit` (×2) | `primary size="md"`, `type` passed | ZERO-DIFF | none (`12 16`, medium = `md`) |
| `sub-submit-btn` | `primary size="lg"` | ZERO-DIFF | none (`12 28` is the `lg` inset; `align-self:flex-start` kept as layout class) |
| `rate-submit` | `primary size="md"` semibold | ZERO-DIFF | none (`10 18`, semibold = the `md`-semibold primary cell; `align-self` kept as layout class) |
| `cta-btn` (button branch) | `primary size="md"` | ZERO-DIFF | none (`10 26`); `<a>` branch deferred to story 10 |
| `follow-follow` | `primary` + icon child + `block`/min-width layout | ZERO-DIFF | none. `border:1px --u-amber` over an amber fill is the same color, so identical to the borderless primary; `min-width:116px` is a layout class; the focus ring is the now-standard 2px amber ring it already had |
| `set-save` (×2) | `primary size="md"` | **NORMALIZE** | text `--u-night` → `--u-parchment` (drop the off-color text; `--u-night` and `--u-parchment` are close, a small lightening of the label). Resolves the night-text outlier into the one primary text token |
| `foryou-invite-btn` | `primary size="md"` | **NORMALIZE** | text `--u-ink` → `--u-parchment` (same: collapse the off-color text onto the primary text token) |

**→ `variant="ink"` (ink fill, `--u-surface-card` text, 8px radius), JC-1 3a.** If the user picks 3b, all four NORMALIZE to `primary` (amber): fill `--u-ink` → `--u-amber`, text → `--u-parchment` (a large, visible change on four surfaces).

| Button | Target | ZERO-DIFF / NORMALIZE (under 3a) | Exact delta |
|---|---|---|---|
| `dc-proceed` | `ink size="md"` | ZERO-DIFF | none (already ink fill, `--u-surface-card` text, 8px radius, medium, `9 18`) |
| `tagc-apply` | `ink size="md"` | **NORMALIZE** | radius `--u-radius-6` (6px) → `--u-radius` (8px), +2px corner (JC-3). Fill/text already ink |
| `shelfc-add` | `ink size="md"` | **NORMALIZE** | radius `--u-radius-6` (6px) → `--u-radius` (8px), +2px corner (JC-3) |
| `author-edit-save` | `ink size="md"` | **NORMALIZE** | radius `--u-radius-pill` (999px) → `--u-radius` (8px), the largest single normalization (full pill → standard corner); text `--u-on-ink` (#FFF) → `--u-surface-card` (the ink-variant text token; near-identical white). Weight stays semibold |

**→ `variant="secondary"` (transparent fill, `--u-ink` text, `1px --u-border`, 8px radius).**

| Button | Target | ZERO-DIFF / NORMALIZE | Exact delta |
|---|---|---|---|
| `set-clear` | `secondary size="md"` | **NORMALIZE** | border `--u-border-hover` → `--u-border` (canonical secondary border; resting border lightens slightly to match the cluster) |
| `cs-promote` | `secondary size="sm"` | ZERO-DIFF | none (`5 12`, `--u-border` border, ink text = `sm` secondary) |
| `copy-btn` | `secondary size="sm"` + icon child | **NORMALIZE** | border `--u-border-hover` → `--u-border` (same canonical-border collapse) |
| `search-more-btn` | `secondary size="md"` | **NORMALIZE** | fill `--u-surface-card` → transparent; border `--u-ink-tint-20` → `--u-border` (collapse onto the canonical secondary fill+border) |
| `pov-btn` | `secondary size="sm"` | **NORMALIZE** | text `--u-muted` → `--u-ink` (JC-2, small darkening); border `--u-border-hover` → `--u-border` |
| `shelfc-remove` | `secondary size="sm"` | **NORMALIZE** | text `--u-muted` → `--u-ink` (JC-2); radius `--u-radius-6` (6px) → `--u-radius` (8px), +2px (JC-3); border `--u-ink-tint-20` → `--u-border` |
| `claim-btn` | `secondary size="md"` | **NORMALIZE** | radius `--u-radius-7` (7px) → `--u-radius` (8px), +1px (JC-3); border `--u-line-warm` → `--u-border`; fill `--u-surface` → transparent |
| `tagc-dispute` | `secondary size="md"` | **NORMALIZE** | radius `--u-radius-6` (6px) → `--u-radius` (8px), +2px (JC-3); border `--u-ink-tint-20` → `--u-border` |
| `dc-proceed-quiet` | `secondary size="md"` | **NORMALIZE** | weight regular → medium (the secondary canonical weight; collapses the lone regular-weight outline); border `--u-ink-tint-20` → `--u-border` |
| `rp-personalize` | `secondary size="md" accent` | ZERO-DIFF | none. The `accent` flag selects the deliberate amber `color`+`border` look (JC-2b); it is kept exactly |

**→ `variant="secondary"` with `danger` state (red is a state, never a resting variant).**

| Button | Target | ZERO-DIFF / NORMALIZE | Exact delta |
|---|---|---|---|
| `follow-following` | `secondary` + `selected`/unfollow danger **state** | ZERO-DIFF | none. The `.is-unfollow` red look (text+border+focus → `--signal-negative`) is reproduced as the danger state on secondary, value-for-value. `--u-border` resting border matches the secondary normalization above |

**→ `variant="ghost"` (no border, transparent, text-forward).**

| Button | Target | ZERO-DIFF / NORMALIZE | Exact delta |
|---|---|---|---|
| `acct-signout` | `ghost` + `block` + `role="menuitem"`; red hover | ZERO-DIFF | none. Red hover is ghost's hover treatment; the `width:100%`/`border-top`/`text-align:left` menu-row layout stays as a layout class on the parent menu (the `.acct-menu hr` sibling rule kept) |
| `searchbox-seeall` | `ghost` + `block`; amber text; footer-corner radius | ZERO-DIFF | none. Amber-text ghost is a legitimate ghost look (text-only, no fill); the `0 0 7 7` bottom-corner radius and `border-top` are menu-footer **layout**, kept as a layout class |
| `rp-tab` (×2) | `ghost size="sm" selected={…}` | ZERO-DIFF (if JC-4 unifies onto 1b/6, which `rp-tab-on` already uses) | none. `selected` = the unified surface-card + `--u-elevation-1b` + `--u-radius-6` look; `role="tab"`/`aria-selected` passed |
| `pov-sw` (×2) | `ghost size="sm" selected={…}` | **NORMALIZE** (JC-4) | selected shadow `--u-elevation-1c` (`ink-tint-14`) → `--u-elevation-1b` (`ink-tint-12`), a ~2% shadow-alpha drop; selected radius `--u-radius-7` (7px) → `--u-radius-6` (6px), -1px. Sub-perceptible; unifies the two toggle looks onto one `selected` look |

**→ `IconButton` (icon-only; `aria-label` required).**

| Button | Target | ZERO-DIFF / NORMALIZE | Exact delta |
|---|---|---|---|
| `acct-trigger` | `IconButton variant="bare" shape="circle"`; child `<Avatar>`; aria passed | ZERO-DIFF | none (already 2px amber focus ring; circle; bare) |
| `rate-star` (×5) | `IconButton variant="bare" shape="square" selected={score===n}`; child `<Star>`; aria-label passed | ZERO-DIFF | none. Gains the standardized focus ring (JC-5), which does not show at rest, so no at-rest baseline change |

**→ DEFERRED (stay raw `<button>` this story; allowlisted by class; see §3).** `auth-linklike` ×2, `sub-back` (link-styled → `Link`/story 10); `gps-pill`, `rated-by-more` (pills → `Pill`/story 10); `searchbox-hit` (`role="option"` listbox item → future listbox/Option primitive). No pixel change, no baseline impact.

**Normalization roll-up (the buttons that change pixels and drive the baseline update):**

- **Off-color primary text → `--u-parchment`:** `set-save` (×2), `foryou-invite-btn` (small label lightening).
- **Ink-variant radius → 8px:** `tagc-apply`, `shelfc-add` (+2px); `author-edit-save` (pill → 8px, the largest single change) and its text token to `--u-surface-card`.
- **Secondary border → `--u-border`, fill → transparent:** `set-clear`, `copy-btn`, `search-more-btn`, `pov-btn`, `shelfc-remove`, `claim-btn`, `tagc-dispute`, `dc-proceed-quiet`.
- **Secondary muted text → `--u-ink`:** `pov-btn`, `shelfc-remove`.
- **Secondary radius → 8px:** `claim-btn` (+1px), `shelfc-remove` (+2px), `tagc-dispute` (+2px).
- **`dc-proceed-quiet` weight regular → medium.**
- **Toggle unify:** `pov-sw` (shadow alpha + 1px radius).
- **If JC-1 = 3b:** add `tagc-apply`, `shelfc-add`, `dc-proceed`, `author-edit-save` flipping ink → amber (four large changes).

Every other in-scope button is **ZERO-DIFF**: `auth-submit` ×2, `sub-submit-btn`, `rate-submit`, `cta-btn` (button branch), `follow-follow`, `dc-proceed` (under 3a), `cs-promote`, `rp-personalize`, `follow-following`, `acct-signout`, `searchbox-seeall`, `rp-tab` ×2 (under the 1b/6 unify), `acct-trigger`, `rate-star` ×5. These do **not** move the baseline; the visual job proves they held.

#### Size/weight reconciliation (how `size` carries the padding/weight scale)

The in-scope buttons use these padding pairs: `12 16`, `12 28`, `10 18`, `9 20`, `9 18`, `9 16`, `10 26`, `8 16`, `8 18`, `7 16`, `5 12`, `4 10`, plus two weights (medium, semibold). Under Option 3 these are **not** reproduced one-for-one through a grab-bag; the primitive defines a clean `size` scale per variant (`sm`/`md`/`lg`) and the migration maps each button to its size. Where a button's exact inset is already its variant+size cell (e.g. `12 16` = primary `md`, `12 28` = primary `lg`, `5 12` = secondary `sm`), it is ZERO-DIFF. Where a padding is a stray that does not fall on a size step, it normalizes to the nearest size's canonical inset and is listed as a NORMALIZE row above (none of the current rows hide a padding normalization beyond what is stated; the Implementer confirms each inset against the size scale and, if a button's padding would shift, surfaces it as an added delta before the baseline update). The semibold weight is carried where the variant/size cell is semibold (the primary `md`-semibold cell for `rate-submit`, the ink semibold for `author-edit-save`); the lone regular-weight `dc-proceed-quiet` normalizes up to medium (above). There is no fourth weight knob.

#### The `danger` variant and the red-state decision

There is **no `variant="danger"` button at rest today**, and Option 3 does not create one. Red is a **state**: `follow-following.is-unfollow` (text+border+focus → `--signal-negative`) and `acct-signout:hover` (red bg+text).

- **Define `variant="danger"` in the contract** (so the API is complete and ADR-0038-faithful), CSS keyed to `--signal-negative`, **mapped to no resting button.**
- The red appearances stay **states on their existing variant**: `follow-following`'s unfollow is `secondary` + a danger state (reproduced zero-diff); `acct-signout`'s red hover is `ghost`'s hover treatment (zero-diff). Neither becomes red at rest, so neither moves the at-rest baseline.

**Recommendation:** define `danger` for completeness, keep red as a state. (Alternative: leave `danger` undefined until a real destructive button exists. Rejected; the umbrella names it, defining it costs nothing and changes no pixels.)

### 3. Scope deferrals and how the guard stays honest

Deferred raw `<button>` sites that do NOT migrate this story, each with the reason that goes in the guard allowlist:

| Site(s) | Reason | Retires in |
|---|---|---|
| `auth-linklike` (`AuthEmailSignup.tsx` ×2), `sub-back` (`Submit.tsx`) | link-styled control; `Link`/`variant=link` decision | story 10 |
| `gps-pill` (`GenrePillSelector.tsx`), `rated-by-more` (`RatedByRow.tsx`) | selectable/count pill; `Pill` primitive | story 10 |
| `searchbox-hit` (`SearchBox.tsx`) | `role="option"` listbox item; not a control button | future listbox/Option primitive |

**How the guard stays honest (the important part):** the no-raw-`<button>` guard ships **this story** and is **green on landing**, but its allowlist is split into two clearly-commented sets:

1. **Primitive sources** (the legitimate permanent home): `packages/ui/src/components/Button.tsx`, `packages/ui/src/components/IconButton.tsx`. These are where a raw `<button>` is *supposed* to live.
2. **Temporary deferral exemptions** (the five sites above), each named by its **deferred class** (`auth-linklike`, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit`) **with its reason and its retiring story**, in a separate `DEFERRED` block in the guard with a comment that says "these MUST shrink to empty as stories 10+ land; do not add to this list."

This keeps the guard honest three ways: (a) it is real and red-on-regression for every *migrated* button immediately; (b) the exemption is keyed to the five deferred *class names*, not to whole files, so a *new* raw `<button>` with any other class (or none) still fails even inside a file that already holds a deferred button, and a migrated button cannot accidentally match because it loses its bespoke class; (c) the ADR and the guard comment record that the `DEFERRED` block is a countdown to empty.

**Tightening note for the Implementer:** to avoid a file-level exemption hiding a *future* stray button in `SearchBox.tsx`/`Submit.tsx`/`AuthEmailSignup.tsx` (which also contain migrated buttons or could gain new ones), prefer exempting by a **specific marker** over exempting the whole file. Two honest mechanisms, Implementer's choice:
   - **(i) Class-name allowlist:** the guard exempts a raw `<button>` only if its `className` contains one of the named deferred classes (`auth-linklike`, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit`). A new raw `<button>` with any other class fails. This is the tightest and is **recommended**.
   - **(ii) Inline marker comment:** each deferred `<button>` carries a `/* eslint-disable-next-line unbnd/no-raw-button; deferred to story 10 */`-style sentinel the guard recognizes. More ceremony; only if (i) proves brittle.

Recommendation: **(i) class-name allowlist**; the deferred classes are stable and unique, the migrated buttons lose their classes (so they cannot collide), and a stray new button cannot accidentally match.

**Alternative considered: ship the guard in story 10 instead.** Rejected: the story AC requires the guard this story, and the migrated 30-ish buttons deserve their lock now. The split allowlist gives an honest guard now without forcing premature `Link`/`Pill` work.

### 4. Accessibility plan (Option 3 lets us improve it, not just preserve it)

Every migrated button preserves its current a11y; because Option 3 already updates baselines, the standardized focus ring (JC-5) is folded in here as a real improvement.

- **Focus ring (standardized, JC-5).** Today only `follow-btn`, `copy-btn`, `acct-trigger` declare a `:focus-visible` ring (2px `--u-amber`, 2px offset); the unfollow state uses a `--signal-negative` ring; most buttons have **no** explicit focus style (UA default). **Decision (Option 3):** the primitive gives **every** `Button`/`IconButton` the standardized 2px `--u-amber` `:focus-visible` ring (2px offset), and the `danger` state keeps the `--signal-negative` ring. This closes a real WCAG 2.4.7 gap. It costs **no at-rest baseline change** because `:focus-visible` rings render only on keyboard focus, and the Story-39 baseline set captures at-rest screens only; so this is a strict a11y improvement that does not diff the current baselines. (Under the old Option A this was deferred precisely because zero-diff was the constraint; Option 3 removes that constraint and the ring is the natural, free win to fold in.)
- **Keyboard.** All targets are native `<button>` (Enter/Space activation, focusability); preserved by construction. `CopyButton`'s "keyboard-focusable for free" rationale holds.
- **Role / aria.** `role="menuitem"` (`acct-signout`), `role="tab"` + `aria-selected` (`rp-tab`, `pov-sw`), `aria-haspopup`/`aria-expanded`/`aria-label` (`acct-trigger`), `aria-pressed` (`rate-star`, `follow-btn`), `aria-label` (`set-save`, `rate-star`, `rated-by-more`, `copy-btn`) all pass through the intrinsic spread, carried verbatim by the Implementer. **The `selected` prop drives the visual selected class only; it does NOT force `aria-pressed`.** Tabs use `aria-selected`, not `aria-pressed`, so the caller keeps passing `role="tab"`/`aria-selected`; the primitive must not stamp `aria-pressed` on a `role="tab"` element. `rate-star`/`follow` keep their `aria-pressed`. This subtlety is unchanged by normalization (normalization touches pixels, not aria).
- **`loading` state a11y.** No button shows a loading affordance today; several `disabled` while submitting (`auth-submit`, `acct-signout`, `search-more-btn`). **Decision:** `loading` is **defined now** and sets `aria-busy="true"` (an a11y improvement that does not render a visible affordance, so it does not move the at-rest baseline). It does **not** auto-`disabled` and renders **no spinner** (the visible spinner is a deliberate later visual story). The submitting buttons keep passing their own `disabled` exactly as today.

### 5. Where the primitive CSS lives and how it ships

- New directory `packages/ui/src/components/`. Files: `Button.tsx` + `Button.css`, `IconButton.tsx` + `IconButton.css` (or one shared `controls.css` imported by both; Implementer's choice; co-location per ADR 0038 §7). Each `.tsx` does `import "./Button.css";` and Vite resolves the workspace CSS import through the `apps/web` bundler (the same mechanism already proven by `@unbnd/ui/styles/tokens.css`).
- The CSS references **only existing semantic tokens** (every value in the inventory is already a `var(--u-*)`), so the prior color/spacing/radius/type/motion guards stay green and no token is minted.
- Re-export from `packages/ui/src/index.ts`: `export { Button } from "./components/Button"; export type { ButtonProps, ButtonVariant, ButtonSize } from "./components/Button"; export { IconButton } from "./components/IconButton"; export type { IconButtonProps } from "./components/IconButton";` (no `ButtonTone`; the `tone` axis is removed).
- The package exports map already covers `.` (JS) and the token CSS; the primitive CSS travels *with* the `.tsx` (imported by it), so **no new `exports` entry is required** (Vite follows the relative CSS import from the resolved `.tsx`). The Implementer confirms the build picks it up (it does for any Vite-resolved workspace `.tsx` that imports a sibling `.css`).
- **Package-config changes (required, see Context):** add `@types/react` + `@types/react-dom` as exact-pinned dev deps to `packages/ui`; add `"jsx": "react-jsx"` and `"DOM"`, `"DOM.Iterable"` to `packages/ui/tsconfig.json`'s `lib`. Without these the package's own `tsc --noEmit` fails on the `.tsx`.

### 6. The guard

`packages/ui/test/architecture-button-literals.test.ts`, mirroring `packages/ui/test/architecture-shape-literals.test.ts` (the same `REPO` resolve, `walk()`, `SKIP_DIRS`, `readFileSync`, single aggregated `expect(offenders).toEqual([])`). Specifics:

- **Scope:** `.tsx` (and `.ts` for `createElement`) under `apps/web/src` only. `SKIP_DIRS` keeps `node_modules`, `dist`, `.git`, `engineering-team`, `e2e`, `data`, `test` (matching the prior guards). It does **not** scan `packages/ui/src/components` for offenders; that is the allowlisted primitive home.
- **Detection:** an offender is a raw `<button` JSX opening tag **that is not inside a line/block comment**. The regex must:
  - match `<button` followed by whitespace, `>`, or `/` (so `<button>`, `<button\n`, `<button/>` all match); but the value-capture is the element, not a substring of an identifier;
  - **exclude comment lines** so `CopyButton.tsx:2`'s `// <button>` is not an offender (strip `//` line comments and `/* */` block comments before scanning, or require the `<button` to be in a JSX context; the cleanest approach is to remove comments first, then match). This directly fixes the "38 vs 37" miscount.
  - also catch the **dynamic/polymorphic** forms so a button cannot hide outside literal syntax: `React.createElement("button"` / `createElement('button'`, and the `const X = cond ? "button" : "a"` polymorphic-tag pattern (`= ... ? "button" : ...` or `"button" :`). The `cta-btn` `<Btn>` is exactly this; once its button branch becomes `<Button>`, the `"button"` literal is gone, so the guard's polymorphic-tag check passing is itself the proof the `<Btn>` was resolved. The Implementer encodes a pattern for `"button"`/`'button'` string literals assigned as a component tag (a `?:` with `"button"` or a `createElement("button"`), reported as an offender unless allowlisted.
- **Allowlist (two blocks, per §3):**
  - `PRIMITIVE_SOURCES` (permanent): `packages/ui/src/components/Button.tsx`, `packages/ui/src/components/IconButton.tsx`; but these are not under `apps/web/src` scope, so they are not scanned anyway; listing them documents intent.
  - `DEFERRED` (temporary, countdown-to-empty): the recommended **class-name allowlist** form; a raw `<button>` is exempt only if its `className` contains one of `auth-linklike`, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit`. Each name carries an inline comment with its retiring story. A raw `<button>` with any other className, or none, is an offender.
- **Green on landing:** after the ~30-button migration and the five named deferrals, the only raw `<button>`s left in `apps/web/src` are the five deferred classes, all exempt, so the guard passes. It is red-on-regression for any new raw `<button>` thereafter.

The guard runs under the existing `pnpm -r test` (it lives in `packages/ui/test/` and `@unbnd/ui`'s `test` script is `vitest run`). No CI wiring change.

### 6.5 The baseline-update mechanic (this story DOES update baselines, deliberately)

Under Option 3 the migration produces two render outcomes, and the Story-39 (ADR 0039) `visual` job proves both. The procedure, in order:

1. **Build the primitives and migrate.** The zero-diff buttons (§2: `auth-submit` ×2, `sub-submit-btn`, `rate-submit`, `cta-btn` button branch, `follow-follow`, `dc-proceed`, `cs-promote`, `rp-personalize`, `follow-following`, `acct-signout`, `searchbox-seeall`, `rp-tab` ×2, `acct-trigger`, `rate-star` ×5) render identically; the normalized buttons render to their stated §2 targets.
2. **Run `test:visual` against the existing committed baselines.** The expected result is a diff **only** on the screens that contain a normalized button (per the §2 roll-up: auth/settings screens for `set-save`/`set-clear`, home for `foryou-invite-btn`, book detail for the tag/shelf/ratings controls, submit for `dc-proceed-quiet`/`claim-btn`, profile for `pov-btn`/`pov-sw`, etc.). A diff on a screen that contains **only** zero-diff buttons is a bug (the migration changed pixels it should not have) and is investigated, not re-baselined.
3. **Review the before/after.** The orchestrator presents the diff PNGs (Playwright's expected/actual/diff artifacts) alongside the §2 deltas. The user confirms each changed screen matches the intended normalization and nothing else moved.
4. **Regenerate the baselines deliberately, in a separate labeled commit.** Per ADR 0039, baselines are updated **only inside the pinned `mcr.microsoft.com/playwright:v<version>-jammy` image** via `pnpm --filter @unbnd/web test:visual:update`. The commit message states the intended visual delta (the §2 normalization) and the brand-rule review, and is **separate from** the structural migration commit, so "structure changed, pixels held" (the zero-diff buttons) and "pixels intentionally changed" (the normalized buttons) stay two distinct, auditable events. This is ADR 0039's intentional-visual-change path, used as designed.
5. **Confirm green.** A fresh `test:visual` run is zero-diff against the new baselines; `pnpm -r typecheck`, `pnpm -r test` (the new guard + prior guards), and `pnpm --filter @unbnd/web build` all pass.

**Zero-diff set vs normalized set, explicitly:** the §2 roll-up is the contract. The zero-diff buttons MUST NOT move any baseline (their screens, if they contain no normalized button, stay byte-identical). The normalized buttons drive the baseline update and MUST match their stated deltas. The reviewer holds both halves: a stray diff on a pure-zero-diff screen fails the story; a normalized screen that does not match its stated delta fails the story.

### 7. Two-outcome render reality (be explicit)

A structural primitive migration changes the markup (a `<button class="x">` becomes `<Button variant=…>` rendering `<button class="ui-button ui-button--primary">`), so class names change and any CSS specificity, sibling-combinator, or descendant rule that targeted the old class on a non-button context could shift. Under Option 3 there are two intended outcomes and one failure mode:

- **Intended zero-diff** (the consistent buttons): the new variant CSS is authored to the captured token-backed values value-for-value, so the screen is byte-identical. Proven by a zero-diff `visual` run on those screens.
- **Intended normalization** (the §2 NORMALIZE rows): the screen changes to exactly the stated delta and the baseline is updated deliberately (§6.5).
- **Failure mode, unintended drift:** a pixel change on a screen that should be zero-diff, or a normalized screen that moved further than its stated delta. Investigated, never re-baselined to paper over.

Mitigations:

- **Per-button exact authoring.** Each variant/size/state CSS is authored to the §2 values (the consistent ones to their current values, the normalized ones to their target values).
- **The Story-39 `visual` job** is the backstop on home, book detail, profile, search, auth, submit; it diffs at the pixel and is the gate that distinguishes intended normalization from accidental drift.
- **Specificity watch.** The old per-site classes appear in compound selectors (`.auth-btn-row .auth-submit { flex:1 }`, `.acct-menu hr, .acct-signout { margin-top }`, `.pov-sw-active`, `.rp-tab-on`, `.is-unfollow`, `.dc-proceed-quiet`, `.gps-on`/`.gps-off`). The Implementer preserves the *layout/state* halves of these (kept on the parent or expressed via `selected`/`block`/`accent`) while the *skin* moves into the primitive. The AC's "classes that also style non-button siblings keep only their non-button rules" applies to: `acct-signout`'s `.acct-menu hr, .acct-signout { margin-top }` (the `hr` half stays) and any `.auth-btn-row` layout (the row class stays on the `<div>`).

**Buttons that warrant the closest visual-gate attention** (normalization makes them deterministic, but the Implementer confirms the exact pixel target before the baseline update):

- **The unified toggle look** (JC-4): `pov-sw` moves from `--u-elevation-1c`+`--u-radius-7` to `--u-elevation-1b`+`--u-radius-6`. Confirm the selected `pov-sw` matches the (unchanged) `rp-tab-on` look exactly after the unify.
- **`author-edit-save`** (JC-3): pill → 8px is the largest single delta; confirm the corner and that the `--u-on-ink` → `--u-surface-card` text token is visually equivalent (both near-white).
- **The secondary border collapse** (`--u-border-hover`/`--u-ink-tint-20`/`--u-line-warm` → `--u-border`): confirm the resting border on `set-clear`, `copy-btn`, `search-more-btn`, `pov-btn`, `shelfc-remove`, `claim-btn`, `tagc-dispute`, `dc-proceed-quiet` all land on the one secondary border value.
- **The off-color primary text collapse** (`set-save` `--u-night`, `foryou-invite-btn` `--u-ink` → `--u-parchment`): confirm the label color matches the other amber primaries.

These are normalizations with known targets, not unresolved case-(c) escapes; the §2 table fixes each one and §6.5 is how they reach the baseline.

## Consequences

- **Enables** a future button restyle as one component edit (the epic's goal), with the gain held by the no-raw-`<button>` guard rather than review vigilance. Establishes the `packages/ui/src/components/` layer the package lacked.
- **Removes accidental inconsistency now** rather than encoding it. The buttons land on a clean variant set (`primary | secondary | ink | ghost | danger` + `size` + state props + the single `accent` flag); the `tone` grab-bag the prior plan needed is **eliminated**. The stray radii, muted secondary text, off-color primary text, the lone pill, and the two near-duplicate toggle looks are normalized away. This is the epic's purpose realized in the button layer, not deferred.
- **Constrains** all future button work: new buttons go through `Button`/`IconButton` on the clean set; the guard enforces it. The `DEFERRED` allowlist is the one documented temporary bridge (link/pill/option sites), retired by story 10 and a future listbox primitive.
- **Folds in an a11y win:** the standardized 2px amber `:focus-visible` ring across all buttons (JC-5), free against the at-rest baselines.
- **New debt / follow-ups:** (1) if JC-1 resolves to 3a, `variant="ink"` is a deliberate fifth variant the design team may later choose to retire (a clean, scoped follow-up, not hidden debt); (2) the `DEFERRED` allowlist must shrink to empty as story 10 (`Link`, `Pill`) and a future listbox/Option primitive land; (3) the visible `loading` spinner is a later visual story (the prop sets `aria-busy` now). The off-color/ stray-radius/toggle inconsistencies are **resolved**, not carried.
- **Affects existing fixtures?** No data fixtures change. The Story-39 **visual baselines DO change**, deliberately, for the screens that contain a normalized button (§2 roll-up), updated in a separate labeled commit after sign-off per ADR 0039 (§6.5). The zero-diff buttons do not move their baselines. This is an intentional visual-change story, not a pure refactor.
- **New dependency?** No new third-party runtime dependency. `@types/react` + `@types/react-dom` are added as **dev** deps to `packages/ui` (they already exist in the workspace for `apps/web`; this makes the UI package self-typecheckable). Pinned exact, no caret. The primitives are new `.tsx` modules in the existing `@unbnd/ui` package; the guard is a new Vitest test in the existing `packages/ui/test/`. No new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes. Phase 2 platform hardening (extends PRD §2.11 / Block E per ADR 0038), recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors (Architect is read-only on source; these are targets, not edits made here):

- **Primitives:** `packages/ui/src/components/Button.tsx` (+ `Button.css`), `packages/ui/src/components/IconButton.tsx` (+ `IconButton.css`). Prop contracts per §1 (clean variant set, `accent` flag, standardized focus ring; no `tone`). CSS authored to the §2 targets: the zero-diff buttons to their current token-backed values, the normalized buttons to their stated target values. References only existing `var(--u-*)` tokens (no new token). Each `.tsx` imports its sibling `.css`.
- **Index:** re-export `Button`/`IconButton` and their types from `packages/ui/src/index.ts`.
- **Package config:** `packages/ui/package.json`; add `@types/react` and `@types/react-dom` (exact pins matching `apps/web`'s `@types/react@18.3.x`) to `devDependencies`. `packages/ui/tsconfig.json`; add `"jsx": "react-jsx"`, and `"DOM"`, `"DOM.Iterable"` to `lib`.
- **Migration (the ~30 in-scope buttons):** replace each raw `<button className="…">` per the §2 plan, carrying `type`, `onClick`, `disabled`, every `aria-*`, `role`, `key`, and the visible label verbatim. For zero-diff buttons, move the bespoke skin into the primitive value-for-value; for the §2 NORMALIZE rows, author the primitive CSS to the **target** value (the delta) rather than the old one. Keep only the *layout/non-button-sibling* rules at the call site (e.g. `.auth-btn-row` row layout, `.acct-menu hr` margin, the `.set-actions`/`.rate`/`.rp-controls` parent layout). Toggle buttons (`rp-tab`, `pov-sw`, `rate-star`, `follow`) use `selected` for the visual state but keep passing their own `role`/`aria-selected`/`aria-pressed` (do not let `selected` force the wrong aria).
- **The `cta-btn` `<Btn>`:** in `CallToAction.tsx`, the `ctaHref ? "a" : "button"` polymorphism splits; render `<Button>` for the button branch (zero-diff `primary`), keep a raw `<a className="cta-btn">` (or the existing `<Btn>`-as-`<a>`) for the link branch until story 10's `Link`. The `cta-btn` skin moves to the `primary` variant; the `<a>` branch keeps a link-only class. After this, no `"button"` tag literal remains in the file, so the guard's polymorphic-tag check passes.
- **Deferred sites (stay raw `<button>`):** `auth-linklike` ×2, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit`; unchanged this story; allowlisted by class name in the guard with their retiring-story comments.
- **Guard:** `packages/ui/test/architecture-button-literals.test.ts` per §6; comment-stripping `<button`/`createElement("button"`/polymorphic-`"button"`-tag detection over `apps/web/src` `.ts/.tsx`, class-name `DEFERRED` allowlist, single aggregated assertion. Mirror `architecture-shape-literals.test.ts`.
- **Baseline update (§6.5):** after the migration, run `test:visual`; expect diffs only on screens with a normalized button (§2 roll-up); review the before/after with the user; regenerate the affected baselines **inside the pinned Playwright Docker image** via `test:visual:update`, committed **separately** from the structural change with a message stating the intended §2 delta and the brand-rule review (ADR 0039 intentional-change path).
- **Verification gate:** `pnpm -r typecheck` (new prop types + UI package self-typecheck), `pnpm -r test` (the new guard + all prior guards 40-44 + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job. The visual job is zero-diff **against the updated baselines**; a diff on a pure-zero-diff screen, or a normalized screen that moved beyond its stated §2 delta, is investigated, never re-baselined to hide it.

## Out of scope

- **The IN-SCOPE normalizations are NOT out of scope** (this is the Option-3 pivot): collapsing the off-color primary text, the stray radii, the lone pill, the muted secondary text, and the two near-duplicate toggle looks are done **this story**, with deliberate baseline updates (§2, §6.5). What stays out of scope: any normalization **beyond** the §2 NORMALIZE rows, and (if JC-1 = 3a) flipping the ink variant to amber, which would be a separate, scoped follow-up.
- **Any `className`/`style` re-skin escape hatch** (ADR 0038 §2). The `className` is additive layout-only.
- **The `Link` primitive and `variant="link"`** (`auth-linklike`, `sub-back`, `auth-btn-secondary` links, the `cta-btn` `<a>` branch): epic story 10.
- **The `Pill` primitive** (`gps-pill`, `rated-by-more`): epic story 10.
- **A listbox/Option primitive** (`searchbox-hit`): future, no story yet.
- **The icon registry / `<Icon>`**: epic story 9. `IconButton` carries today's raw icon node as `children`; the registry migration is later.
- **Other primitives** (`Input`, `Field`/`Label`, `Card`, `Avatar`): epic story 10.
- **A visible `loading` spinner**: a later visual story (the prop sets `aria-busy` now; no spinner). The standardized focus ring is **in scope** this story (JC-5), folded in because we are already updating baselines.
- **Any token change**: the token system is complete (Stories 40-44).
- **Re-pointing the `CLAUDE.md`/`AGENTS.md` "primitives are the source of truth" doc rule and citing the new guard**: epic story 14.
