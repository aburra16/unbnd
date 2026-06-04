# ADR 0050: Theming substrate, dark-mode skeleton, and the theme-completeness guard

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/50-theming-structure.md`

**Accepted 2026-06-04** (auto-mode epic closeout). `[data-theme="<name>"]` overrides the RAW color tier (`--u-raw-color-*`); the 73 semantic color aliases + app CSS (Tier-2 only) follow unchanged, so a skin swap touches no app code. A `[data-theme="dark"]` SKELETON (crude placeholders, marked NOT-finalized, NOT activated — no `data-theme` set) validates the mechanism; elevation re-themes for free (color follows the tints). Theme-completeness guard: every `--u-raw-color-*` under `:root` is redefined under each declared theme (non-color raws / Tier-2 aliases / elevation / `--page-*` are theme-invariant). JS-injected colors (`GENRE_PALETTE`/`SEMANTIC_COLORS`) are a documented out-of-scope boundary for a future real dark mode. ZERO-DIFF default. Open questions are Implementer latitude (guard placement; copy-vs-extract `definedTokens()`; skeleton placeholder values).

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03, §1 "themeable two-tier token layer; theming is `[data-theme]`-scoped; dark mode reachable later without rearchitecting, out of scope to author now"). Echoes and operationalizes **ADR 0040** (Accepted 2026-06-03): "A re-skin now maps Tier-2 semantics to new raw values (or supplies a new raw set under `[data-theme]`); app CSS, which references only Tier 2, does not change." Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job: `maxDiffPixelRatio: 0`, and the discipline that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 13 — the story that most directly delivers the user's stated epic goal, "a future redesign is a straightforward swap-out"). This ADR resolves the five open questions the story carries; it does not relitigate 0038, 0039, or 0040.

## Context

Stories 38–49 built the full two-tier token system in `packages/ui/styles/tokens.css`: a Tier-1 raw ramp (`--u-raw-*`) of literal values, and a Tier-2 semantic tier that aliases the raw tier and never holds a literal. Every axis — color, type, spacing, radii, elevation, z-index, motion — is two-tier, all under a single `:root`. Ten CI guards in `packages/ui/test/architecture-*.test.ts` hold the gains.

What does not yet exist is the `[data-theme]` substrate itself. The two-tier tokens *enable* a skin swap, but no second skin has ever been defined, so the swap mechanism is unproven. This story formalizes the `[data-theme]` substrate, proves a second skin re-resolves the semantic tokens without touching app CSS, stands up a structurally-complete-but-unactivated dark skeleton, and adds a theme-completeness guard so a theme can never silently ship half-defined.

### Acceptance criteria (quoted from the story)

- The theming substrate is formalized: the default light skin's token definitions live under `:root` (unchanged in content and resolved values); a skin is a `[data-theme="<name>"]` selector that overrides the semantic (Tier-2) and/or raw (Tier-1) tokens.
- App CSS references only the semantic tier (swap-ability proof): a guard confirms `apps/web/src` CSS contains zero `var(--u-raw-*)` references.
- A second skin demonstrably applies without touching app CSS: under `[data-theme="dark"]` (or a dedicated test theme), at least one semantic token re-resolves to a different value than under `:root`, with no change to any `apps/web/src` file.
- A `[data-theme="dark"]` skeleton is structurally complete but not finalized: it defines every semantic token the completeness guard requires (overriding at Tier-1, Tier-2, or both — the Architect decides), so no required token falls back to its light value by accident. Values are placeholder/unpolished; it is NOT activated.
- A theme-completeness guard passes: for every declared `[data-theme]`, every semantic token in scope is also defined/resolvable under that theme. Green on landing, red on any future half-defined theme.
- The default render is byte-identical: the Story-39 `visual` job runs zero-diff against committed baselines, no baseline updated.
- All prior guards stay green and the build passes: `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build`.

### Verified current state (read-only, 2026-06-04, against the `story-50-theming` working tree)

- **Two-tier structure confirmed.** `tokens.css` is two-tier across all seven axes, all under a single `:root`. Tier 1 is 193 `--u-raw-*` literals; Tier 2 is the semantic tier.
- **Tier-2 token census (parsed from the `:root` block, excluding the `@media (prefers-reduced-motion)` override).** 198 Tier-2 names are defined under `:root`. Of these, exactly **196 alias the raw tier** via `var(--u-raw-*)` and never a literal; exactly **two hold a literal directly**: `--page-max: 720px` and `--page-pad-x: 24px`. So the story's "196 semantic tokens, all pointing at `--u-raw-*`" is precise once `--page-*` are recognized as the two layout-literal exceptions (they are NOT raw-backed; this ADR classifies them as theme-invariant, §5).
- **Tier-2 by axis** (the basis for the scope decisions below): **color 73**, type 56, spacing 32, radius 13, elevation 12, z-index 3, motion 7, page 2. The 73 color tokens include the 8 `--genre-*` and 3 `--signal-*` (kept as-is per ADR 0040's gate decision, repointed to raw).
- **Elevation resolves through color.** The 12 `--u-elevation-*` aliases point at `--u-raw-elevation-*`, whose stored `box-shadow` values embed `var(--u-ink-tint-*)` / `var(--u-amber-tint-*)` color tints (e.g. `--u-raw-elevation-2: 0 3px 12px var(--u-ink-tint-10)`). So elevation re-themes *automatically* when the ink/amber color tints are overridden — it carries no independent literal a theme must redefine. This is decisive for the guard scope (§4).
- **App-CSS raw references: ZERO.** `grep -rn "var(--u-raw-" apps/web/src` returns 0. App CSS reads only the semantic tier — the swap precondition already holds, with no stray raw refs to clean up.
- **No `[data-theme]` exists anywhere.** `grep -rn "data-theme" apps packages` returns nothing. `apps/web/index.html` has `<html lang="en">` with no `data-theme`; `<body>` carries none either.
- **The runtime-injected color path is real and CSS cannot reach it.** `GENRE_PALETTE` (`packages/ui/src/palette.ts`) and `SEMANTIC_COLORS` (`packages/ui/src/colors.ts`) are TS constants of hex literals (ADR 0040 §3/§4) consumed as inline `style` colors and SVG `fill`/`stroke` props by `packages/ui/src/components/Avatar.tsx`, `apps/web/src/lib/view-model.ts` (cover gradients), `packages/ui/src/components/Icon/icons.tsx`, `apps/web/src/components/Footer.tsx`, and the auth routes (`AuthWelcome.tsx`, `AuthNostrConnect.tsx`). A CSS `[data-theme]` selector cannot re-theme a value JS has already interpolated into an inline `style` string — there is no cascade indirection there. This is a documented boundary, not a defect (§"The JS-injected-color boundary").
- **Scoped-override precedent.** The `@media (prefers-reduced-motion: reduce)` block (ADR 0044) re-declares the six semantic duration aliases under `:root` and is INERT at the no-preference state, so the Story-39 baseline stayed byte-identical with no baseline update. A `[data-theme]` block is the same shape of scoped override: it re-declares tokens in a block that is inert until its condition (the attribute) is met, which in this story it never is.

### Constraints that bind this design

- **Zero-diff for the default state is the prime directive.** The default render — `:root`, no `data-theme` attribute set — must stay byte-identical. No token-value change to the light skin. The second theme is DEFINED but NOT ACTIVATED (no `data-theme` on `<html>`, no toggle UI). Users see no change. The Story-39 `visual` job stays zero-diff; no baseline is updated (ADR 0039).
- **No new tooling.** The completeness guard is a Vitest test under the existing `pnpm -r test`, mirroring the `packages/ui/test/architecture-*.test.ts` pattern, reusing the `definedTokens()` parser from `architecture-token-refs.test.ts`. No new dependency, no build step (ADR 0038 §7).
- **No AI-slop** in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`); the comment blocks the Implementer adds to `tokens.css` are reviewed against it.
- In-repo prior art governs; the Tapestry branch survey does not apply (ADR 0038; story "DList shapes touched: None"). The data-layer invariants (POV-first, decentralized-first, filter-at-view-time) are untouched — this is a presentation-layer CSS-architecture change.

