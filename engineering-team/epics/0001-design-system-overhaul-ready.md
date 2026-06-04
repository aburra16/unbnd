# Epic 0001: Overhaul-ready design system (`@unbnd/ui`)

**Status:** Done (2026-06-04). All 14 epic stories (epic stories 1–14 = repo Stories 38–51, including the 47a/47b split and the Story-48 motion-util no-op) are merged. Closed by Story 51 (docs re-point); see `engineering-team/reviews/51-docs-repoint.md`.
**Created:** 2026-06-03
**ADR:** `engineering-team/decisions/0038-design-system-architecture.md`
**Phase classification:** Phase 2 platform hardening (extends PRD §2.11 / Block E). To be recorded in the post-Phase-2 PRD addendum.
**Owner role flow:** every story runs the full five-phase gated flow (Product Owner to Architect to Tester to Implementer to Reviewer), merge only on explicit "merge".
**Repo story numbering:** epic stories below are numbered 1–14 within the epic; their repo `stories/` files are assigned from the live sequence at draft time (epic story 1 = repo Story 38, the next free number after Story 37 / orphan cleanup).

**Resolved gate decisions (2026-06-03):** Playwright visual-regression = adopted (story 2 builds it). CSS strategy = plain CSS + two-tier tokens + CI guards (no new toolchain). Layout depth (story 12) and dark-theme depth (story 13) deferred to their own gates.

## Goal

Make the `apps/web` front end overhaul-ready: a future designer-led visual overhaul (new icons, restyled components, micro-animations, a wholesale re-skin, or a dark mode) becomes a change to token values and primitive internals, with minimal-to-no application-code change and no functional change. Lock each gain behind a CI guard so the abstraction cannot erode again.

Accepted decisions (see ADR 0038): full-scope design system (all token axes + primitives + icon registry + motion layer + layout primitives + CI guards), extracted to a `@unbnd/ui` workspace package matching the `@unbnd/trust` precedent.

## Operating principles for every story

1. **Behavior-preserving — "same pixels, better structure."** No functional or visual change unless the story is explicitly a token-value change reviewed against brand rules. Visual-regression (if adopted per ADR 0038 sub-decision 2) must run zero-diff.
2. **`main` stays shippable.** Each story is independently shippable and reverts cleanly. No story leaves the tree half-migrated in a way that breaks build, typecheck, or tests.
3. **Each story introduces or extends exactly one CI guard** that locks the gain it just made. The guard lands green in the same story and goes red on any future regression.
4. **No new tooling without its ADR gate.** Sub-decision 1 (plain CSS + tokens) adds none. Sub-decision 2 (Playwright visual-regression) needs explicit user sign-off before Story 2.
5. **No AI-slop** in any string or doc the work authors. Amber-only accent, hand-authored SVGs only.

## Sequencing rationale

Order minimizes risk and rework: lay the package and the token foundation first (everything else references tokens), prove "no visual change" tooling before touching real styles, then sweep each axis lowest-entanglement-first (color to type to spacing), then build the primitive/icon/motion layers on top of the now-stable tokens, then the hardest axis (layout), and finally theming, which is only meaningful once the two-tier tokens and primitives exist. Each guard follows immediately behind its sweep so the gain is locked before the next sweep begins.

```
1 package scaffold + tokens ─┐
2 visual-regression harness  │ (gate: tooling sign-off)
3 color tokens + guard ──────┤
4 type tokens + guard        │
5 spacing tokens + guard     │
6 breakpoint tokens + guard  │
7 motion tokens + guard      │
8 Button/IconButton + guard  │ (depends on color+type+spacing+motion)
9 Icon registry + guard      │
10 form + surface primitives │
11 motion util/primitive     │
12 layout primitives + guard │ (hardest; may land partial)
13 theming + dark-mode struct│ (depends on full two-tier tokens)
14 docs + rule re-point      ┘
```

## Stories (ordered)

Each story below is a one-line scope plus its dependency and the guard it introduces. Stories are drafted in full via `/plan-feature` when picked up; numbers are assigned from the live `stories/` sequence at draft time.

1. **Scaffold `@unbnd/ui` package** — create `packages/ui` mirroring `packages/trust` (package.json, tsconfig, vitest config, `src/index.ts`, `test/`), wire `react`/`react-dom` as peers, add `@unbnd/ui` to `apps/web` deps; export and import the *existing* token set unchanged from the package so `apps/web` consumes tokens from `@unbnd/ui` with identical output.
   - Depends on: nothing. Guard: package builds/typechecks/tests under `pnpm -r`; no behavior change (this is the structural beachhead).

2. **Visual-regression harness** — add Playwright screenshot baselines for the key screens (home, book detail, profile, search, auth, submit) and a CI job that fails on any pixel diff. *(ADR-gated tooling: requires user sign-off. If declined, this becomes a documented manual before/after screenshot gate.)*
   - Depends on: 1. Guard: the visual-regression job itself — the proof mechanism every later story relies on.

