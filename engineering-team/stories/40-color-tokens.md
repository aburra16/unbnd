# Story 40: Two-tier color tokens, drift fix, and the first CI guards

**Status:** Draft
**Created:** 2026-06-03
**Type:** Refactor

## Background

This is epic story 3 of Epic 0001 (Overhaul-ready design system, `@unbnd/ui`), the color axis. ADR 0038 (Accepted, 2026-06-03) is the umbrella decision. Two foundations it depends on are already merged: Story 38 stood up the `@unbnd/ui` package and relocated the token sheet (it now lives at `packages/ui/styles/tokens.css`), and Story 39 stood up the Playwright visual-regression harness with committed baselines and a CI `visual` job that fails on any pixel diff. That harness is the gate this story is held to.

The color axis is the lowest-entanglement sweep, which is why the epic sequences it first among the axis migrations (epic sequencing rationale: color → type → spacing). Three concrete problems in the audited current state motivate it (ADR 0038 §"Verified current state", confirmed against `main`):

1. **The token model is single-tier.** `packages/ui/styles/tokens.css` defines literal color values directly on the names the UI references (for example `--u-amber: #C4763C`, `--u-border: rgba(26, 26, 46, 0.08)`). There is no separation between a raw color ramp and the semantic roles that point at it, so a re-skin cannot remap semantics to new raw values without editing the values the app references.

2. **Live token drift.** `AuthorEdit.css`, `AuthorBadge.css`, and `ClaimControl.css` reference `--u-bg`, `--u-line`, and `--u-danger`, none of which are defined in the token sheet. Each declaration carries an inline fallback (`var(--u-line, #d8d4cc)`, `var(--u-bg, #fff)`, `var(--u-danger, #b00020)`), so it silently renders the fallback and is disconnected from the token system. This is the smoking gun ADR 0038 cites for "convention-only enforcement does not hold."

3. **Triplicated genre/cover palette.** The genre hues exist in three places in three shapes: the `--genre-*` tokens in the token sheet, the `BGS`/`INKS` arrays in `apps/web/src/components/Avatar.tsx`, and the `COVERS` array (`{ from, to, ink }` rows) in `apps/web/src/lib/view-model.ts`. A genre re-color today means editing three files.

ADR 0038 §1 ("Complete, themeable, two-tier token layer") sets the target token model; ADR 0038 §6 ("CI architecture guards") sets the guard model and names `packages/trust/test/architecture.test.ts` as the pattern to mirror. The epic's operating principle is "same pixels, better structure": the only acceptable visible change from this story is none, proven zero-diff against the Story-39 `visual` job.

Phase classification: Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum. It changes no product behavior and no PRD claim. House-rule anchors: `CLAUDE.md` "Brand tokens are the visual source of truth" (this story makes the two-tier color tokens that source) and "No new lint/typecheck/build tooling without an ADR" (this story adds no new tooling; the guards are Vitest tests under the existing `pnpm -r test`, mirroring the `@unbnd/trust` guards). Governing ADR: 0038. A refining ADR is expected, because the two-tier color taxonomy (raw naming, ramp granularity, how the genre/cover palette resolves to one source) is a real design decision the Architect must make and record.

## User-facing description

As an Unbnd engineer, I want the color axis modeled as two tiers in `@unbnd/ui` (a raw color ramp behind semantic aliases), the app's color usage referencing only the semantic tier, the live `--u-bg`/`--u-line`/`--u-danger` drift fixed, the genre palette unified to one source, and all of it locked by CI guards, so that a future re-skin changes token values rather than call sites, and the drift and triplication debt is paid down permanently instead of by review vigilance.

This is developer-facing infrastructure. No Reader, Curator, or Author sees any difference; the rendered app is byte-identical before and after, which the Story-39 visual-regression gate confirms.

## Acceptance criteria

Testable from the outside.