## Options considered

The load-bearing decision is **which tier `[data-theme]` overrides** (Open Question 1). The dark-skeleton scope, the swap proof, and the guard definition all follow from it. Options are framed around that choice.

### Option A — A theme overrides the RAW (Tier-1) color ramp; semantics follow automatically (CHOSEN)

A skin is a `[data-theme="<name>"]` block that re-declares the **Tier-1 raw color tokens** (`--u-raw-color-*`). Because every Tier-2 color alias points at a raw via `var(--u-raw-color-*)`, overriding the raws flips every semantic color token, every color tint, and (transitively) every elevation shadow in one move. The Tier-2 layer is not touched by the theme at all; it keeps doing its only job (mapping role → raw) unchanged.

```css
/* tokens.css, after the :root block and the prefers-reduced-motion block */
[data-theme="dark"] {
  /* SKELETON — unpolished placeholder values, NOT a reviewed dark palette,
     NOT activated. Overrides the Tier-1 raw color ramp; the Tier-2 semantic
     aliases under :root resolve through these unchanged. See ADR 0050. */
  --u-raw-color-ink-900: #ECECF2;      /* was #1A1A2E — crude light/dark flip */
  --u-raw-color-parchment-50: #14141F; /* was #FAF6F0 */
  /* …every --u-raw-color-* the guard requires, §4… */
}
```

