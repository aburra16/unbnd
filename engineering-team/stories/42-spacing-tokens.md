# Story 42: Two-tier spacing tokens and the spacing CI guard

**Status:** Draft
**Created:** 2026-06-03
**Type:** Refactor

## Background

This is epic story 5 of Epic 0001 (Overhaul-ready design system, `@unbnd/ui`), the spacing axis. ADR 0038 (Accepted, 2026-06-03) is the umbrella decision. Four foundations it depends on are already merged: Story 38 stood up the `@unbnd/ui` package and relocated the token sheet (it now lives at `packages/ui/styles/tokens.css`); Story 39 stood up the Playwright visual-regression harness with committed baselines and a CI `visual` job that fails on any pixel diff (that harness is the gate this story is held to); Story 40 established the two-tier-token-plus-guard pattern this story follows, introducing the two-tier color tokens, fixing the live token drift, unifying the genre palette, and landing the first CI guards under `packages/ui/test/`; and Story 41 carried that pattern one axis up to type, establishing the value-keyed-raw plus thin-per-property-alias approach and the gate decisions this story inherits (no cosmetic renames, no premature semantic bundles, zero-diff with one raw token per distinct in-use value). This story repeats that shape for spacing.

Spacing is the last of the three axis sweeps in the epic's lowest-entanglement-first order (color to type to spacing). The audited current state motivates it (ADR 0038 §"Verified current state", "Spacing"):

1. **Zero spacing tokens.** The token sheet carries only `--page-max` / `--page-pad-x` for the page frame. Every padding, margin, and gap in the app is a raw literal in component CSS. ADR 0038's audit counts roughly 355 `padding` / `margin` / `gap` declarations across the web CSS; the count is confirmed at 355 against `main` today. The exact per-value breakdown is the Architect's and Implementer's to confirm; the PO does not enumerate it.

2. **No two-tier structure for spacing.** Because there are no spacing tokens, there is no separation between a raw spacing scale (the literal pixel values) and the semantic roles that point at it. A future spacing or density change (a tighter inset scale, a roomier stack rhythm) is a 355-site sweep rather than a token-value change.

3. **Spacing shorthands carry multiple values.** Unlike the single-value type and color cases, `padding` and `margin` shorthands frequently pack several values into one declaration (`padding: 8px 12px`, `margin: 0 auto 16px`). Each spacing component of a shorthand maps to a token, and non-spacing keywords (`auto`, `0`) sit alongside them. This makes the migration mechanically harder than Stories 40 and 41 and is a decision the Architect must address.

ADR 0038 §1 ("Complete, themeable, two-tier token layer") names the spacing axis explicitly: a raw scale (`--u-raw-space-*`) surfaced through semantic spacing aliases (for example `--u-space-inset-{sm,md,lg}` and the `gap`-style stack/inline roles). ADR 0038 §6 names the spacing guard: "No raw spacing (`padding`/`margin`/`gap` numeric literals) outside the token layer and layout primitives," to be built as a Vitest guard under `packages/ui/test/`, mirroring the Story-40 color guards and Story-41 type guard, which themselves mirror `packages/trust/test/architecture.test.ts`.

The epic's operating principle is "same pixels, better structure": the only acceptable visible change from this story is none, proven zero-diff against the Story-39 `visual` job, no baseline updated. Phase classification: Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum. It changes no product behavior and no PRD claim. House-rule anchors: `CLAUDE.md` "Brand tokens are the visual source of truth" (this story extends that source to cover the spacing axis) and "No new lint/typecheck/build tooling without an ADR" (this story adds no tooling; the guard is a Vitest test under the existing `pnpm -r test`). Governing ADR: 0038. A refining ADR may be warranted, because naming the raw spacing scale when the in-use values are not a clean grid, and deciding how to handle multi-value shorthands and which spacing-adjacent properties fall in scope, are real design calls (see open questions).

## User-facing description

As an Unbnd engineer, I want the spacing axis modeled as two tiers in `@unbnd/ui` (a raw spacing scale behind semantic spacing aliases), the app's padding, margin, and gap referencing only the semantic tier, and a CI guard that forbids raw spacing literals outside the token layer, so that a future spacing or density change becomes a token change instead of a 355-site sweep, and the gain is held by CI instead of by review vigilance.

This is developer-facing infrastructure. No Reader, Curator, or Author sees any difference; the rendered app is byte-identical before and after, which the Story-39 visual-regression gate confirms.

## Acceptance criteria

Testable from the outside.

