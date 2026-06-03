# ADR 0038: Overhaul-ready design system in `@unbnd/ui`

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic; per-story ADRs may refine specifics)

**Approved 2026-06-03.** User-resolved gate decisions: Sub-decision 1 (CSS strategy) = **plain CSS + two-tier tokens + CI guards** confirmed (no new styling toolchain; vanilla-extract reconsiderable under a later ADR on top of this token model). Sub-decision 2 (visual-regression) = **Playwright adopted** as a dev dependency + dedicated CI job. Layout-axis depth (epic story 12) and dark-theme depth (epic story 13) are deferred to those stories' own gates. **Phase classification:** this work is Phase 2 platform hardening (extends PRD §2.11 / Block E); to be recorded in the post-Phase-2 PRD addendum.

## Context

The front end carries an MVP's worth of styling debt. A future visual overhaul led by a human designer (new icon set, restyled buttons, micro-animations, or a wholesale re-skin) currently cannot be done cheaply or safely, because the styling layer is fused into the components and the few token rules that exist are enforced by review alone and have already drifted.

This ADR sets the target architecture for an `apps/web` front end that is **overhaul-ready**: a re-skin should be a change to token values and a swap of primitive internals, with minimal-to-no change to application code and no functional change.

Two decisions are already accepted by the user and are recorded here, not relitigated:

- **Scope** is the full overhaul-ready design system: every token axis, a primitive component library, an icon registry, a motion layer, layout primitives, and CI guards. Delivered as a **staged epic** of behavior-preserving refactors.
- **Packaging** is a dedicated `@unbnd/ui` workspace package, matching the `@unbnd/trust` / `@unbnd/search` / `@unbnd/schemas` extraction pattern.

### Verified current state (audit re-run on `apps/web/src`, 2026-06-03)

Color:
- `styles/tokens.css` defines the palette and is well adopted: **422** `var()` references across the CSS.
- **63** hardcoded hex literals live outside `tokens.css` (plus **82** `rgba()` calls, mostly translucent borders that should be tokens).
- Token-name **drift is real and live**: `AuthorEdit.css`, `AuthorBadge.css`, and `ClaimControl.css` reference `--u-bg`, `--u-line`, and `--u-danger`, none of which are defined in `tokens.css`. These declarations silently fall back to their initial values and are disconnected from the token system. This is the smoking gun for "convention-only enforcement does not hold."
- The genre/cover palette is **triplicated** with the same base hex values represented three different ways: `tokens.css` (`--genre-*`), `components/Avatar.tsx` (`BGS` / `INKS` arrays), and `lib/view-model.ts` (`COVER_PALETTE` with `from`/`to`/`ink`). A genre re-color today means editing three files in three formats.

Type:
- Zero type tokens. **210** hardcoded `font-size` and **109** `font-weight` declarations. `tokens.css` only carries `--font-sans` / `--font-mono` families.

Spacing:
- Zero spacing tokens (only `--page-max` / `--page-pad-x` for the page frame). **355** hardcoded `padding` / `margin` / `gap` declarations.

Icons:
- **5** inline `<svg>` sites (`SearchIcon.tsx`, `LogoMark.tsx`, `FollowButton.tsx`, `AuthMethodCard.tsx`, `RatingControl.tsx`) plus two one-off icon components. No `<Icon>` indirection. An icon-set swap touches every site.

Motion:
- **29** hardcoded `transition` declarations. Zero motion tokens, zero `@keyframes`/`animation`, no motion primitive, and **zero** `prefers-reduced-motion` handling anywhere. This is also an accessibility gap.

Primitives:
- No `ui`/primitive layer. **38** raw `<button>` elements with bespoke per-site classes (`cta-btn`, `claim-btn`, `pov-btn`, `copy-btn`, `follow-btn`, `auth-btn-secondary`, `sub-submit-btn`, `search-more-btn`, `foryou-invite-btn`). A button restyle is N edits with N chances to diverge.

