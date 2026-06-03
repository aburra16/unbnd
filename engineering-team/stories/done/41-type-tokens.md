# Story 41: Two-tier type tokens and the type CI guard

**Status:** Done
**Created:** 2026-06-03
**Type:** Refactor
**Review:** `engineering-team/reviews/41-type-tokens.md` (PASS)

## Background

This is epic story 4 of Epic 0001 (Overhaul-ready design system, `@unbnd/ui`), the type axis. ADR 0038 (Accepted, 2026-06-03) is the umbrella decision. Three foundations it depends on are already merged: Story 38 stood up the `@unbnd/ui` package and relocated the token sheet (it now lives at `packages/ui/styles/tokens.css`); Story 39 stood up the Playwright visual-regression harness with committed baselines and a CI `visual` job that fails on any pixel diff (that harness is the gate this story is held to); and Story 40 established the exact pattern this story follows, one axis up: it introduced the two-tier color tokens, fixed the live token drift, unified the genre palette, and landed the first two CI guards under `packages/ui/test/`. This story repeats that shape for type.

The type axis is the next sweep in the epic's lowest-entanglement-first order (color to type to spacing). The audited current state motivates it (ADR 0038 §"Verified current state", "Type"):

1. **Zero type tokens.** The token sheet carries only the two font families (`--font-sans` / `--font-mono`). Every type size, weight, and line-height in the app is a raw literal in component CSS. ADR 0038's audit counts roughly 210 `font-size` and 109 `font-weight` declarations across the web CSS (plus the line-heights that travel with them). The exact counts are the Architect's and Implementer's to confirm; the PO does not enumerate them.

2. **No two-tier structure for type.** Because there are no type tokens, there is no separation between a raw type scale (the literal sizes, weights, line-heights, and families) and the semantic roles that point at it. A future type overhaul (a new scale, a new heading weight, a typeface change) is a 200-plus-site sweep rather than a token-value change.

3. **The families are not yet on a raw tier.** `--font-sans` / `--font-mono` exist but sit outside the two-tier model Story 40 established for color. They fold into the type axis's family tier in this story so there is one source for family values and no literal duplication.

ADR 0038 §1 ("Complete, themeable, two-tier token layer") names the type axis explicitly: raw `--u-raw-size-*`, `--u-raw-weight-*`, `--u-raw-leading-*`, `--u-raw-family-*`, surfaced through semantic bundles such as `--u-text-body` / `--u-text-heading` / `--u-text-caption` (a size/weight/leading bundle). ADR 0038 §6 names the type guard: "No raw `font-size` / `font-weight` / `line-height` outside the token layer," to be built as a Vitest guard under `packages/ui/test/`, mirroring the Story-40 color guards which themselves mirror `packages/trust/test/architecture.test.ts`.

The epic's operating principle is "same pixels, better structure": the only acceptable visible change from this story is none, proven zero-diff against the Story-39 `visual` job, no baseline updated. Phase classification: Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum. It changes no product behavior and no PRD claim. House-rule anchors: `CLAUDE.md` "Brand tokens are the visual source of truth" (this story extends that source to cover the type axis) and "No new lint/typecheck/build tooling without an ADR" (this story adds no tooling; the guard is a Vitest test under the existing `pnpm -r test`). Governing ADR: 0038. A refining ADR may be warranted, because naming the raw type scale when the in-use values are not a clean ramp, and deciding whether to expose semantic bundles now or raw plus thin aliases, are real design calls (see open questions).

## User-facing description

As an Unbnd engineer, I want the type axis modeled as two tiers in `@unbnd/ui` (a raw scale of sizes, weights, line-heights, and families behind semantic type aliases or bundles), the app's typography referencing only the semantic tier, and a CI guard that forbids raw type literals outside the token layer, so that a future type overhaul becomes a token change instead of a 200-plus-site sweep, and the gain is held by CI instead of by review vigilance.

This is developer-facing infrastructure. No Reader, Curator, or Author sees any difference; the rendered app is byte-identical before and after, which the Story-39 visual-regression gate confirms.