- [ ] Given `@unbnd/ui`, when the spacing tokens are inspected, then they are two-tier: a raw spacing scale of literal values (per ADR 0038 §1 Tier-1 naming, following the Story-41 value-keyed-raw approach) and semantic spacing aliases that reference the raw tier and never a literal. The app references the semantic tier.
- [ ] Given the app CSS after the sweep, when it is searched for raw spacing literals (`padding` / `margin` / `gap` numeric values, including each value of a multi-value shorthand) outside the token layer, then none remain; spacing usage references the spacing tokens.
- [ ] Given every distinct in-use spacing value today, when it is migrated to a raw token, then it is preserved exactly as-is; no near-values are consolidated onto a cleaner 4px/8px grid, so every resolved spacing value stays byte-identical.
- [ ] Given multi-value `padding` / `margin` shorthands, when they are migrated, then each spacing component resolves to a token and any non-spacing keyword (`auto`, `0` where the Architect rules `0` out of token scope) is preserved, with the resolved declaration byte-identical to today.
- [ ] Given the new spacing guard, when `pnpm -r test` runs, then it scans app CSS for raw spacing literals (the property set the Architect fixes) outside the token layer, finds none, and passes; its allowlist names only the legitimate token-source files (and layout primitives, if any exist by then).
- [ ] Given the Story-40 color guards and the Story-41 type guard, when `pnpm -r test` runs, then they stay green (this story does not weaken or remove them).
- [ ] Given the workspace, when `pnpm -r typecheck` runs, then it passes.
- [ ] Given the workspace, when `pnpm -r test` runs, then it passes, including the new `@unbnd/ui` spacing guard, the existing color and type guards, and the existing web unit suite.
- [ ] Given the workspace, when the `apps/web` build runs (`pnpm --filter @unbnd/web build`), then it succeeds.
- [ ] Given the Story-39 `visual` job, when it runs against this story's change, then it is zero-diff against the committed baselines. No baseline is updated. If any screen diffs, that is a signal the refactor altered pixels and must be investigated, not papered over by re-baselining.

## DList shapes touched

None. This is a front-end CSS-architecture and spacing-token refactor, not a DList-shaped change. ADR 0038 records that the Tapestry branch survey does not apply to this design-system work; the governing prior art is in-repo (`packages/trust/test/architecture.test.ts` and the Story-40 color guards plus the Story-41 type guard in `packages/ui/test/` for the guard pattern; the existing `packages/ui` token sheet for the migration target). No data fixture changes.

## Out of scope

None of the following may grow into this story. The fence is the spacing axis only, and it is a refactor, not a redesign.