Responsive:
- Hardcoded breakpoints sprawl beyond the audit's "7": at least 16 distinct `max-width`/`min-width` values appear (880, 860, 720, 700, 640, 620, 560, 540, 480, 440, 420, 320, plus several one-off `min-width`s). No breakpoint tokens.

Layout:
- Co-located per-component CSS; layout (structure, spacing, flow) is fused with skin (color, type, decoration) inside each component's stylesheet.

Guards:
- The "no hex outside `tokens.css`" rule is enforced by human review only. There is **no CI guard**, which is why the drift above accumulated. Precedent for the fix already exists: `packages/trust/test/architecture.test.ts` and the `@unbnd/search` provider tests are repo-wide `readFileSync` greps that fail CI. We reuse that exact pattern.

### Constraints that bind this design

- **No AI-slop** in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- Amber `#C4763C` is the only accent. Green positive, red negative, purple sovereign/Nostr. (`CLAUDE.md` house rules.)
- **No icon libraries.** Hand-authored SVGs only. (`AGENTS.md` §4.)
- **No new lint/typecheck/build tooling without an ADR.** `pnpm -r typecheck` is the type gate; Vitest is the test runner. (`CLAUDE.md` house rules.) The two sub-decisions below are exactly the tooling questions this ADR must gate.
- Architecture invariants (POV-first, decentralized-first, filter-at-view-time) are about the data layer and are not in tension with this styling work. The one touchpoint: the design system must **not** bake genre or trust-tier color into a global precompute that contradicts POV-first; genre color is presentation keyed off a value the POV already resolved, which is fine.

### Prior art

This is a front-end packaging and CSS-architecture decision, not a DList-shaped one, so the Tapestry branch survey (concept-graph / feat/communities / feat/pubkey-tagging-target) does not apply. The governing prior art is **in-repo**: the package-extraction shape of `packages/trust` (raw `./src/index.ts` export, `workspace:*` consumption, `Bundler` module resolution, no build step) and the CI architecture-guard test pattern in `packages/trust/test/architecture.test.ts`. We match both.

## Options considered

### Option A — Incremental in-place tokenization, no package

Add the missing token axes to `styles/tokens.css`, sweep the literals into tokens, leave components and CSS where they are, and add CI guards. No `@unbnd/ui`.

- Pros: smallest diff; no packaging work; fastest to a partial win.
- Cons: does not deliver the accepted scope. Primitives, icon registry, and motion layer still have no home, so "swap internals without touching app code" stays impossible. Tokens-only does not make a component restyle cheap, because the styling still lives inside each component. Rejected: it solves the color axis and leaves the structural debt that makes an overhaul expensive.

### Option B — Adopt a styling framework (Tailwind, or a CSS-in-JS / typed runtime like styled-components)

Re-skin-ability by buying into an ecosystem.

- Pros: large ecosystems; utility or prop-driven styling.
- Cons: violates "no new tooling without an ADR" at a scale far beyond what overhaul-readiness needs, and fights the existing plain-CSS-with-tokens precedent that is already well adopted (422 `var()` refs). Tailwind would mean rewriting every stylesheet into utility classes (maximal churn, the opposite of behavior-preserving). Runtime CSS-in-JS adds a runtime cost and a new dependency for zero capability we cannot get from CSS custom properties plus a two-tier token model. Rejected.

### Option C — Two-tier tokens + primitive library + icon registry + motion layer + layout primitives, extracted to `@unbnd/ui`, locked by CI guards, delivered as staged behavior-preserving refactors

The accepted scope. A complete themeable token layer (two-tier: raw/primitive tokens to semantic/alias tokens) lives in `@unbnd/ui` and theming is `[data-theme]`-scoped so additional skins and dark mode are possible later without rearchitecting. App code depends on **stable prop contracts** of primitives whose internals are swappable. Icons go through one `<Icon name>` backed by a hand-authored SVG registry. Motion is centralized in tokens plus a small util, with `prefers-reduced-motion` honored. Layout primitives separate structure from skin. Each axis is locked by a CI guard test mirroring `packages/trust/test/architecture.test.ts`, so the abstraction cannot silently erode again. Each step ships independently, behavior-preserving, with `main` shippable throughout.

