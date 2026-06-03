# ADR 0045: `Button` and `IconButton` primitives, the bespoke-button migration, and the no-raw-`<button>` guard

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/45-button-iconbutton-primitives.md`

**Approved 2026-06-03** at the architecture gate, after the user reviewed the full variant mapping, risks, and tradeoffs. Decision: **Option A — pure zero-diff refactor.** Gate resolutions: (1) reproduce every outlier exactly via the closed typed `tone` enum (`default`/`ink`/`night`) + `size`/`selected`/`block` props + additive-layout-only `className`; **no visual normalization** in this story; (2) `variant="danger"` defined for contract completeness but mapped to NO button at rest (red stays a state); (3) defer the 5 link/pill/option sites (`auth-linklike` ×2, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit`) to story 10 / a future Option primitive, with the guard exempting them **by class name** (documented countdown-to-empty); (4) reproduce each button's CURRENT focus treatment (add NO new focus ring) and ship `loading` as a no-op render (`aria-busy` only) — both kept zero-diff; the standardized-focus-ring/visible-spinner are a deferred a11y/visual story; (5) any button that genuinely cannot be reproduced zero-diff is ESCALATED to the user (a case-(c) decision), never silently normalized; the Story-39 visual job is the hard backstop and no baseline is updated. **Normalization opportunities recorded for a future deliberate story:** ink-fill primaries → amber?, `claim-btn`/`author-edit-save` odd radii, unify the two toggle looks, and standardize focus rings (a11y win).

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03; §2 primitive component library and the `className` rule, §6 CI guards, §7 package and CSS delivery). Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job: `maxDiffPixelRatio: 0`, and the discipline that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Builds on the `@unbnd/ui` source-export precedent set by **ADR 0040** (`GENRE_PALETTE`/`SEMANTIC_COLORS` from `packages/ui/src/*`, re-exported from `index.ts`) and the guard precedent set by ADRs 0040 to 0044 (`packages/ui/test/architecture-*.test.ts`, mirroring `packages/trust/test/architecture.test.ts`). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 8, the first structural story). It does not relitigate 0038 or 0039.

This is the first story to build a real React primitive on the token foundation. The token axes are complete (Stories 40 to 44), so every value a button needs already exists as a semantic token; this story mints no tokens. The design judgment here is the prop contract, the variant-to-button map (especially the outliers that do not fall on a clean variant), the scope deferrals, and how the guard stays honest given those deferrals.

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
- The Story-39 `visual` job is zero-diff; no baseline is updated. Any button that cannot be reproduced zero-diff by a clean variant is escalated explicitly, never silently normalized.

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

- **Zero-diff is the prime directive** (ADR 0039; story AC). Markup changes, not value changes, so the risk is structural (a wrapper, a class rename, a flex context) more than chromatic. The `visual` job is the backstop on every key screen.
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

## Options considered

The load-bearing decisions are (1) the prop contract and the `className` policy, (2) how the outliers are reproduced zero-diff vs normalized, (3) the scope deferrals and how the guard stays honest, and (4) the guard's detection strategy. Options are framed around the first two; the rest follow.

### Option A: Single `Button` with `variant`/`size`/state, outliers reproduced exactly by extending the typed prop surface, link-styled/pill/option buttons deferred (CHOSEN)

`Button` and `IconButton` expose the ADR 0038 §2 contract (`variant: primary|secondary|ghost|danger`, `size: sm|md|lg`, state via real props). The amber and outline clusters map onto `variant`/`size`. The genuinely divergent buttons (ink-fill primaries, the per-site text/weight/radius deltas) are reproduced **zero-diff** by a small, **typed, enumerated** extra axis (`tone`) and a documented additive-layout-only `className`; never an open re-skin. Link-styled buttons (`auth-linklike`, `sub-back`), the pill/toggle controls (`gps-pill`, `rated-by-more`), and the `role="option"` search row (`searchbox-hit`) are **deferred** to their proper primitives (`Link`, `Pill`, a listbox option), with the guard's allowlist temporarily naming those specific deferred sites with a recorded reason.