- Pros: **fewest declarations for a wholesale palette swap** (override ~the color raws, not all 73 color semantics); it is the literal meaning of "redesign = swap out the palette." The Tier-2 layer stays a pure role map, so a theme cannot accidentally re-map a *role* (e.g. make `--u-amber` resolve to a non-amber) while pretending to be a palette swap — the role taxonomy is preserved across themes by construction. Elevation and tints re-theme for free (they read raws transitively). The completeness guard's job is clean: "every required raw is redefined under the theme." Matches ADR 0040's "supplies a new raw set under `[data-theme]`" phrasing exactly.
- Cons: a theme is **coupled to the raw ramp's shape** — it must know the raw token names (`--u-raw-color-ink-900`, the alpha steps, the genre hues) and supply a value for each in scope. A skin that wants to re-map a *role* specifically (e.g. "in this theme, `--u-border` should read amber, not ink-tint") cannot do it by overriding raws alone; it would also override that one Tier-2 alias. Mitigated: that is a rare, deliberate role-remap and the substrate explicitly *allows* a theme to also override specific Tier-2 aliases (§"The substrate rule") — Option A is the default mechanism, not a prohibition on Tier-2 overrides.

### Option B — A theme overrides the SEMANTIC (Tier-2) color aliases; raws are left alone

A skin re-declares the **Tier-2 semantic color tokens** (`--u-ink`, `--u-amber`, `--u-border`, the 73 color roles…), pointing each at a different value (a new raw, or a literal). The raw ramp is untouched.

- Pros: explicit per-role control; a skin reads as "this is what each role becomes," which is self-documenting. A role-remap (border becomes amber) is natural.
- Cons: **verbose** — a wholesale palette swap must re-declare ~73 color semantics instead of ~the raw set, and any *new* color role added later silently inherits the light raw unless every theme is updated (the very half-defined-theme failure this story guards against, now with a larger surface). It also invites a theme to point a semantic at a *literal*, reintroducing the Tier-2-holds-a-literal anti-pattern the whole two-tier system exists to kill, but scoped under `[data-theme]` where no guard currently looks. Tints and elevation would each need explicit override too (they are Tier-2 aliases over raws), multiplying the surface. Rejected as the *default*: it maximizes the declaration count and the half-definition risk for the common case (a palette swap), which is precisely what "redesign = swap-out" should make cheap.

### Option C — Both tiers, with no rule about which

Let a theme override raws or semantics freely with no documented default.

- Pros: maximally flexible.
- Cons: no **honest, enforceable** definition of "complete" — the guard cannot know whether a theme that redefines a raw but not a semantic (or vice versa) is complete, because "resolvable" depends on which tier the theme chose, per token. An undocumented free-for-all is exactly the convention-only enforcement ADR 0038 set out to end. Rejected: a substrate with no rule is not a substrate.

## Decision

We choose **Option A**: a `[data-theme]` skin overrides the **Tier-1 raw color tier** by default; the Tier-2 semantic layer resolves through it unchanged. A theme MAY additionally override specific Tier-2 semantic aliases for a deliberate role-remap, but that is the exception, documented per-token, not the default. This is the cleanest, most honest substrate for "redesign = swap-out": a new skin is a new raw palette, and app CSS — which reads only Tier 2 — never changes. The completeness guard (§4) is defined against this choice: a theme is complete when it redefines every **theme-varying raw color token**.