- Pros: delivers the accepted scope; makes a future overhaul a token-and-internals change; the guards make the gains permanent; staged delivery keeps risk per story low and `main` always shippable. Matches the in-repo package and guard precedents exactly.
- Cons: it is the largest body of work and spans many stories. The layout axis is the hardest (structure is more entangled than color) and may land late or partially. Mitigated by sequencing foundations first and gating each story.

## Decision

We choose **Option C**. It is the only option that satisfies the two accepted decisions (full scope, `@unbnd/ui` extraction) and the standing quality bar (long-term debt avoidance, no shortcuts). Options A and B are recorded to show why a smaller or a framework-shaped path was rejected: A under-delivers, B over-buys and maximizes churn.

The detailed target architecture:

### 1. Complete, themeable, two-tier token layer

Single source of truth ships from `@unbnd/ui` as CSS custom properties. Two tiers:

- **Tier 1 — raw / primitive tokens.** Literal values, skin-specific, no semantics. Naming: `--u-raw-<group>-<key>`.
  - `--u-raw-color-amber-500: #C4763C;`, `--u-raw-color-ink-900: #1A1A2E;`, the eight genre hues and their ink/gradient partners, the parchment ramp, etc.
  - `--u-raw-space-1 … -12` on a single scale (the 355 hardcoded values collapse onto this).
  - `--u-raw-size-xs … -3xl` (type sizes), `--u-raw-weight-{regular,medium,semibold,bold}`, `--u-raw-leading-{tight,normal,loose}`, `--u-raw-family-{sans,mono}`.
  - `--u-raw-radius-{sm,md,lg,pill}`, `--u-raw-elevation-{0,1,2}` (parchment-on-parchment depth, not drop shadows), `--u-raw-z-{base,dropdown,sticky,modal,toast}`.
  - **Motion:** `--u-raw-duration-{instant,fast,base,slow}` and `--u-raw-ease-{standard,emphasized,exit}`.
  - **Breakpoints:** `--u-raw-bp-{xs,sm,md,lg,xl}` (CSS custom properties cannot be used inside `@media` queries, so the canonical breakpoint values are ALSO exported as a typed TS constant `breakpoints` from `@unbnd/ui` for use in any JS-driven responsive logic and as the documented source the CSS `@media` values must match; a guard checks raw `@media` pixel values against the allowed set).
- **Tier 2 — semantic / alias tokens.** What the UI actually references. They point at Tier 1, never at literals. Naming: `--u-<role>` / `--u-<component>-<role>`.
  - `--u-accent: var(--u-raw-color-amber-500);`, `--u-text-primary`, `--u-text-muted`, `--u-surface-page`, `--u-surface-card`, `--u-border`, `--u-signal-positive/negative/sovereign`, `--u-space-inset-{sm,md,lg}`, `--u-text-{body,heading,caption}` (a size/weight/leading bundle), `--u-radius-control`, `--u-duration-control`, `--u-ease-control`.

A re-skin maps **semantics to new raw values** (or supplies a new raw set). App CSS touches only Tier 2, so app CSS does not change on a re-skin.

**Theming** is attribute-scoped: the default skin is defined under `:root`; alternate skins and dark mode override Tier-2 (or Tier-1) values under `[data-theme="<name>"]`. Because everything is custom properties, a theme switch is a single attribute on `<html>`, no rebuild, no per-component change. Dark mode is therefore reachable later without rearchitecting; it is **out of scope to author a dark theme now**, but the structure must admit one.

The genre-palette triplication is resolved by making `tokens.css` raw genre tokens the single source and deriving the `Avatar` and cover-gradient palettes from those tokens (TS reads the resolved values, or the arrays are generated from the same constant), so a genre re-color is one edit.

`prefers-reduced-motion`: a global `@media (prefers-reduced-motion: reduce)` block in `@unbnd/ui` zeroes the motion-duration tokens, so every motion that reads the tokens degrades automatically.