- Pros: holds the zero-diff prime directive on every button; keeps the API typed and closed (no `className` re-skin); defers the buttons that are honestly a different primitive rather than forcing them into `Button` and incurring product debt; the guard ships green this story by exempting the named deferrals with a reason, and tightens automatically as story 10 retires each exemption.
- Cons: introduces a `tone` axis beyond the §2 four variants (an API surface the umbrella did not name), and the temporary allowlist of deferred sites means the guard is not "zero raw `<button>` with an empty allowlist" this story. Both are honest, documented, and shrink over time. Mitigated by making `tone` a closed enum tied to real existing buttons, and by the allowlist carrying a per-site reason so it cannot become a dumping ground.

### Option B: Normalize the outliers now onto the clean four-variant API

Map the ink-fill primaries to `variant="primary"` (accepting they become amber), collapse the per-site text/weight/radius deltas to one canonical primary/secondary, and update the affected baselines in a labeled commit.

- Pros: the cleanest possible API (exactly the §2 four variants, no `tone`); kills the visual inconsistency the epic eventually wants gone; no temporary allowlist deltas for the outliers.
- Cons: **violates this story's prime directive.** Normalization changes pixels (ink → amber on four buttons, text/weight/radius shifts on several), which fails the Story-39 `visual` job and requires design sign-off and baseline updates. ADR 0038 and the story are explicit that normalization is a separate, later, intentional visual-change story (path B), not this one. Rejected as out-of-scope for a behavior-preserving refactor. (It is the right *eventual* path for some of these; see Recommended path and Out of scope.)

### Option C: A permissive `className`/`style` escape hatch on `Button` to absorb every per-site delta

Give `Button` a single base look and let each call site pass its bespoke class through to reproduce its pixels.

- Pros: trivially zero-diff (the old classes still apply); smallest component.
- Cons: **defeats the entire point** and violates ADR 0038 §2's load-bearing rule ("a `className`, if allowed at all, is additive layout-only and never a way to re-skin"). A restyle would still be an N-site sweep because the skin still lives at the call site. It would also make the guard meaningless (every button is "migrated" but nothing is centralized). Rejected on the §2 rule and the epic's purpose.

## Decision

We choose **Option A**. It is the only option that holds the zero-diff prime directive (unlike B) while keeping the skin inside the primitive behind a typed, closed prop surface (unlike C). The `tone` axis and the temporary, reasoned allowlist are the honest cost of reproducing real divergence without normalizing it; both are documented and both shrink as later stories (normalization story; `Link`/`Pill` story 10) land.

### 1. The prop contract

**`Button`** extends the intrinsic button props so every native attribute passes through, then adds the typed design axes:

```ts
// packages/ui/src/components/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonTone = "default" | "ink" | "night";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // default "primary"
  size?: ButtonSize;         // default "md"
  tone?: ButtonTone;         // default "default"; reproduces the ink-fill + night-text outliers, zero-diff
  loading?: boolean;         // see a11y plan; renders no new affordance by default (zero-diff)
  // `selected` models the -on/-active toggle state; sets aria-pressed and the
  // selected class. Distinct from the native `disabled` (passed through).
  selected?: boolean;
  // `block` makes the button full-width (the width:100% / flex:1 layout cases),
  // a layout prop, NOT a skin. This removes the only legitimate reason a call
  // site would want a width className.
  block?: boolean;
  className?: string;        // ADDITIVE LAYOUT-ONLY (see className policy)
  children: ReactNode;
}
```

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

The rule the ADR fixes: **a `className` on `Button` may set margin, grid/flex placement, `align-self`, or width-context, and nothing else.** If a call site needs a different *look*, that is a missing `variant`/`size`/`tone`, escalated, not a `className`.

### 2. The variant-to-button MAP (every button → target), with per-outlier (A) reproduce vs (B) normalize calls

Default is **(A) reproduce zero-diff**. Each row states the target and, for outliers, the (A)/(B) call and recommendation.

**Cluster 1 → `Button variant="primary"`** (amber fill is the primary look; the primary CSS uses `background:--u-amber; color:--u-parchment; border:none; radius:--u-radius`, hover `--u-amber-hover`).

