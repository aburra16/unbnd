# Story 50: Theming substrate + dark-mode structure

**Status:** Draft
**Created:** 2026-06-04
**Type:** Refactor

## Background

This is epic story 13 of the design-system overhaul (`engineering-team/epics/0001-design-system-overhaul-ready.md`), and it is the story that most directly delivers the user's stated epic goal: **"a future redesign is a straightforward swap-out."** Theming via `[data-theme]` is that swap mechanism.

Stories 38–49 built the full two-tier token system in `packages/ui/styles/tokens.css`: a raw tier (`--u-raw-*`) of literal values, and a semantic tier (`--u-*` / `--signal-*` / `--genre-*`, plus the `--font-*` and `--page-*` carry-overs) that aliases the raw tier and never holds a literal. Every axis — color, type, spacing, radii, elevation, z-index, motion — is now two-tier, all under a single `:root`, with 10 CI guards holding the gains. App CSS references only the semantic tier (verified: zero `var(--u-raw-*)` references in `apps/web/src`).

ADR 0038 §1 set the target the whole epic builds toward: "Theming is attribute-scoped: the default skin is defined under `:root`; alternate skins and dark mode override Tier-2 (or Tier-1) values under `[data-theme="<name>"]`. Because everything is custom properties, a theme switch is a single attribute on `<html>`, no rebuild, no per-component change. Dark mode is therefore reachable later without rearchitecting; it is **out of scope to author a dark theme now**, but the structure must admit one." ADR 0040 echoes this for color: "A re-skin now maps Tier-2 semantics to new raw values (or supplies a new raw set under `[data-theme]`); app CSS, which references only Tier 2, does not change."

What does not yet exist: the `[data-theme]` substrate itself. There is no `[data-theme]` selector anywhere in `apps/web` or `packages/ui` today (verified), and `<html lang="en">` in `apps/web/index.html` carries no `data-theme`. The two-tier tokens *enable* a skin swap, but no second skin has ever been defined, so the swap mechanism is unproven. This story formalizes the `[data-theme]` substrate, proves a second skin re-resolves the semantic tokens without touching app CSS, stands up a structurally-complete-but-not-finalized dark skeleton to validate the structure, and adds a theme-completeness guard so a theme can never be half-defined.

There is a direct in-repo precedent for a scoped `:root` override block: Story 44's `@media (prefers-reduced-motion: reduce)` block at the bottom of `tokens.css`, which re-declares the six semantic duration aliases under `:root` and is INERT at the default media state — so the Story-39 visual baseline stayed byte-identical with no baseline update. A `[data-theme="dark"]` block is the same shape of scoped override: it re-declares semantic (and/or raw) tokens, and is INERT until the attribute is set, which it never is in this story.

**Binding directive (zero-diff default).** This change is structural and modularity-only, invisible to users. The default state — `:root`, no `data-theme` attribute set — must render byte-identical. A second theme is DEFINED but NOT ACTIVATED: no `data-theme` is ever placed on `<html>`, so users see no change. No new product feature; no theme toggle UI.

## User-facing description

There is no user-facing change. As an engineer maintaining Unbnd, I want the `[data-theme]` theming substrate formalized and proven with a non-activated dark skeleton, so that a future designer-led re-skin (or a real dark mode) is a token-values-and-attribute change with no application-code churn — and so a theme can never silently ship half-defined.

## Acceptance criteria

Testable from the outside. Each criterion gets at least one test.