### 2. Primitive component library in `@unbnd/ui`

Primitives expose **stable prop contracts**; their internals (markup, classes, even the styling approach) are swappable without changing callers. Initial set, each replacing a verified cluster of bespoke sites:

- `Button` (replaces the 38 raw `<button>`s and their nine bespoke classes), `IconButton`, `Link`.
- `Input`, `Field`/`Label` (the auth and submit forms).
- `Card` (parchment-on-parchment surface), `Pill` (genre/signal pills), `Avatar` (folds in the `BGS`/`INKS` palette via tokens).
- `Icon` (see §3).

Variant/size/state API: a small, explicit, typed prop surface, not an open `className` escape hatch.
- `variant`: `"primary" | "secondary" | "ghost" | "danger"` (semantic, maps to tokens).
- `size`: `"sm" | "md" | "lg"`.
- State (`disabled`, `loading`, `aria-pressed`, etc.) via real props, never bespoke per-site classes.
- Primitives own their CSS internally; callers pass props, not styles. A `className` prop, if allowed at all, is additive layout-only and never a way to re-skin.

This is what makes a restyle one edit: change `Button`'s internals or its token references, every call site updates.

### 3. Icon abstraction

One `<Icon name="search" />` backed by a registry of hand-authored SVGs (compatible with the no-icon-library rule — these are our own SVGs, just centralized). The registry is a typed `name → SVG` map in `@unbnd/ui`; `name` is a string-literal union so a typo is a type error. The five inline `<svg>` sites and the two one-off icon components migrate into the registry. An icon-set swap is then one file. Delivery is inline-SVG components (tree-shakeable, themeable via `currentColor`/token `fill`); a sprite sheet is an acceptable internal alternative the primitive can switch to without changing callers.

### 4. Motion layer

Motion tokens (durations + easings, §1) plus a tiny primitive/util in `@unbnd/ui` (a `transition()` CSS helper / class set and, where JS-driven motion is needed, a small hook that reads the reduced-motion media query). All timing and easing centralize on the tokens. The 29 ad-hoc transitions migrate to the token-backed util. Reduced-motion is honored globally via §1. No animation library is introduced.

### 5. Layout primitives

`Stack` (vertical/horizontal flow with a token-spaced `gap`), `Grid`, `Container` (max-width + page padding, replacing `--page-max`/`--page-pad-x` usage). These separate **structure** from **skin** so a re-skin does not have to touch layout and a layout change does not have to touch color/type. This is the hardest axis because structure is the most entangled with component logic, so it is sequenced **late** and may land partially; the epic states which screens convert and which are deferred.

### 6. CI architecture guards

Guard tests live in `@unbnd/ui` (run by the existing `pnpm -r test` CI step, exactly as `packages/trust` guards run today) and scan the repo with `readFileSync`, mirroring `packages/trust/test/architecture.test.ts`. Guards are introduced **incrementally, one per story**, each locking the gain that story just made, with a tightly scoped allowlist so the guard reflects reality and stays green:

- **No undefined token references:** every `var(--u-…)` in app CSS resolves to a token defined in `@unbnd/ui` tokens. (Kills the live `--u-bg`/`--u-line`/`--u-danger` drift and prevents recurrence.)
- **No raw color literals** (hex / `rgb(a)` / named colors) in app CSS or components outside the token layer.
- **No raw `font-size` / `font-weight` / `line-height`** outside the token layer.
- **No raw spacing** (`padding`/`margin`/`gap` numeric literals) outside the token layer and layout primitives.
- **No raw `transition`/`animation` durations or easings** outside the motion layer.
- **No raw `<button>` / `<svg>`** in app code (must go through `Button` / `Icon`); allowlist names the registry/primitive files only.
- **No raw `@media` pixel values** outside the allowed breakpoint set.

Each guard ships in the same story as the refactor it protects, so the guard is green the moment it lands and red forever after on regression.

### 7. `@unbnd/ui` package shape