### The substrate rule (formalized)

`tokens.css` documents and structures the model with a header comment block the Implementer adds above the first `[data-theme]` selector. The rule, precisely:

1. **The default light skin is the `:root` definitions.** Tier 1 (`--u-raw-*` literals) and Tier 2 (semantic aliases) both live under `:root`. This block is **unchanged in content and in every resolved value** by this story (zero-diff prime directive). `--page-max` / `--page-pad-x` keep their literals under `:root`.
2. **A skin is a `[data-theme="<name>"]` selector.** It is a scoped override block, structurally identical to the `@media (prefers-reduced-motion)` precedent: it re-declares tokens and is INERT until its selector matches (i.e. until `data-theme="<name>"` is set on an ancestor, normally `<html>`). This story sets no such attribute anywhere, so every `[data-theme]` block is inert and the default render is unaffected.
3. **A skin overrides the Tier-1 raw color tier.** It re-declares `--u-raw-color-*` values. Every Tier-2 color alias under `:root` resolves through the overridden raws automatically, so app CSS (Tier-2 only) re-themes with no change. This is the default and recommended mechanism.
4. **A skin MAY additionally override specific Tier-2 semantic aliases** for a deliberate role-remap (a documented exception, e.g. "in this theme `--u-border` reads amber"). A skin MUST NOT point a Tier-2 alias at a *literal* — the two-tier invariant (Tier 2 references Tier 1, never a literal) holds inside a theme block exactly as under `:root`.
5. **Non-color axes are theme-invariant** (§5): a skin does not redefine type, spacing, radii, elevation, z-index, motion, or `--page-*`. A re-skin changes color (and, if ever needed, could opt specific raws of another axis in — but the default skeleton and the guard scope only color).

### The dark skeleton scope (structural, unactivated, unfinalized)

A single `[data-theme="dark"]` block is added at the bottom of `tokens.css`, after the `prefers-reduced-motion` block. Scope and honesty rules:

- **It overrides the Tier-1 raw color tier only** (Option A). It re-declares every **theme-varying raw color token** the completeness guard requires (§4) — the opaque hues, the parchment/white surfaces, the muted/signal/genre hues, and the translucent alpha steps — so no required token falls back to its light value by accident.
- **Values are crude, honest placeholders, not a reviewed palette.** The skeleton's job is to validate the mechanism, not to look good. A defensible first pass is a light↔dark inversion of the surface/ink anchors (parchment → near-black, ink → near-white) with the accent/signal/genre hues left at or near their light values; the exact placeholder values are the Implementer's, constrained only by "every required raw is defined" and "no AI-slop in the comment." Polishing this into a shippable dark palette against the brand rules is explicitly later work (out of scope).
- **It is made unmistakably a skeleton in the file.** A prominent comment block states: SKELETON — unpolished placeholder values, NOT a reviewed dark palette, NOT activated (no `data-theme` is set anywhere); see ADR 0050. So no one mistakes it for a shipped dark mode.
- **The JS-injected colors are out of dark-theme scope** (documented boundary, below). The dark skeleton re-themes all CSS-token-driven color. Avatar/cover/icon colors injected from `GENRE_PALETTE` / `SEMANTIC_COLORS` stay at their light values under any CSS theme; for a structure-validation skeleton this is acceptable and correct to leave, and it is recorded as the boundary a future real dark mode must address separately.

### The swap proof

The proof that the swap works is delivered **two ways**, both honest and both keeping the default render provably untouched:

1. **A dedicated minimal test theme drives the indirection proof.** The completeness guard's test file (below) parses `tokens.css` and asserts, in a unit test, that the `[data-theme="dark"]` block redefines at least one specific raw to a value different from its `:root` value, and that the corresponding Tier-2 alias is *unchanged* (still `var(--u-raw-color-…)`), demonstrating that the semantic token re-resolves purely through the raw override with no Tier-2 edit and no app-CSS edit. This is a static-analysis proof of the indirection: it shows the mechanism without rendering, so it cannot perturb the visual baseline. **No app-CSS file is touched**, which the test asserts by construction (it reads only `tokens.css`).
   - *(A dedicated `[data-theme="__test"]` block is NOT added: the dark skeleton already provides a real second skin whose raws differ from `:root`, so a synthetic test-only theme would be redundant surface. The guard proves the override against the dark block directly. If the dark skeleton's placeholder values were ever made identical to `:root` for some raw, the "at least one raw differs" assertion would still hold against the inverted surface anchors.)*
2. **The Story-39 `visual` job is the negative proof.** Because no `data-theme` attribute is set, the dark block is inert and the rendered output is byte-identical; the `visual` job is zero-diff with no baseline update. Defined-but-not-activated is proven by the visual gate showing nothing changed.

Together: the unit test proves the override *resolves* (positive), and the visual gate proves the default render *did not move* (negative). The swap is shown to work and shown to be invisible.

### The theme-completeness guard (spec)

New file `packages/ui/test/architecture-theme-completeness.test.ts`, mirroring the existing `architecture-*.test.ts` structure (`REPO` resolve, `readFileSync`, single aggregated `expect(offenders).toEqual([])`), and **reusing the `definedTokens()` parser** from `architecture-token-refs.test.ts` (the natural sibling — it already extracts a `Set` of `--name:` definitions from a CSS string).

**What it parses.** From `tokens.css`:
- The `:root` definition set (via `definedTokens()` on the `:root` block, i.e. the file content before the first `[data-theme]` / `@media` scoped block — or by scoping the parse to the `:root { … }` body).
- The set of **declared themes**: every distinct `[data-theme="<name>"]` selector found in the file (regex `\[data-theme="([^"]+)"\]`). This is how "declared theme" is enumerated, so adding a theme block automatically enrolls it in the guard.
- Each theme block's defined-token set (via `definedTokens()` on that block's body).

**The in-scope token set (what "complete" means).** A theme must redefine every **theme-varying raw color token**: the `--u-raw-color-*` definitions under `:root`. This set is derived, not hand-listed, so it cannot drift: the guard computes `inScope = { every --u-raw-color-* defined under :root }`. For each declared theme, every token in `inScope` must be present in that theme's defined set; any missing one is an offender (`"[data-theme=\"dark\"] does not redefine --u-raw-color-ink-900"`). This is what makes a half-defined theme impossible: add a new raw color to `:root`, and every theme must define it too or the guard goes red.

**Explicitly theme-invariant (NOT required of a theme), and why:**
- **All non-color raws** — `--u-raw-font-*`, `--u-raw-weight-*`, `--u-raw-leading-*`, `--u-raw-tracking-*`, `--u-raw-family-*`, `--u-raw-space-*`, `--u-raw-radius-*`, `--u-raw-z-*`, `--u-raw-duration-*`, `--u-raw-ease-*`. A re-skin changes color, not geometry/type/motion (§5).
- **All Tier-2 semantic aliases** — they are NOT required of a theme, because under Option A they resolve through the overridden raws automatically. (A theme MAY override a Tier-2 alias for a role-remap, but it is never *required* to; the guard checks raws, the indirection delivers the rest.)
- **`--u-raw-elevation-*`** — theme-invariant *as definitions*, because their `box-shadow` geometry does not change per skin and their color component is `var(--u-ink-tint-*)` / `var(--u-amber-tint-*)`, which re-themes via the ink/amber raw overrides. The guard does not demand a theme redefine elevation; the color tints it reads are already in `inScope`.
- **`--page-max` / `--page-pad-x`** — page geometry is not a skin concern; theme-invariant by §5. (They are Tier-2 literals, not raws, so they are already outside `inScope` by construction.)

**Resolvability vs presence.** The guard asserts **presence of the redefinition** under each theme for every in-scope raw (the override exists in the theme block). Full `var()`-chain resolvability across the whole sheet is already the job of **Guard A** (`architecture-token-refs.test.ts`, "no undefined token references"), which scans the entire `tokens.css` including the theme blocks; if a theme pointed a token at an undefined name, Guard A catches it. So this guard's honest, non-redundant job is **completeness** (every theme defines every theme-varying raw), and it adds the one **indirection assertion** from the swap proof (at least one in-scope raw differs from its `:root` value under `dark`, and that raw's Tier-2 alias is unchanged). Resolvability is delegated to the existing Guard A; this avoids re-implementing a `var()`-chain resolver and keeps each guard single-purpose.