| Button | Target | Outlier? | Call |
|---|---|---|---|
| `auth-submit` (×2) | `Button variant="primary" size="md"` `type` passed | clean | zero-diff |
| `sub-submit-btn` | `variant="primary" size="lg"` (the `12 28` inset is the large size) | padding delta | **(A)** size `lg` reproduces `12 28`; recommend (A) |
| `rate-submit` | `variant="primary" size="md"` + semibold | weight/padding delta | **(A)** see "size/weight reconciliation" below; recommend (A) |
| `follow-follow` | `variant="primary"` + `IconButton`-style icon+label is a **`Button` with an icon child** | border + min-width + focus ring | **(A)** the amber border equal to the amber fill is visually identical to borderless at these values? No; `border:1px --u-amber` on an amber fill is the same color, so it renders identically to `border:none` here; `min-width:116px` and the `:focus-visible` ring are reproduced by the primary variant's own focus ring (which we standardize to the `follow`/`acct` 2px amber ring; see a11y) and a `min-width` layout. Recommend (A). |
| `set-save` (×2) | `variant="primary" tone="night"` | **`--u-night` text not `--u-parchment`** | **(A)** `tone="night"` sets `color:--u-night`; recommend (A) (see tone decision) |
| `cta-btn` (button branch) | `variant="primary" size="md"` | polymorphic | **(A)** button branch only; `<a>` branch deferred (see below) |
| `foryou-invite-btn` | `variant="primary" tone="ink"` | **`--u-ink` text not `--u-parchment`** | **(A)** `tone="ink"`; recommend (A) |

**Cluster 2 → `Button variant="secondary"`** (outline: transparent or surface fill, 1px border, ink/amber text).

| Button | Target | Outlier? | Call |
|---|---|---|---|
| `set-clear` | `variant="secondary" size="md"` | clean | zero-diff |
| `search-more-btn` | `variant="secondary" size="md"` (surface-card fill, ink-tint-20 border) | fill/border shade | **(A)** secondary's tokens chosen to match; if a single secondary cannot carry both `transparent` and `--u-surface-card` fills zero-diff, this splits into a `tone` on secondary; **escalate** (see open questions) |
| `cs-promote` | `variant="secondary" size="sm"` | small padding | **(A)** size `sm` |
| `copy-btn` | `variant="secondary" size="sm"` + icon child | icon+text | **(A)** `Button` (not `IconButton`) since it has a text label |
| `pov-btn` | `variant="secondary" size="sm"` muted text | muted text | **(A)**; the muted-vs-ink text across the secondary cluster is the same escalation as `search-more-btn` |
| `rp-personalize` | `variant="secondary"` amber border+text | amber outline | **(A)** this is an amber-outline secondary; see "secondary sub-tones" escalation |
| `claim-btn` | `variant="secondary" size="md"` | **`--u-radius-7` not `--u-radius`** | **(A) reproduce** the `--u-radius-7` exactly via an additive layout `className` OR a documented `tone`; **OR (B) normalize** to `--u-radius`. Recommend **(A)** for zero-diff this story, but **flag (B)** as the better eventual answer (one stray radius is exactly the inconsistency the epic wants gone). |
| `follow-following` | `variant="secondary"` + `danger` **state** (`.is-unfollow`) | red state | **(A)** the `selected`/unfollow state maps to a `danger`-toned state, not a `danger` variant; recommend (A) (see danger decision) |
| `shelfc-remove` | `variant="secondary" size="sm"` muted text, `--u-radius-6` | radius/text delta | **(A)** |

**Cluster 3 (ink-fill primaries): the headline outlier.**

| Button | (A) reproduce | (B) normalize | Recommendation |
|---|---|---|---|
| `tagc-apply` | `variant="primary" tone="ink"` (fill `--u-ink`, text `--u-surface-card`, radius `--u-radius-6`) | `variant="primary"` (becomes amber) | **(A)** this story. These four are a genuine, consistent design language (ink-fill = "commit this curation action"), not a one-off; a `tone="ink"` expresses it cleanly and zero-diff. Whether ink-fill should survive a future normalization is a **design question for the gate / a later story**, not a refactor call. |
| `shelfc-add` | `variant="primary" tone="ink"` | amber | **(A)**; same as `tagc-apply` |
| `dc-proceed` | `variant="primary" tone="ink"` (radius `--u-radius`) | amber | **(A)** |
| `author-edit-save` | `variant="primary" tone="ink"` + pill radius | amber + radius | **(A)**, but the **pill radius** (`--u-radius-pill`) is a second delta on top of `tone="ink"`; reproduce via additive layout `className` or a `size`/shape. **Flag:** this is the ugliest combination (ink tone + pill shape + semibold); a strong **(B) normalize** candidate later. Recommend (A) now, (B) flagged. |