3. **Color token migration + guard** — introduce the two-tier color tokens (raw color ramp to semantic aliases), fix the live `--u-bg`/`--u-line`/`--u-danger` drift, sweep the 63 stray hex literals + translucent `rgba()` into tokens, and unify the triplicated genre/cover palette onto the genre tokens (Avatar `BGS`/`INKS` and `view-model.ts` `COVER_PALETTE` re-sourced from tokens).
   - Depends on: 1, 2. Guard: **no undefined token references** + **no raw color literals** outside the token layer.

4. **Type token migration + guard** — add the type scale (sizes, weights, line-heights, families) as raw + semantic bundles; sweep the 210 `font-size` and 109 `font-weight` literals onto tokens.
   - Depends on: 1, 2. Guard: **no raw `font-size`/`font-weight`/`line-height`** outside the token layer.

5. **Spacing token migration + guard** — add the spacing scale (raw `--u-raw-space-*` to semantic insets); sweep the 355 `padding`/`margin`/`gap` literals onto tokens.
   - Depends on: 1, 2. Guard: **no raw spacing literals** outside the token layer and layout primitives.

6. **Breakpoint + radii/elevation/z-index tokens + guard** — collapse the 16-plus ad-hoc breakpoints onto a `--u-raw-bp-*` set with a matching typed `breakpoints` export; tokenize radii, parchment-elevation, and z-index.
   - Depends on: 1, 2. Guard: **no raw `@media` pixel values** outside the allowed set; no raw radius/z-index literals outside tokens.

7. **Motion tokens + reduced-motion + guard** — add `--u-raw-duration-*` / `--u-raw-ease-*` and semantic motion aliases; migrate the 29 ad-hoc transitions; add the global `prefers-reduced-motion` block that zeroes motion durations.
   - Depends on: 1, 2. Guard: **no raw transition/animation durations or easings** outside the motion layer; presence of the reduced-motion block.

8. **`Button` + `IconButton` primitives + guard** — build the typed `Button`/`IconButton` (variant/size/state props, token-backed), migrate all 38 raw `<button>`s and their nine bespoke classes.
   - Depends on: 3, 4, 5, 7. Guard: **no raw `<button>`** in app code (allowlist: the primitive files).

9. **`Icon` registry + guard** — build `<Icon name>` over a typed hand-authored SVG registry; migrate the 5 inline `<svg>` sites and the 2 one-off icon components.
   - Depends on: 1. Guard: **no raw `<svg>`** in app code outside the registry.

10. **Form + surface primitives** — `Input`/`Field`/`Label`, `Card`, `Pill`, `Avatar`, `Link` with stable prop contracts; migrate the auth/submit forms, cards, pills, and avatars.
    - Depends on: 3, 4, 5, 8, 9. Guard: extends the literal guards to cover the migrated component CSS (allowlist shrinks).

11. **Motion util/primitive** — small token-backed `transition()` helper/class set and a reduced-motion-aware hook for any JS-driven motion; route primitive interactions through it.
    - Depends on: 7, 8. Guard: extends the motion guard to component interaction styles.

12. **Layout primitives (`Stack`/`Grid`/`Container`)** — separate structure from skin; convert screens to layout primitives. Hardest axis; the story states which screens convert now and which are explicitly deferred. May land partial.
    - Depends on: 5, 10. Guard: spacing-literal guard extended to enforce layout flows through primitives on converted screens.

13. **Theming substrate + dark-mode structure** — formalize `[data-theme]` scoping, prove a second skin can override Tier-2/Tier-1 values, and stand up (but do not visually finalize) a dark theme to validate the structure.
    - Depends on: 3, 4, 5, 6, 7. Guard: a theme-completeness check (every semantic token resolvable under each declared theme).

14. **Docs + rule re-point** — update `CLAUDE.md` / `AGENTS.md` so the "brand tokens are the source of truth" rule and the icon/hex rules point at `@unbnd/ui` and cite the new guards.
    - Depends on: all prior. Guard: none new (doc story); the guards themselves are the living documentation.

## Open questions for the gate

- **Visual-regression tooling (Story 2):** adopt Playwright as a dev dependency + CI job (recommended), or fall back to a manual screenshot gate? Needs user sign-off under the no-new-tooling rule.
- **CSS strategy confirmation:** ADR 0038 recommends staying on plain CSS + tokens + guards (no tooling). Confirm, or open a separate ADR for vanilla-extract later.
- **Layout axis depth (Story 12):** how far to push the layout-primitive conversion in this epic versus deferring tail screens to a follow-up.
- **Dark theme (Story 13):** structure-only now (recommended), or author a finished dark skin in this epic?

## Done definition for the epic

Every token axis lives in `@unbnd/ui` as two-tier tokens; `Button`/`IconButton`/`Icon`/form/surface primitives are the only way app code creates those elements; motion and reduced-motion are token-driven; layout primitives separate structure from skin on the converted screens; a second theme can be applied by attribute alone; and every gain is held by a green CI guard. A re-skin is then a tokens-and-internals change with no app-code churn.