**Green on landing.** The dark skeleton defines exactly the `inScope` set, so the completeness guard is green the moment it lands and red forever after on any half-defined theme.

### The app-CSS-only (swap-ability) guard

The story's AC "app CSS references only the semantic tier" is **already enforced** by Guard B (`architecture-color-literals.test.ts`) and Guard A together for *literals* and *undefined refs*, but neither asserts the specific "zero `var(--u-raw-*)` in `apps/web/src`" precondition. This ADR specifies a thin assertion to lock it: either a new tiny guard or an added assertion in the completeness test that scans `apps/web/src` `.css` for `var(--u-raw-` and asserts zero matches (verified zero today, §"Verified current state"). The Implementer picks the lighter placement; the contract is "a CI assertion fails if any app CSS ever references a raw directly." This is the swap precondition made permanent: app CSS reads only Tier 2, so a raw-tier theme override never requires an app-CSS change.

### The JS-injected-color boundary (documented out-of-scope)

`GENRE_PALETTE` and `SEMANTIC_COLORS` (TS hex constants, ADR 0040 §3/§4) are interpolated into inline `style` colors and SVG `fill`/`stroke` props by `Avatar.tsx`, `view-model.ts` (cover gradients), `Icon/icons.tsx`, `Footer.tsx`, and the auth routes. A CSS `[data-theme]` selector **cannot** re-theme a value JS has already written into an inline style — there is no cascade indirection at that point. This is a real, honest boundary:

- **CSS-token theming (this story) re-themes everything driven by CSS custom properties** — which is all CSS color, the tints, and (transitively) elevation.
- **The JS-injected colors stay at their light values under any CSS theme.** For a structure-validation skeleton this is acceptable and correct to leave as-is; the dark skeleton's purpose is to prove the CSS mechanism, not to deliver a complete dark mode.
- **A future real dark mode must address this path separately** — e.g. by having `GENRE_PALETTE`/`SEMANTIC_COLORS` resolve per-theme (a theme-aware TS lookup, or reading the cascade where a DOM is available), which is a deliberate design decision with its own tradeoffs (ADR 0040 §3 already documented why the runtime-injected path cannot read the cascade in a no-build package). **This story does not attempt to re-theme the JS path**, and the ADR records the boundary so the future dark-mode story inherits it explicitly rather than discovering it.

## Consequences

- **Enables** a future designer-led re-skin (or a real dark mode) as a Tier-1 raw-palette override under `[data-theme]` plus a single attribute on `<html>`, with **no application-code churn** — the user's core epic goal, now proven structurally and locked by a guard. The two-tier system's "swap-out" promise moves from claimed to demonstrated.
- **Constrains** all future themes: a theme overrides the raw color tier (or, by exception, specific Tier-2 aliases, never a literal), must define every theme-varying raw (the completeness guard enforces it), and does not touch non-color axes by default. A theme can never silently ship half-defined.
- **New debt / follow-ups:** (1) **theme activation** — a `data-theme` attribute on `<html>`, a theme-toggle UI, and preference/persistence logic are a future *product* feature (its own story), not this structural one. (2) **A polished, brand-reviewed dark palette** replacing the skeleton's placeholders is later work (ADR 0038 / 0040 fence "authoring a dark theme" as out of scope). (3) **The JS-injected-color path** (`GENRE_PALETTE` / `SEMANTIC_COLORS`) must be made theme-aware before a real dark mode ships; recorded as the documented boundary above. (4) Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" rule at `@unbnd/ui` is epic story 14 (the next story), not this one.
- **Affects existing fixtures?** No. No data fixture, no `view-model.ts` value, and no `:root` token value changes. The `[data-theme="dark"]` block is additive and inert; the Story-39 `visual` job confirms byte-identical render with no baseline update.
- **New dependency?** No. The completeness guard is a new Vitest test in the existing `packages/ui/test/`, reusing the `definedTokens()` parser. No new third-party dependency, no new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes. Phase 2 platform hardening (extends PRD §2.11 / Block E per ADR 0038), to be recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors for the Implementer (Architect is read-only on source; these are the targets, not edits made here):