**Cluster 4 → `Button variant="secondary"` with ink-tint border** (`tagc-dispute`, `dc-proceed-quiet`). These are the outline twins of Cluster 3.

| Button | Target | Call |
|---|---|---|
| `tagc-dispute` | `variant="secondary" size="md"` (ink-tint-20 border, radius-6) | **(A)** |
| `dc-proceed-quiet` | `variant="secondary"` (regular weight) | **(A)**; the regular-vs-medium weight is a `tone` or a documented `size` detail; escalate if it cannot be reproduced without a fourth knob |

**Cluster 5 → `Button variant="ghost"`** (no border, transparent, text-forward).

| Button | Target | Call |
|---|---|---|
| `acct-signout` | `variant="ghost"` + `block` + `role="menuitem"` passed; red **hover** state | **(A)** the red hover is ghost's hover treatment, not a danger variant; left/divider layout via additive class on the parent menu |
| `searchbox-seeall` | `variant="ghost"` + `block`; amber text; bottom-corner radius | **(A)** the `border-radius: 0 0 7px 7px` and `border-top` are **layout/position** of a menu-footer row; reproduce via additive layout class. Amber text vs ink text is a ghost sub-tone; escalate or `tone` |
| `rp-tab` (×2) | `variant="ghost" size="sm" selected={…}` | **(A)** `selected` sets the `.rp-tab-on` look (surface-card fill + elevation); `role="tab"`/`aria-selected` passed |
| `pov-sw` (×2) | `variant="ghost" size="sm" selected={…}` | **(A)** same as `rp-tab`; the two toggle looks (`rp-tab-on` vs `pov-sw-active`) differ in radius/elevation token; escalate if one `selected` look cannot carry both zero-diff |