- [ ] **The theming substrate is formalized.** `packages/ui/styles/tokens.css` documents and structures the model: the default light skin's token definitions live under `:root`; a skin is a `[data-theme="<name>"]` selector that overrides the semantic (Tier-2) and/or raw (Tier-1) tokens. The default `:root` block is unchanged in content (same token names, same resolved values).
- [ ] **App CSS references only the semantic tier (swap-ability proof).** A guard confirms `apps/web/src` CSS contains zero `var(--u-raw-*)` references — i.e. app CSS reads only the semantic tier, so a theme swap that repoints semantics never requires touching app CSS. (Verified true today; this AC locks it.) If any stray raw reference is found, it is listed and either removed or recorded as an explicit, justified exception in the story.
- [ ] **A second skin demonstrably applies without touching app CSS.** A mechanism proves that under `[data-theme="dark"]` (or a dedicated test theme), at least one semantic token re-resolves to a different value than under `:root`, with no change to any `apps/web/src` file. This is the core deliverable: the swap is shown to work.
- [ ] **A `[data-theme="dark"]` skeleton is structurally complete but not finalized.** The dark block defines every semantic token that `:root` defines (it can override at the Tier-2 layer, the Tier-1 layer, or both — the Architect decides which layer), so no semantic token falls back to its light value by accident. It is explicitly a skeleton: values are placeholder/unpolished, not a reviewed dark palette, and it is NOT activated.
- [ ] **A theme-completeness guard passes.** For every declared `[data-theme]`, every semantic token resolvable under `:root` is also resolvable under that theme (the theme defines, or inherits-by-design, each one). The guard is green on landing and red on any future half-defined theme.
- [ ] **The default render is byte-identical.** The Story-39 Playwright `visual` job runs zero-diff against the committed baselines, and **no baseline is updated** — because no `data-theme` is set, nothing renders differently. The `prefers-reduced-motion` block and all prior token definitions under `:root` are unchanged.
- [ ] **All prior guards stay green and the build passes.** `pnpm -r typecheck`, `pnpm -r test` (the 10 existing guards plus the new completeness guard), and `pnpm --filter @unbnd/web build` all pass.

## DList shapes touched

None. This is a presentation-layer / CSS-architecture change with no data-layer, event, or DList-schema impact (consistent with ADR 0038, which records "DList shapes touched: None" for the whole design-system epic).

## Token survey (read-only, 2026-06-04)

- **Structure confirmed.** `packages/ui/styles/tokens.css` is two-tier across all seven axes, all under a single `:root`. Tier 1 is `--u-raw-*` literals; Tier 2 is semantic aliases that point at Tier 1 via `var(--u-raw-*)` and never at a literal (spot-checked across color, type, spacing, radii, elevation, z-index, motion).
- **Semantic (Tier-2) token count: 196.** Breakdown: 183 `--u-*` aliases that resolve through `var(--u-raw-*)` + 3 `--signal-*` + 8 `--genre-*` + 2 `--font-*` (`--font-sans`, `--font-mono`, kept names repointed to raw). Plus 2 `--page-*` (`--page-max: 720px`, `--page-pad-x: 24px`) which are layout literals defined directly (not raw-backed) — the Architect should decide whether the completeness guard treats these as semantic tokens a theme must define, or as theme-invariant layout constants (likely the latter: page geometry is not a skin concern).
- **App-CSS raw references: ZERO.** `grep -rn "var(--u-raw-" apps/web/src` returns 0 matches. App CSS reads only the semantic tier — the swap-ability precondition already holds, with no stray raw refs to clean up. The Architect should still confirm the guard's scope catches any future raw leak.
- **No `[data-theme]` exists anywhere.** `grep -rn "data-theme" apps packages` returns nothing. `apps/web/index.html` has `<html lang="en">` with no `data-theme`; `<body>` carries none either. This story does not add one to the HTML — the substrate is defined in CSS only.
- **Scoped-override precedent.** The `@media (prefers-reduced-motion: reduce)` block (lines 635–644 of `tokens.css`, Story 44) re-declares the six semantic duration aliases under `:root` and is inert at the no-preference state. It is the structural template for a `[data-theme]` override block: re-declare semantic tokens in a scoped block that is inert until its condition is met.

## Out of scope