## Acceptance criteria

Testable from the outside.

- [ ] Given `@unbnd/ui`, when the type tokens are inspected, then they are two-tier: a raw type scale of literal values (sizes, weights, line-heights, families, per ADR 0038 §1 Tier-1 naming) and semantic type aliases or bundles that reference the raw tier and never a literal. The app references the semantic tier.
- [ ] Given the app CSS after the sweep, when it is searched for raw `font-size`, `font-weight`, and `line-height` literals outside the token layer, then none remain; type usage references the type tokens.
- [ ] Given every distinct font-size, font-weight, and line-height value in use today, when it is migrated to a raw token, then it is preserved exactly as-is; no near-values are consolidated onto a cleaner scale, so every resolved type value stays byte-identical.
- [ ] Given `--font-sans` and `--font-mono`, when the family tier is inspected, then both are folded into it (raw family tokens with any semantic alias the Architect chooses) and no family literal is duplicated across the token layer or app CSS.
- [ ] Given the new type guard, when `pnpm -r test` runs, then it scans app CSS for raw `font-size` / `font-weight` / `line-height` literals outside the token layer, finds none, and passes; its allowlist names only the legitimate token-source files.
- [ ] Given the Story-40 color guards, when `pnpm -r test` runs, then they stay green (this story does not weaken or remove them).
- [ ] Given the workspace, when `pnpm -r typecheck` runs, then it passes.
- [ ] Given the workspace, when `pnpm -r test` runs, then it passes, including the new `@unbnd/ui` type guard, the existing color guards, and the existing web unit suite.
- [ ] Given the workspace, when the `apps/web` build runs (`pnpm --filter @unbnd/web build`), then it succeeds.
- [ ] Given the Story-39 `visual` job, when it runs against this story's change, then it is zero-diff against the committed baselines. No baseline is updated. If any screen diffs, that is a signal the refactor altered pixels and must be investigated, not papered over by re-baselining.

## DList shapes touched

None. This is a front-end CSS-architecture and type-token refactor, not a DList-shaped change. ADR 0038 records that the Tapestry branch survey does not apply to this design-system work; the governing prior art is in-repo (`packages/trust/test/architecture.test.ts` and the Story-40 color guards in `packages/ui/test/` for the guard pattern; the existing `packages/ui` token sheet for the migration target). No data fixture changes.

## Out of scope

None of the following may grow into this story. The fence is the type axis only, and it is a refactor, not a redesign.