**Cluster 6 (link-styled) → DEFER to `Link` primitive (story 10).** `auth-linklike` (×2), `sub-back`. These are `<button>` elements styled as inline links (`background:none; border:none; padding:0; font:inherit`, underline-on-hover). They are not control buttons; they are link affordances that happen to be `<button>` because the action is client-side, not a navigation. Forcing them into a ghost `Button` would either (A) need a `variant="link"` that the §2 set does not include and that overlaps the future `Link` primitive, or normalize their look. **Recommend defer**: they stay raw `<button>` this story, allowlisted with the reason "link-styled control, migrates to `Link`/`variant=link` in story 10." (Alternative: add a `variant="link"` now. Rejected to avoid pre-empting the `Link` primitive's design and adding a fifth variant the umbrella did not name; revisit at the gate if the user prefers a `link` variant over a deferral.)

**Cluster 7 (pill/toggle) → DEFER to `Pill` primitive (story 10).** `gps-pill` (selectable genre pill with on/off/disabled states), `rated-by-more` (a "+N" count pill). ADR 0038 §2 names `Pill` as a distinct primitive (story 10). A selectable genre pill is the `Pill` primitive's job, not `Button`'s. **Recommend defer**: stay raw `<button>` this story, allowlisted with reason "selectable pill, migrates to `Pill` in story 10." (`rated-by-more` is borderline; it is a count affordance, not a selectable pill; but it shares the pill shape and is cleaner to migrate alongside `gps-pill` in story 10. Recommend defer both; flag `rated-by-more` as a candidate for `Button variant="secondary"` with a pill if the user prefers minimizing the allowlist.)

**Cluster 8 → `IconButton`.**

| Button | Target | Call |
|---|---|---|
| `acct-trigger` | `IconButton variant="bare" shape="circle"` aria-label + aria-haspopup/expanded passed; child `<Avatar>` | **(A)** truly icon-only |
| `rate-star` (×5) | `IconButton variant="bare" shape="square" selected={score===n}` aria-label passed; child `<Star>` | **(A)**; `aria-pressed` via `selected` |

**Cluster 9 → DEFER (listbox option, not a control).** `searchbox-hit` (`role="option"` two-line result row). It is a listbox option, not a `Button` and not a `Pill`. Migrating it would need an `Option`/listbox primitive that no story owns yet. **Recommend defer**: stay raw `<button>` this story, allowlisted with reason "role=option listbox item; not a control button; future listbox/Option primitive." (Alternative: wrap in a permissive `Button`; rejected, it is semantically `role=option` and forcing `Button`'s control semantics on it is wrong.)

#### Size/weight reconciliation (how `size` carries the padding/weight deltas zero-diff)

The amber/outline clusters use a handful of padding pairs (`12 16`, `12 28`, `10 18`, `9 20`, `10 26`, `8 16`, `5 12`, `4 10`, `7 16`) and two weights (medium, semibold). `size: sm|md|lg` cannot, by itself, carry nine distinct paddings zero-diff. The decision: **`size` carries the dominant three paddings; the residual per-site padding/weight deltas that do not fall on a clean size are reproduced by the primitive's own per-variant CSS keyed off `variant`+`size`+`tone`, not by a call-site class.** Where a single button's padding/weight is genuinely unique (e.g. `cs-promote`'s `5 12` vs `cta-btn`'s `10 26`), the Implementer maps it to the nearest `size` whose CSS the primitive defines to that exact value, OR escalates the specific button as a case (c). **This is the most likely place a true case (c) appears**; the open questions list it for the gate. The honest statement: most buttons map clean; a handful of padding/weight values may need the primitive to define more than three `size` steps internally (still typed, still closed), or a specific button is flagged for normalization. The `visual` gate catches any miss.

#### The `tone` decision (the inverted-ink and night-text outliers)

`tone: "default" | "ink" | "night"` is a **closed, typed enum** added to absorb exactly the verified outliers:

- `tone="ink"` → `background:--u-ink; color:--u-surface-card` on `variant="primary"` (the four Cluster-3 buttons). **(A) reproduce.**
- `tone="night"` → `color:--u-night` on the amber primary (`set-save`). **(A) reproduce.**
- `foryou-invite-btn`'s `--u-ink` text is a **third** text-on-amber value; it is folded into `tone` as a documented case OR mapped to `tone="ink"`-on-amber. The Implementer confirms the exact token; if `--u-ink` text on amber fill needs its own tone value, the enum gains one closed member, recorded here.

**Risk of `tone`:** it is an API axis the umbrella §2 did not name, and it preserves a visual inconsistency the epic eventually wants gone. **Tradeoff:** without it, the four ink-fill primaries and the two off-color-text amber primaries cannot be reproduced zero-diff and must be normalized now (path B), which the story forbids. **Recommendation:** add `tone` as a closed enum this story (zero-diff), and record that a future normalization story may **retire `tone` members** by making the ink-fill and night/ink-text buttons consistent with design sign-off. `tone` is the honest zero-diff bridge; it is not permanent license.

#### The `danger` variant decision

There is **no `variant="danger"` call site today.** Red appears only as a **state**: `follow-following.is-unfollow` (text+border+focus turn `--signal-negative`) and `acct-signout:hover` (red bg+text). The contract names `danger` (§2), so:

- **Define `variant="danger"` in the contract now** (so the API is complete and ADR-0038-faithful), with CSS that uses `--signal-negative`, but **map no current button to it as a static variant.**
- The two red appearances stay as **states on their existing variant**: `follow-following`'s unfollow is `variant="secondary"` with a `danger` *state* (the `.is-unfollow` look, driven by a prop such as `danger` or the existing toggle state), reproduced zero-diff; `acct-signout`'s red hover is `variant="ghost"`'s hover treatment, reproduced zero-diff.

**Recommendation:** define `danger` for contract completeness, do not force the red-state buttons onto it (that would change their resting pixels; they are not red at rest). Record `danger` as a contract-complete-but-unused-at-rest variant. (Alternative: leave `danger` undefined until a real danger button exists. Rejected: the umbrella names it and a future destructive-action button should find it ready; defining it costs nothing and changes no pixels.)

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

### 4. Accessibility plan (zero-diff and ideally neutral-or-better)

Every migrated button preserves its current a11y exactly; the primitive standardizes the focus ring without changing the buttons that already have one.

- **Focus ring.** Today only some buttons declare a `:focus-visible` ring (`follow-btn`, `copy-btn`, `acct-trigger`: 2px `--u-amber` outline, 2px offset; `follow-following.is-unfollow`: outline `--signal-negative`). Most buttons have **no** explicit focus style (they inherit the UA default). **Decision:** the primitive's CSS reproduces each variant's *current* focus treatment exactly to stay zero-diff; it does **not** add a ring to buttons that lack one, because adding a visible focus ring is a pixel change on `:focus-visible` capture and could diff. The danger-state focus (`--signal-negative` outline on unfollow) is reproduced. **Flag:** "no focus ring on most buttons" is a latent a11y gap; standardizing a focus ring across all buttons is a deliberate, design-reviewed visual change (a follow-up story with a labeled baseline update), not this zero-diff refactor. Recorded as follow-up.
- **Keyboard.** All targets are native `<button>` (Enter/Space activation, focusability); preserved by construction (the primitive renders a real `<button>`). `CopyButton`'s explicit "keyboard-focusable for free" rationale holds.
- **Role / aria.** `role="menuitem"` (`acct-signout`), `role="tab"` + `aria-selected` (`rp-tab`, `pov-sw`), `aria-haspopup`/`aria-expanded`/`aria-label` (`acct-trigger`), `aria-pressed` (`rate-star`, `follow-btn`), `aria-label` (`set-save`, `rate-star`, `rated-by-more`, `copy-btn`) all pass through the intrinsic spread and are carried verbatim by the Implementer. The `selected` prop sets `aria-pressed` for toggle buttons; the Implementer confirms each toggle's current `aria-selected` (tabs) vs `aria-pressed` (rate-star, follow) is preserved exactly (tabs use `aria-selected`, not `aria-pressed`, so `selected` must drive the *class* but the caller keeps passing `role="tab"`/`aria-selected`; the primitive must not force `aria-pressed` on a `role="tab"` element). This is a real subtlety: **`selected` controls the visual selected class; the caller still passes the correct aria for its role.**
- **`loading` state a11y.** No button shows a loading affordance today; several use `disabled` while submitting (`auth-submit`, `acct-signout`, `search-more-btn`). **Decision:** `loading` is **defined in the contract now** but renders **no new visible affordance by default** (no spinner), so it is zero-diff. When `loading` is true the primitive sets `aria-busy="true"` and `disabled` (matching the existing "disabled while submitting" behavior semantically); but the Implementer must verify this does not change the rendered pixels of any currently-`disabled`-while-submitting button (it should not, since those already render the disabled look). If setting `aria-busy` or auto-`disabled` would alter any captured state, `loading` ships as a **no-op-rendering, type-only** prop this story and the busy/spinner behavior is a later visual story. Recommend: `loading` defined, renders nothing new, sets `aria-busy` only (no auto-disable) to stay provably zero-diff; the visible spinner is a future story.

### 5. Where the primitive CSS lives and how it ships

- New directory `packages/ui/src/components/`. Files: `Button.tsx` + `Button.css`, `IconButton.tsx` + `IconButton.css` (or one shared `controls.css` imported by both; Implementer's choice; co-location per ADR 0038 §7). Each `.tsx` does `import "./Button.css";` and Vite resolves the workspace CSS import through the `apps/web` bundler (the same mechanism already proven by `@unbnd/ui/styles/tokens.css`).
- The CSS references **only existing semantic tokens** (every value in the inventory is already a `var(--u-*)`), so the prior color/spacing/radius/type/motion guards stay green and no token is minted.
- Re-export from `packages/ui/src/index.ts`: `export { Button } from "./components/Button"; export type { ButtonProps, ButtonVariant, ButtonSize, ButtonTone } from "./components/Button"; export { IconButton } from "./components/IconButton"; export type { IconButtonProps } from "./components/IconButton";`.
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

### 7. Zero-diff reality (be explicit)

A structural primitive migration is **higher-risk for zero-diff than a token sweep**: a token sweep changes values inside identical markup, whereas this changes the markup (a `<button class="x">` becomes `<Button variant=…>` rendering a `<button class="ui-button ui-button--primary">`). The class names change, so any CSS specificity, sibling-combinator, or descendant rule that targeted the old class on a non-button context could shift. Mitigations:

- **Per-button exact reproduction.** Each variant/size/tone/state's CSS is authored to the captured token-backed values above, value-for-value.
- **The Story-39 `visual` job** is the backstop on home, book detail, profile, search, auth, submit; it fails on a single pixel. Any drift is investigated, not re-baselined.
- **Specificity watch.** The old per-site classes are sometimes referenced in compound selectors (`.auth-btn-row .auth-submit { flex:1 }`, `.acct-menu hr, .acct-signout { margin-top }`, `.pov-sw-active`, `.rp-tab-on`, `.is-unfollow`, `.dc-proceed-quiet`, `.gps-on`/`.gps-off`). The Implementer must preserve the *layout/state* halves of these compound rules (kept on the parent or expressed via the `selected`/`block` props) while the *skin* moves into the primitive. The AC's "classes that also style non-button siblings keep only their non-button rules" applies to: `acct-signout`'s `.acct-menu hr, .acct-signout { margin-top }` (the `hr` half stays), and any `.auth-btn-row` layout (the row class stays on the `<div>`).

**Buttons whose exact reproduction I am least certain of (flagged for the visual gate and possibly case (c)):**

- **The toggle selected looks** (`rp-tab-on` vs `pov-sw-active`): both are "surface-card fill + ink text + elevation," but `rp-tab-on` uses `--u-elevation-1b` + `--u-radius-6` and `pov-sw-active` uses `--u-elevation-1c` + `--u-radius-7`. A single `selected` look cannot carry both elevations/radii zero-diff. **Likely needs the `selected` look to vary by `size` or a `tone`, or these stay two configurations.** Escalate.
- **Secondary text/fill sub-tones**: `pov-btn`/`shelfc-remove` use `--u-muted` text, `rp-personalize` uses `--u-amber` text+border, the rest use `--u-ink`; fill is `transparent` on most, `--u-surface`/`--u-surface-card` on a few. One `variant="secondary"` cannot carry all three text colors and two fills zero-diff; this needs a `tone` on secondary or several buttons flagged. Escalate.
- **`dc-proceed-quiet`'s regular weight** vs the medium-weight secondary default: a fourth weight value. Likely a `tone` or a flagged case.
- **The padding spread** (nine pairs across two clusters): as noted, `size` carries three; the residuals need the primitive to define them per variant/size or a specific button is flagged.

These are the honest places (A)-reproduce strains the API. The Recommended path below states how to handle them at the gate.

## Consequences

- **Enables** a future button restyle as one component edit (the epic's goal), with the gain held by the no-raw-`<button>` guard rather than review vigilance. Establishes the `packages/ui/src/components/` layer the package lacked.
- **Constrains** all future button work: new buttons go through `Button`/`IconButton`; the guard enforces it. The `tone` axis and the `DEFERRED` allowlist are documented temporary bridges that later stories retire.
- **New debt / follow-ups:** (1) the `tone` axis preserves the ink-fill and off-color-text inconsistencies; a future normalization story (design sign-off, labeled baselines) can retire `tone` members; (2) `claim-btn`'s `--u-radius-7` and `author-edit-save`'s pill+ink+semibold are flagged (B)-normalize candidates; (3) the absent focus ring on most buttons is a latent a11y gap to close in a deliberate visual story; (4) the `DEFERRED` allowlist must shrink to empty as story 10 (`Link`, `Pill`) and a future listbox/Option primitive land; (5) `loading`'s visible spinner is deferred to a visual story.
- **Affects existing fixtures?** No. No data fixtures change. The `visual` baselines are **not** updated (the migration is zero-diff); if any baseline must change, that is an escalated case-(c) decision, not a silent re-baseline.
- **New dependency?** No new third-party runtime dependency. `@types/react` + `@types/react-dom` are added as **dev** deps to `packages/ui` (they already exist in the workspace for `apps/web`; this makes the UI package self-typecheckable). Pinned exact, no caret. The primitives are new `.tsx` modules in the existing `@unbnd/ui` package; the guard is a new Vitest test in the existing `packages/ui/test/`. No new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes. Phase 2 platform hardening (extends PRD §2.11 / Block E per ADR 0038), recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors (Architect is read-only on source; these are targets, not edits made here):

- **Primitives:** `packages/ui/src/components/Button.tsx` (+ `Button.css`), `packages/ui/src/components/IconButton.tsx` (+ `IconButton.css`). Prop contracts per §1. CSS authored to the per-button token-backed values in the inventory; references only existing `var(--u-*)` tokens. Each `.tsx` imports its sibling `.css`.
- **Index:** re-export `Button`/`IconButton` and their types from `packages/ui/src/index.ts`.
- **Package config:** `packages/ui/package.json`; add `@types/react` and `@types/react-dom` (exact pins matching `apps/web`'s `@types/react@18.3.x`) to `devDependencies`. `packages/ui/tsconfig.json`; add `"jsx": "react-jsx"`, and `"DOM"`, `"DOM.Iterable"` to `lib`.
- **Migration (the ~30 in-scope buttons):** replace each raw `<button className="…">` per the §2 map, carrying `type`, `onClick`, `disabled`, every `aria-*`, `role`, `key`, and the visible label verbatim. Move each bespoke button class's *skin* rules into the primitive CSS; keep only the *layout/non-button-sibling* rules at the call site (e.g. `.auth-btn-row` row layout, `.acct-menu hr` margin, the `.set-actions`/`.rate`/`.rp-controls` parent layout). Toggle buttons (`rp-tab`, `pov-sw`, `rate-star`, `follow`) use `selected` for the visual state but keep passing their own `role`/`aria-selected`/`aria-pressed` (do not let `selected` force the wrong aria).
- **The `cta-btn` `<Btn>`:** in `CallToAction.tsx`, the `ctaHref ? "a" : "button"` polymorphism splits; render `<Button>` for the button branch, keep a raw `<a className="cta-btn">` (or the existing `<Btn>`-as-`<a>`) for the link branch until story 10's `Link`. The `cta-btn` skin moves to the `primary` variant; the `<a>` branch keeps a link-only class. After this, no `"button"` tag literal remains in the file, so the guard's polymorphic-tag check passes.
- **Deferred sites (stay raw `<button>`):** `auth-linklike` ×2, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit`; unchanged this story; allowlisted by class name in the guard with their retiring-story comments.
- **Guard:** `packages/ui/test/architecture-button-literals.test.ts` per §6; comment-stripping `<button`/`createElement("button"`/polymorphic-`"button"`-tag detection over `apps/web/src` `.ts/.tsx`, class-name `DEFERRED` allowlist, single aggregated assertion. Mirror `architecture-shape-literals.test.ts`.
- **Verification gate:** `pnpm -r typecheck` (new prop types + UI package self-typecheck), `pnpm -r test` (the new guard + all prior guards 40-44 + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job; all pass, the last **zero-diff with no baseline update.** Any non-zero diff is investigated as a case-(c) escalation, never re-baselined.

## Out of scope

- **Visual normalization of any button** (path B): unifying the ink-fill primaries to amber, collapsing the off-color text/weight/radius deltas, standardizing `claim-btn`'s radius, or unifying the toggle elevations. Each changes pixels, fails the `visual` gate, and is a separate, design-reviewed, labeled-baseline story.
- **Any `className`/`style` re-skin escape hatch** (ADR 0038 §2). The `className` is additive layout-only.
- **The `Link` primitive and `variant="link"`** (`auth-linklike`, `sub-back`, `auth-btn-secondary` links, the `cta-btn` `<a>` branch): epic story 10.
- **The `Pill` primitive** (`gps-pill`, `rated-by-more`): epic story 10.
- **A listbox/Option primitive** (`searchbox-hit`): future, no story yet.
- **The icon registry / `<Icon>`**: epic story 9. `IconButton` carries today's raw icon node as `children`; the registry migration is later.
- **Other primitives** (`Input`, `Field`/`Label`, `Card`, `Avatar`): epic story 10.
- **A standardized focus ring across all buttons** and **a visible `loading` spinner**: deliberate visual changes, later stories with labeled baselines.
- **Any token change**: the token system is complete (Stories 40-44).
- **Re-pointing the `CLAUDE.md`/`AGENTS.md` "primitives are the source of truth" doc rule and citing the new guard**: epic story 14.