- [ ] Given `@unbnd/ui`, when the color tokens are inspected, then they are two-tier: a raw color ramp of literal values (per ADR 0038 §1 Tier-1 naming) and semantic aliases that reference the raw tier and never a literal. The app references the semantic tier.
- [ ] Given the app CSS after the sweep, when it is searched for color literals (hex, `rgb()`/`rgba()`, CSS named colors) outside the token layer, then none remain; color usage references semantic tokens.
- [ ] Given `AuthorEdit.css`, `AuthorBadge.css`, and `ClaimControl.css`, when their `var(--u-bg …)`, `var(--u-line …)`, `var(--u-danger …)` references are inspected, then each resolves to a token defined in `@unbnd/ui` (repointed to the token the declaration was meant to use, with the inline literal fallbacks removed), so the silent fallback no longer occurs.
- [ ] Given the "no undefined token references" guard, when `pnpm -r test` runs, then it scans app CSS, finds that every `var(--u-…)` reference resolves to a token defined in `@unbnd/ui`, and passes (proving no drift remains).
- [ ] Given the "no raw color literals" guard, when `pnpm -r test` runs, then it scans app CSS and components for color literals outside the token layer, finds none, and passes; its allowlist names only the legitimate token-source files.
- [ ] Given the genre/cover palette, when its sources are inspected, then there is one source of color truth (the genre tokens in `@unbnd/ui`), and `Avatar.tsx` `BGS`/`INKS` and `view-model.ts` `COVERS` derive their values from that source with identical resolved values (no hue, gradient stop, or ink value changes).
- [ ] Given the workspace, when `pnpm -r typecheck` runs, then it passes.
- [ ] Given the workspace, when `pnpm -r test` runs, then it passes, including both new `@unbnd/ui` guard tests and the existing web unit suite.
- [ ] Given the workspace, when the `apps/web` build runs (`pnpm --filter @unbnd/web build`), then it succeeds.
- [ ] Given the Story-39 `visual` job, when it runs against this story's change, then it is zero-diff against the committed baselines. (No baseline is updated. If any screen diffs, that is a signal the refactor altered pixels and must be investigated, not papered over by re-baselining.)

## DList shapes touched

None. This is a front-end CSS-architecture and color-token refactor, not a DList-shaped change. ADR 0038 records that the Tapestry branch survey does not apply to this design-system work; the governing prior art is in-repo (`packages/trust/test/architecture.test.ts` for the guard pattern; the existing `packages/ui` token sheet for the migration target). Per ADR 0038 §"Affects existing fixtures?", `view-model.ts`'s cover palette and `Avatar.tsx`'s `BGS`/`INKS` are re-sourced from the genre tokens with the same resolved values, so rendered output is identical and no data fixture changes.

## Out of scope

None of the following may grow into this story. The fence is the color axis only.