- **Type-scale rationalization.** This story preserves every distinct font-size, font-weight, and line-height value exactly as it is today. It does not consolidate near-values onto a cleaner ramp (for example snapping a 13px and a 14px together), because that changes pixels and the Story-39 visual gate would correctly fail. A genuinely rationalized type scale that collapses near-duplicates is a separate, intentional visual-change story under the ADR 0039 visual-change discipline, not this refactor. This is the central constraint of the story.
- **Any other token axis:** color (done in Story 40), spacing, radii, elevation, z-index, motion (durations, easings), breakpoints. Those are repo Stories 40 (done) and 42-plus (epic stories 5-plus). Type only. The token sheet's existing non-type entries are left as they are; this story does not tokenize, restructure, or two-tier them, except that `--font-sans` / `--font-mono` move into the new family tier.
- Primitives (`Button`, `IconButton`, `Input`, `Card`, `Pill`, `Avatar`, `Link`), the icon registry and `<Icon>` abstraction, the motion layer and `prefers-reduced-motion` handling, and layout primitives (`Stack`, `Grid`, `Container`). Later epic stories.
- Authoring a dark theme or any second skin. ADR 0038 §1 requires the two-tier structure to admit one; building one is epic story 13.
- Any behavior, copy, or information-architecture change. The only visible change permitted is none: render must be byte-identical, proven zero-diff against the Story-39 harness.
- Adding, removing, or changing any type value. The migration preserves every resolved value exactly; it changes where the value is defined, not what it is.
- Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui`, or citing the new guard in the docs. That is epic story 14; this story leaves the docs as they are.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, bounty marketplace, social feed, reading progress, federation, or notifications). It is behavior-preserving infrastructure and does not approach the §11.3 line.

## Open questions

For the Architect to resolve in the Architecture phase. The PO does not pick names, scale shapes, or guard internals.

- **Raw type-scale naming when the values are not a clean ramp.** ADR 0038 §1 sketches `--u-raw-size-xs … -3xl` and `--u-raw-weight-{regular,medium,semibold,bold}`, which assume a tidy scale. The in-use values are unlikely to be a clean ramp (the audit implies many distinct sizes). Because byte-identical render forbids snapping near-values together, every distinct in-use value must become its own raw token. The Architect decides how to name a raw scale whose steps are not evenly spaced: a `t-shirt` ramp with off-ramp values named honestly, numeric-by-pixel names, or another scheme that keeps each distinct value addressable without implying a consolidation that did not happen.
- **Semantic bundles now, or raw plus thin aliases.** ADR 0038 §1 sketches `--u-text-body` / `--u-text-heading` / `--u-text-caption` as size/weight/leading bundles. The Architect decides whether to introduce those semantic bundles in this story (mapping the current per-site combinations onto a small set of roles, which risks implying a consolidation if two near-identical combinations get merged) or to land only the raw tier plus thin semantic aliases now and defer richer role bundles to a later, intentional story. Either is acceptable to the PO as long as render stays byte-identical and the guard reflects the chosen layer.
- **Whether line-height and letter-spacing are in scope.** ADR 0038 §6 names the guard as `font-size` / `font-weight` / `line-height`. The Architect confirms that line-height is tokenized and guarded here, and decides whether letter-spacing (if it appears in the audited CSS) is in this story's scope or deferred. The PO's read: stay aligned to the ADR's named trio (size, weight, line-height) unless the Architect finds a reason to include letter-spacing now.
- **Guard allowlist scope.** Mirroring the Story-40 color guards, the type guard carries a tightly scoped allowlist. The Architect decides which files it exempts (the token sheet where the raw type literals legitimately live, and any other legitimate token-source file), and how the guard treats any TS-side type constants if they exist. The allowlist should name only legitimate token-source files, per the AC.
- **Runtime-injected font values.** Story 40's color case surfaced live drift and TS-side palette arrays. The Architect should check whether any font size, weight, or line-height is injected at runtime (inline styles in TSX, a TS constant, or a computed style) rather than living in CSS, and decide how the sweep and the guard handle that surface so a literal cannot hide outside the CSS the guard scans.
- **Whether a refining ADR is warranted.** The PO's read is plausibly yes: the raw-scale naming for an uneven set of values, and the bundles-vs-aliases call, are design decisions worth recording on top of umbrella ADR 0038, as Story 40 recorded its color taxonomy. The Architect confirms and writes it if so.

## Dependencies

- Repo Story 38 (epic story 1, `@unbnd/ui` package scaffold) — **merged** (`done/38-scaffold-ui-package.md`). The token sheet lives at `packages/ui/styles/tokens.css`; this story's two-tier type model and guard land in that package.
- Repo Story 39 (epic story 2, Playwright visual-regression harness) — **merged** (`done/39-visual-regression-harness.md`). Its `visual` CI job and committed baselines are the zero-diff gate that proves this story is behavior-preserving.
- Repo Story 40 (epic story 3, two-tier color tokens and the first CI guards) — **merged** (`done/40-color-tokens.md`). It established the two-tier-token-plus-guard pattern this story follows one axis up, and its color guards must stay green.
- Requires the Architecture phase next. The raw type-scale naming, the bundles-vs-aliases decision, and the family-tier fold need an Architect decision and may produce a refining ADR before implementation.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella; §1 token layer, §6 CI guards). A refining ADR on the type taxonomy may come from the Architecture phase.
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 4).
- Test plan: (filled in after Test Design phase, if the gate keeps one; the guard is itself a locking test.)
- Review: `engineering-team/reviews/41-type-tokens.md` (PASS).