- **No theme activation.** No `data-theme` attribute is set on `<html>` or anywhere in `apps/web`. No theme-toggle UI, no theme-selection control, no persistence/preference logic — that is a future *product* feature (its own story), not this structural one.
- **No user-facing change.** The default (`:root`, no `data-theme`) render stays byte-identical. The Story-39 visual job is zero-diff; no baseline is updated.
- **No polished/finalized dark palette.** The `[data-theme="dark"]` block is a structural skeleton (every semantic token defined, values unpolished). Designing, reviewing, or shipping a real dark skin against the brand rules is later work (ADR 0038 / 0040 both fence "authoring a dark theme" as out of scope).
- **No token-value change to the default light skin.** The `:root` definitions keep the same names and the same resolved values. This is not a re-skin of the live product.
- **No new product feature.**
- **No other-axis work and no doc re-point.** Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" rule at `@unbnd/ui` and citing the guards is epic story 14 (the next story), not this one (per the epic out-of-scope line and ADR 0040 Consequences).
- **No new tooling.** The completeness guard is a Vitest test under the existing `pnpm -r test`, mirroring the existing `packages/ui/test/architecture-*.test.ts` pattern. No new dependency, no build step (ADR 0038 §7).
- **PRD §11.3:** none of the listed out-of-scope items (payments, file hosting, ebook sales, social feed, reading progress, federation) are touched. This is Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum.

## Open questions

For the Architect to resolve at the Architecture gate:

1. **Which tier does `[data-theme="dark"]` override — semantic (Tier-2), raw (Tier-1), or both?** ADR 0038 §1 allows either ("override Tier-2 (or Tier-1) values"). Overriding Tier-1 raws flips every semantic alias that points at them in one move (fewer declarations, but couples the dark skin to the raw ramp's shape); overriding Tier-2 semantics is explicit per-role but more verbose. Which is the cleaner, more honest substrate to formalize, and does the completeness guard's definition of "resolvable" depend on the choice?

2. **What is the dark skeleton's scope and what values does it carry?** Every semantic token must be defined (completeness), but the values are explicitly unpolished. Are they crude inversions (e.g. ink↔parchment swap), a single placeholder per role, or a minimal honest first pass? How is "skeleton, not finalized" made unmistakable in the file so no one mistakes it for a shippable dark palette? And how are the genre/`--signal-*` tokens and the `GENRE_PALETTE` TS constant (the runtime-injected color path from ADR 0040) handled — does a CSS-only dark skeleton leave the JS-injected avatar/cover colors light, and is that acceptable for a structure-validation skeleton?

3. **What is the completeness-guard mechanism?** The existing `architecture-token-refs.test.ts` already parses defined-token sets per file (`definedTokens()` regex). The natural sibling: extract the semantic-token set defined under `:root`, then for each declared `[data-theme]` block assert every semantic token is defined/resolvable under it. How is "declared theme" enumerated (parse `[data-theme="…"]` selectors from `tokens.css`)? How are the `--page-*` layout literals and any deliberately theme-invariant tokens classified so the guard does not demand a theme redefine page geometry? Does the guard assert resolvability (no dangling `var()` chain) or just presence of the declaration?

4. **How is the swap proven — a real `[data-theme="dark"]` value diff, or a dedicated minimal test theme?** Is the "second skin re-resolves a semantic token" proof done against the dark skeleton itself, or via a tiny dedicated test theme that exists only to demonstrate the override resolves (keeping the dark skeleton purely structural)? Which keeps the proof honest and the default render provably untouched?

5. **Are there any stray raw references in app CSS that would block clean theming?** Survey says zero today. Confirm the guard scope would catch a future leak, and confirm there are no JS/inline-style raw color paths (beyond the known `GENRE_PALETTE` / `SEMANTIC_COLORS` runtime-injected constants from ADR 0040) that would silently stay light under a theme — and whether that matters for a structure-only story.

## Phase-2-hardening note

This is Phase 2 platform hardening (extends PRD §2.11 / Block E), per ADR 0038's phase classification. It changes no product behavior and no PRD claim; it is to be recorded in the post-Phase-2 PRD addendum, not as a PRD amendment now. It runs the full five-phase gated flow (Product Owner → Architect → Tester → Implementer → Reviewer); merge only on explicit "merge".

## Linked artifacts

- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 13)
- ADR: `engineering-team/decisions/0038-design-system-architecture.md` §1 (themeable token layer); `engineering-team/decisions/0040-color-tokens.md` (two-tier model, the `[data-theme]` re-skin note); (story-specific refining ADR filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