Matches the `@unbnd/trust` precedent exactly:

- `packages/ui/package.json`: `"name": "@unbnd/ui"`, `"private": true`, `"type": "module"`, `"main"`/`"types"` → `"./src/index.ts"`, `"exports"` map. Scripts `test` (`vitest run`) and `typecheck` (`tsc --noEmit`). `react`/`react-dom` as peer deps (they live in `apps/web`); `vitest` + `typescript` dev deps. No `^` on pinned versions per house rule.
- **No build step.** Like `@unbnd/trust`, it exports raw `./src/index.ts` and is consumed by source through Vite's bundler resolution. `apps/web` adds `"@unbnd/ui": "workspace:*"` and imports `{ Button, Icon, Stack, tokens }` from `@unbnd/ui`.
- **CSS delivery:** the token stylesheet ships from the package (e.g. `@unbnd/ui/styles/tokens.css`) and `apps/web` imports it once at the app entry, replacing the current `styles/tokens.css`. Primitive component CSS is co-located in the package and imported by each primitive (Vite handles CSS imports from a workspace package). This keeps tokens and primitives versioned together as the design system's shipping unit.
- `pnpm-workspace.yaml` already globs `packages/*`, so no workspace-config change is needed.

## Two sub-decisions (each ADR-gated; recommendation + tradeoffs)

### Sub-decision 1 — CSS strategy: plain co-located CSS + strict tokens, vs CSS Modules / typed (vanilla-extract)

- **Plain CSS + tokens (recommended).** Keep the existing, well-adopted approach (422 `var()` refs prove it works), add the two-tier tokens, and rely on the CI guards for the enforcement that convention failed to provide. Pro: zero new tooling, no ADR-gated dependency, smallest migration, behavior-preserving sweeps are mechanical. Con: class-name collisions remain possible (mitigated: primitives own their classes inside the package; the guard forbids stray literals). The guards give most of the enforceability a typed approach would, without the tooling cost.
- **CSS Modules.** Local class scoping for free. Pro: kills collisions structurally. Con: new build-config surface in Vite, churns every `className` and stylesheet import across the app (large non-behavior-preserving diff), and the scoping benefit is largely redundant once primitives encapsulate their own styles.
- **vanilla-extract (typed, zero-runtime).** Tokens and styles as type-checked TS; a re-skin becomes refactor-safe at the type level. Pro: strongest enforceability and the best long-term re-skin ergonomics. Con: a real new build dependency and toolchain, full ADR gate and user sign-off required, and a from-scratch rewrite of the styling layer — the opposite of incremental behavior-preserving stories.

**Recommendation: plain CSS + strict tokens + CI guards.** It meets the overhaul-readiness goal, honors "no new tooling without an ADR," and is the only one that fits behavior-preserving staged delivery. If the user later wants type-level enforcement, vanilla-extract can be adopted under its own ADR *after* the token layer exists, because the two-tier token model is the migration target either way. **This sub-decision adds no tooling and needs no extra gate beyond approving this ADR.**

### Sub-decision 2 — Visual-regression testing to prove "no visual change"

The epic's core promise is "same pixels, better structure" through every refactor. Type-checks and unit tests do not prove pixels are unchanged.

- **Recommendation: adopt visual-regression snapshots, ADR-gated as new tooling, before the first behavior-preserving refactor story that moves real styles.** Tool: Playwright's screenshot assertions (`toHaveScreenshot`) running against the built `apps/web` over a fixed fixture set of key screens (home, book detail, profile, search, auth, submit). Wire it as a dedicated CI job (its own workflow or a job in `ci.yml`) that builds web, serves the preview, and diffs against committed baselines. Workflow per refactor story: baseline is captured from `main` before the change; the refactor must produce a **zero-diff** run; only an intentional visual change updates the baseline, in its own clearly-labeled commit. This turns "no functional change" from a claim into a gate.
- Tradeoff: Playwright is a new dev dependency and a new CI job — it requires the user's explicit sign-off under the no-new-tooling rule. Snapshot flakiness (fonts, anti-aliasing) is the known risk; mitigated by pinning the browser version, disabling animations during capture, and a small diff threshold. The cost is justified: without it, "behavior-preserving" is unverifiable and the whole staged strategy rests on trust.
- **Alternative if the user declines the tooling:** fall back to manual before/after screenshot review at each gate (cheaper, no dependency, but not enforced and easy to skip — weaker, and it is the kind of human-review-only gap that produced the current drift).