- **Spacing-scale rationalization / grid-snapping.** This story preserves every distinct in-use spacing value exactly as it is today. It does not consolidate near-values onto a cleaner 4px/8px grid (for example snapping a 13px and a 12px together), because that changes pixels and the Story-39 visual gate would correctly fail. A genuinely rationalized spacing scale that collapses near-duplicates onto a rational grid is a separate, intentional visual-change story under the ADR 0039 visual-change discipline, not this refactor. This is the central constraint of the story.
- **Any other token axis:** color (done in Story 40), type (done in Story 41), radii, elevation, z-index, motion (durations, easings), breakpoints. Those are repo Stories 40 and 41 (done) and the later epic stories 6-plus. Spacing only. The token sheet's existing non-spacing entries are left as they are; this story does not tokenize, restructure, or two-tier them, except that the `--page-max` / `--page-pad-x` page-frame values are the Architect's call on whether they fold into the spacing tier now or stay as-is (see open questions).
- Primitives (`Button`, `IconButton`, `Input`, `Card`, `Pill`, `Avatar`, `Link`), the icon registry and `<Icon>` abstraction, the motion layer and `prefers-reduced-motion` handling, and layout primitives (`Stack`, `Grid`, `Container`). Later epic stories. The guard's allowlist anticipates layout primitives per ADR 0038 §6 wording, but this story does not build them.
- Authoring a dark theme or any second skin. ADR 0038 §1 requires the two-tier structure to admit one; building one is epic story 13.
- Any behavior, copy, or information-architecture change. The only visible change permitted is none: render must be byte-identical, proven zero-diff against the Story-39 harness.
- Adding, removing, or changing any spacing value. The migration preserves every resolved value exactly; it changes where the value is defined, not what it is.
- Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui`, or citing the new guard in the docs. That is epic story 14; this story leaves the docs as they are.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, bounty marketplace, social feed, reading progress, federation, or notifications). It is behavior-preserving infrastructure and does not approach the §11.3 line.

## Open questions

For the Architect to resolve in the Architecture phase. The PO does not pick names, scale shapes, or guard internals.

- **Raw spacing-scale naming when the values are not a clean grid.** ADR 0038 §1 sketches `--u-raw-space-1 … -12` on a single scale, which assumes a tidy ramp. The in-use values are unlikely to be a clean 4px/8px grid (355 declarations imply many distinct values). Because byte-identical render forbids snapping near-values together, every distinct in-use value must become its own raw token. The Architect decides how to name a raw scale whose steps are not evenly spaced: a numeric-by-pixel scheme, a t-shirt ramp with off-ramp values named honestly, or another scheme that keeps each distinct value addressable without implying a consolidation that did not happen. This mirrors the same call Story 41 resolved for the type scale.
- **Multi-value shorthand handling.** `padding` and `margin` shorthands carry one to four spacing values plus possible non-spacing keywords (`auto`, `0`). The Architect decides how the migration maps each component to a token while keeping the resolved declaration byte-identical: per-component `var()` substitution inside the shorthand, expansion to longhand properties, or another approach. This is the chief mechanical difference from the single-value type and color sweeps and the guard must be able to parse it.
- **Property scope: which properties are tokenized and guarded.** The ADR §6 wording names `padding` / `margin` / `gap`. The Architect confirms the exact property set, including: the longhand and logical forms (`padding-top`, `margin-inline`, `row-gap` / `column-gap`); whether `top` / `right` / `bottom` / `left` / `inset` (13 such declarations exist in the app CSS today) are tokenized when they carry spacing; and whether `0` and other non-spacing uses (a bare `0`, percentages, `auto`, `calc()`) are in scope or exempt. The PO's read: stay aligned to the ADR's named trio (`padding`, `margin`, `gap`) and their longhand/logical forms unless the Architect finds a reason to widen it; `0` and keyword values are a judgment call worth recording.
- **Page-frame tokens.** `--page-max` / `--page-pad-x` already exist for the page frame. The Architect decides whether `--page-pad-x` (a spacing value) folds into the new spacing tier now or stays as-is this story, keeping the resolved value identical either way.
- **Guard allowlist scope.** Mirroring the Story-40 color guards and Story-41 type guard, the spacing guard carries a tightly scoped allowlist. The Architect decides which files it exempts (the token sheet where the raw spacing literals legitimately live, the layout-primitive files if any exist by then, and any other legitimate token-source file), and how the guard treats any TS-side spacing constants if they exist. The allowlist should name only legitimate token-source files, per the AC.
- **Runtime-injected spacing.** Story 40's color case surfaced live drift and TS-side palette arrays. The Architect should check whether any padding, margin, or gap value is injected at runtime (inline styles in TSX, a TS constant, or a computed style) rather than living in CSS, and decide how the sweep and the guard handle that surface so a literal cannot hide outside the CSS the guard scans.
- **Whether a refining ADR is warranted.** The PO's read is plausibly yes, as for Stories 40 and 41: the raw-scale naming for a non-grid value set, the multi-value shorthand handling, and the property-scope decision are design choices worth recording on top of umbrella ADR 0038. The Architect confirms and writes it if so.

## Dependencies

- Repo Story 38 (epic story 1, `@unbnd/ui` package scaffold) — **merged** (`done/38-scaffold-ui-package.md`). The token sheet lives at `packages/ui/styles/tokens.css`; this story's two-tier spacing model and guard land in that package.
- Repo Story 39 (epic story 2, Playwright visual-regression harness) — **merged** (`done/39-visual-regression-harness.md`). Its `visual` CI job and committed baselines are the zero-diff gate that proves this story is behavior-preserving.
- Repo Story 40 (epic story 3, two-tier color tokens and the first CI guards) — **merged** (`done/40-color-tokens.md`). It established the two-tier-token-plus-guard pattern, and its color guards must stay green.
- Repo Story 41 (epic story 4, two-tier type tokens and the type guard) — **merged** (`done/41-type-tokens.md`). It established the value-keyed-raw plus thin-per-property-alias pattern and the gate decisions this story inherits, and its type guard must stay green.
- Requires the Architecture phase next. The raw spacing-scale naming, the multi-value shorthand handling, and the property-scope decision need an Architect decision and may produce a refining ADR before implementation.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella; §1 token layer, §6 CI guards). A refining ADR on the spacing taxonomy may come from the Architecture phase.
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 5).
- Test plan: (filled in after Test Design phase, if the gate keeps one; the guard is itself a locking test.)
- Review: (filled in after Review phase.)