- **Token sheet** `packages/ui/styles/tokens.css`:
  - Add a header comment block above the new theme section formalizing the substrate rule (§"The substrate rule"): default = `:root`; a skin = a `[data-theme]` selector overriding the Tier-1 raw color tier; non-color axes are theme-invariant; a theme may override a Tier-2 alias for a role-remap but never point one at a literal. Reviewed against `memory/feedback_unbnd_copy_and_visual.md` (no em dashes, no rhetorical contrasts, no filler).
  - Add a single `[data-theme="dark"] { … }` block **after** the `@media (prefers-reduced-motion)` block, redefining every `--u-raw-color-*` token that `:root` defines (the `inScope` set: opaque hues, parchment/white, muted, green/red/purple, genre hues + teal, and every `--u-raw-color-*-a<NN>` alpha step). Values are crude placeholders (a surface/ink inversion is a fine first pass); a prominent comment marks it SKELETON — unpolished, NOT reviewed, NOT activated, see ADR 0050. Do NOT redefine any non-color raw, any Tier-2 alias, `--u-raw-elevation-*`, or `--page-*`.
  - Do NOT set `data-theme` anywhere (`apps/web/index.html` `<html lang="en">` stays as-is). Do NOT touch the `:root` block's content or any resolved value.
- **Completeness guard** `packages/ui/test/architecture-theme-completeness.test.ts`:
  - Import/reuse the `definedTokens()` parser pattern from `architecture-token-refs.test.ts` (extract or copy the regex helper; if extracting, keep `architecture-token-refs.test.ts` green).
  - Parse: the `:root` defined set; the in-scope set `= { --u-raw-color-* defined under :root }`; the declared themes `= distinct [data-theme="<name>"]` selectors; each theme's defined set.
  - Assert (aggregated offenders → `expect([]).toEqual([])`): for each declared theme, every `inScope` token is in that theme's defined set. Plus the indirection assertion: under `[data-theme="dark"]`, at least one `inScope` raw is redefined to a value `!==` its `:root` value, and that raw's Tier-2 color alias under `:root` is unchanged (still `var(--u-raw-color-…)`).
  - Theme-invariant by construction (NOT required of a theme): all non-color raws, all Tier-2 aliases, `--u-raw-elevation-*`, `--page-*`. Document this in the file's header comment exactly as §4 states.
- **App-CSS-only assertion** (swap precondition): a thin CI assertion that `apps/web/src` `.css` contains zero `var(--u-raw-` references (verified zero today). Placement is the Implementer's choice — a small dedicated guard, or an added assertion in the completeness test. Mirror the `walk()` + `SKIP_DIRS` + `readFileSync` pattern.
- **Verification gate:** after the change, `pnpm -r typecheck`, `pnpm -r test` (the 10 existing guards + the new completeness guard + the app-CSS-only assertion), and `pnpm --filter @unbnd/web build` all pass; the Story-39 `visual` job is zero-diff with **no baseline update** (the dark block is inert because no `data-theme` is set).

## Out of scope

- **No theme activation.** No `data-theme` attribute on `<html>` or anywhere in `apps/web`; no theme-toggle UI, no theme-selection control, no persistence/preference logic — a future *product* feature (its own story).
- **No polished/finalized dark palette.** The `[data-theme="dark"]` block is a structural skeleton (every required raw defined, values unpolished). Designing, reviewing, or shipping a real dark skin against the brand rules is later work (ADR 0038 / 0040 fence "authoring a dark theme").
- **No token-value change to the default light skin.** The `:root` definitions keep the same names and the same resolved values; this is not a re-skin of the live product.
- **No re-theming of the JS-injected color path.** `GENRE_PALETTE` / `SEMANTIC_COLORS` (Avatar/cover/icon/Footer/auth colors) stay at their light values under any CSS theme; making them theme-aware is a future dark-mode concern (documented boundary).
- **No non-color theming.** Type, spacing, radii, elevation, z-index, motion, and `--page-*` are theme-invariant in this story's substrate and guard scope.
- **No new tooling.** The completeness guard is a Vitest test under the existing `pnpm -r test`; no new dependency, no build step (ADR 0038 §7).
- **No doc re-point.** Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" rule at `@unbnd/ui` and citing the guards is epic story 14, not this one (ADR 0040 Consequences).
- **PRD §11.3:** none of the listed out-of-scope items (payments, file hosting, ebook sales, social feed, reading progress, federation) are touched. Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum.