## Consequences

- Enables a future designer-led overhaul as a token-and-internals change with minimal-to-no app-code change, and makes the gains permanent via CI guards.
- Establishes `@unbnd/ui` as the fourth workspace package and the shipping unit for tokens + primitives.
- Constrains all future UI work: new color/type/spacing/motion must go through tokens; new buttons/icons through primitives. The guards enforce this, so the constraint is real, not advisory.
- Makes a wholesale re-skin and an eventual dark mode reachable without rearchitecting.
- New debt / follow-ups: the layout axis may land partially; a dark theme is structurally enabled but not authored; if vanilla-extract is ever adopted, it is a later ADR on top of this token model.
- **Affects existing fixtures?** No. This is a presentation-layer refactor; data fixtures (`apps/web/src/data/*`, `lib/view-model.ts`) are unchanged except that `view-model.ts`'s `COVER_PALETTE` and `Avatar.tsx`'s `BGS`/`INKS` are re-sourced from the genre tokens (same resolved values, so rendered output is identical — the visual-regression gate confirms it).
- **New dependency?** Yes, conditionally. `@unbnd/ui` itself is a workspace package (`react`/`react-dom` as peers, no new third-party runtime dep). Sub-decision 2, if accepted, adds Playwright as a **dev** dependency for visual-regression CI — this is the one item needing explicit user tooling sign-off. Sub-decision 1 as recommended adds no dependency.
- **PRD section change required?** No. This does not change product behavior or any PRD claim. `CLAUDE.md` / `AGENTS.md` should be updated (after implementation) to point the "brand tokens are the source of truth" rule at `@unbnd/ui` instead of `apps/web/src/styles/tokens.css`, and to cite the new guards; that is a doc follow-up, not a PRD change.

## Implementation notes

The full ordered story breakdown, each story's scope, dependencies, and the specific guard it introduces, live in the epic: `engineering-team/epics/0001-design-system-overhaul-ready.md`. Per the standing pattern, each story runs the full five-phase gated flow and may produce a refining ADR; this ADR is the umbrella decision.

Concrete anchors for the Implementer:
- Package: scaffold `packages/ui/` mirroring `packages/trust/` (`package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `test/`). Export tokens CSS from the package and import it once in `apps/web/src/main.tsx` (or the current entry), removing `apps/web/src/styles/tokens.css` only once the package token sheet is the superset.
- Guards: new tests under `packages/ui/test/architecture-*.test.ts`, copying the structure of `packages/trust/test/architecture.test.ts` (`REPO` root resolve, `walk()` over `apps` + `packages`, `SKIP_DIRS`, allowlist of the legitimate token/primitive/registry files). They run automatically under the existing `pnpm -r test` CI step.
- Drift fix first: the live `--u-bg` / `--u-line` / `--u-danger` references in `AuthorEdit.css`, `AuthorBadge.css`, `ClaimControl.css` are repointed to real tokens as part of the color-token story, and the "no undefined token reference" guard prevents recurrence.
- Visual-regression baselines (if sub-decision 2 accepted): Playwright config + a `visual` CI job; baselines committed per screen; refactor stories must run zero-diff.

## Out of scope

- Authoring a dark theme or any second skin now (the structure must admit one; building one is later work).
- Any change to product behavior, copy, or information architecture.
- Adopting vanilla-extract or any typed-CSS toolchain now (recommended against; reconsiderable under a future ADR on top of this token model).
- The data-layer architecture invariants — untouched by this work.
- Per-story implementation detail and exact token names beyond the taxonomy above — refined in each story's phase, recorded in the epic.