- Any other token axis: type (sizes, weights, line-heights, families), spacing, radii, elevation, z-index, motion (durations, easings), breakpoints. Those are repo Stories 41+ (epic stories 4+). Color only. The token sheet's existing non-color entries (`--font-sans`/`--font-mono`, `--radius`, `--page-max`/`--page-pad-x`) are left as they are; this story does not tokenize, restructure, or two-tier them.
- Primitives (`Button`, `IconButton`, `Input`, `Card`, `Pill`, `Avatar`, `Link`), the icon registry and `<Icon>` abstraction, the motion layer and `prefers-reduced-motion` handling, and layout primitives (`Stack`, `Grid`, `Container`). Later epic stories.
- Authoring a dark theme or any second skin. ADR 0038 §1 requires the two-tier structure to *admit* one; building one is epic story 13.
- Any behavior, copy, or information-architecture change. The only visible change permitted is none: render must be byte-identical, proven zero-diff against the Story-39 harness.
- Adding, removing, or recoloring any color. The migration preserves every resolved value exactly; it changes where the value is defined, not what it is. (The drift fix is the one nuance: the three drifted refs currently render their inline fallback, so "the token they were clearly meant to be" is the value to confirm with the Architect; see open questions.)
- Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui`, or citing the new guards in the docs. That is epic story 14; this story leaves the docs as they are.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, bounty marketplace, social feed, reading progress, federation, or notifications). It is behavior-preserving infrastructure and does not approach the §11.3 line.

## Open questions

For the Architect to resolve in the Architecture phase. The PO does not pick names, ramp shapes, or guard internals.

- **Raw-token naming taxonomy and ramp granularity.** ADR 0038 §1 sketches `--u-raw-color-<group>-<key>` (for example `--u-raw-color-amber-500`, `--u-raw-color-ink-900`). The current sheet uses single-tier names without a `--u-raw-*` tier and mixes prefixed (`--u-amber`) and unprefixed (`--genre-*`, `--signal-*`) names. The Architect decides the exact raw names, how many steps each ramp gets (only the values in use today, or a fuller ramp), and how the existing names map onto the new two tiers, including whether `--genre-*`/`--signal-*` are renamed under the `--u-` convention. Constraint: resolved values stay identical, so render is unchanged.
- **The three drifted references' intended targets.** `--u-line` is used for borders (inline fallbacks `#e5e5e5`, `#d4d4d4`, `#d8d4cc`), `--u-bg` for a surface/foreground fill (fallback `#fff`), `--u-danger` for an error color (fallback `#b00020`). The token sheet already has plausible homes (`--u-border`, a parchment/white surface token, `--signal-negative: #DC3545`). Repointing them to those tokens changes the rendered color from the current fallback to the token value, which would show as a visual diff. The Architect must decide per reference whether the correct fix is (a) repoint to the existing token and accept that the Story-39 baseline legitimately changes for those three components (an intentional, separately-committed baseline update, not a papered-over diff), or (b) introduce a raw/semantic token whose value equals the current fallback to preserve the exact pixels. This is the one place where "byte-identical" and "fix the drift" can pull apart; the Architect resolves it explicitly and records the call.
- **Tints and translucency.** The 82 `rgba()` literals are mostly translucent borders/overlays (the sheet already tokenizes some: `--u-border: rgba(26,26,46,0.08)`). The Architect decides whether opacity variants get their own raw/semantic tokens now (for example a translucent-border token) or whether only opaque hues are tokenized in this pass with the translucent set deferred. Either is acceptable to the PO as long as the "no raw color literals" guard's allowlist honestly reflects the decision and the render is unchanged.
- **Genre/cover palette resolution to one source.** The genre token values, the `Avatar` `BGS`/`INKS` arrays, and the `view-model.ts` `COVERS` `{ from, to, ink }` rows are not a clean one-to-one map: the array ordering differs from the token order, `COVERS` carries gradient `to` stops and `ink` values that have no genre token today, and at least one hue in the arrays (the teal `#0E3F4D` ramp, ink `#B6DDE5`) has no `--genre-*` token. The Architect decides how to make the tokens the single source while keeping every resolved value identical: which values become raw tokens (the extra hue, the `to` stops, the `ink` partners), and how the TS arrays re-source from them (read resolved values, or generate the arrays from a shared constant). "Same resolved values" is the hard constraint; the visual gate confirms it.
- **Guard allowlist scoping.** ADR 0038 §6 says each guard carries a tightly scoped allowlist so it stays green and reflects reality. The Architect decides which files the two guards exempt (the token sheet for literals; the genre-token source and any generated palette constant; whichever files legitimately hold the raw values), and how the guards treat the TS palette source versus app component CSS. The allowlist should name only legitimate token-source files, per the AC.
- **Whether a refining ADR is warranted.** The PO's read is yes: the two-tier color taxonomy and the palette-unification approach are design decisions worth recording on top of umbrella ADR 0038. The Architect confirms and writes it if so.

## Dependencies

- Repo Story 38 (epic story 1, `@unbnd/ui` package scaffold) — **merged** (`done/38-scaffold-ui-package.md`). The token sheet lives at `packages/ui/styles/tokens.css`; this story's two-tier model and guards land in that package.
- Repo Story 39 (epic story 2, Playwright visual-regression harness) — **merged** (`done/39-visual-regression-harness.md`). Its `visual` CI job and committed baselines are the zero-diff gate that proves this story is behavior-preserving.
- Requires the Architecture phase next. The two-tier color taxonomy, the drift-fix value decisions, and the palette-unification approach need an Architect decision and are expected to produce a refining ADR before implementation.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella; §1 token layer, §6 CI guards). A refining ADR on the color taxonomy is expected from the Architecture phase.
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 3).
- Test plan: (filled in after Test Design phase, if the gate keeps one; the guards are themselves the locking tests.)
- Review: (filled in after Review phase.)
