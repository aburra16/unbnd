# ADR 0043: Two-tier radii, elevation, and z-index tokens; canonical breakpoints via a typed export and a `@media` guard; and the shape-literal CI guards

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/done/43-breakpoints-radii-elevation-z.md`

**Approved 2026-06-03** at the architecture gate. Gate resolutions (recommended defaults, consistent with ADR 0040/0041/0042): (1) **two guard files** — `architecture-shape-literals.test.ts` (radius + box-shadow geometry + z-index + TSX net, pure filesystem) and `architecture-breakpoints.test.ts` (reads the typed `breakpoints` export via the palette-sync dynamic-import shim; forward + reverse `@media`-set checks) — the split is forced by the typed-export load dependency; (2) elevation raw tokens use a readable stable-index registry (a multi-component shadow has no clean value-key); (3) **`--u-elevation-*`** naming (role, umbrella-aligned); (4) all else follows the established gate defaults (existing `--u-radius*` kept + repointed, no consolidation, no cosmetic renames). **Breakpoints are canonicalized, NOT consolidated** — no `@media` value is edited; zero-diff by inspection (the canonical set IS the 7 existing values), since the single-viewport harness cannot verify responsive widths; collapsing breakpoints is a separate future multi-viewport story.

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03, §1 two-tier token layer incl. the breakpoint-in-`@media` constraint and the typed `breakpoints` export, §6 CI guards, §7 package shape). Mirrors the accepted **ADR 0040** (color), **ADR 0041** (type), and **ADR 0042** (spacing): raw value-keyed Tier 1 behind thin semantic Tier-2 aliases, existing names kept and repointed (no rename, no cosmetic unification), no premature semantic role bundles, guards under `packages/ui/test/` copying `packages/trust/test/architecture.test.ts`, and the zero-diff D2 discipline that mints a token equal to the current resolved value rather than consolidating. The multi-value box-shadow case echoes ADR 0042's multi-value spacing-shorthand handling. Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job at `maxDiffPixelRatio: 0`, single viewport 1280×800, and the rule that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 6, bundling four small related axes). This ADR resolves the breakpoint-canonicalization mechanism, the typed-export contract, the `@media` guard design, the elevation-as-is decision, the radii/elevation/z-index naming for value sets that are not clean scales, the multi-value radius/shadow handling, the `--u-radius`/`--u-radius-lg` fold, and the guard scope. It does not relitigate 0038, 0039, 0040, 0041, or 0042.

## Context

This is the fourth axis migration of the design-system overhaul, bundling four small, related axes, radii, elevation (box-shadow), z-index, and breakpoints, into one story because each is small (a handful of distinct values, unlike the 200-plus type and 355 spacing sweeps) and the epic groups them as step 6. Three of the four (radii, elevation, z-index) repeat the now-established two-tier-token-plus-guard pattern exactly. The fourth (breakpoints) is the chief novelty: **CSS custom properties cannot be used inside `@media` queries**, so there is no `var()` sweep for it; the canonical values must instead be established as a typed TS export plus a documented allowed set the CSS `@media` literals must match, with a guard enforcing the match.

ADR 0038 §1 names all four axes (`--u-raw-radius-{sm,md,lg,pill}`, `--u-raw-elevation-{0,1,2}`, `--u-raw-z-{base,dropdown,sticky,modal,toast}`, `--u-raw-bp-{xs,sm,md,lg,xl}`) and states the breakpoint special case verbatim: "the canonical breakpoint values are ALSO exported as a typed TS constant `breakpoints` from `@unbnd/ui` for use in any JS-driven responsive logic and as the documented source the CSS `@media` values must match; a guard checks raw `@media` pixel values against the allowed set." ADR 0038 §6 names the guards: "No raw `@media` pixel values outside the allowed breakpoint set," plus (by extension of the §6 literal-guard pattern) raw radius, z-index, and box-shadow geometry outside the token layer.

### Acceptance criteria (quoted from the story)

- Radii, elevation, z-index tokens are two-tier: a raw tier of literal values and semantic aliases that reference the raw tier and never a literal; the app references the semantic tier.
- Every distinct in-use radius, box-shadow, and z-index value is migrated to a raw token preserving it exactly; no near-values consolidated; every resolved value byte-identical.
- `--u-radius` / `--u-radius-lg` are folded into the two-tier model; every `border-radius` references a radius token; the literal-duplicate cases (bare `8px` equal to `--u-radius`; the `var(--u-radius, 8px)` fallback) resolve to one source; no raw `border-radius` numeric literal remains outside the token layer.
- Each box-shadow becomes an elevation token preserving its exact geometry (offsets, blur, spread, `inset`) and its existing color-component token reference, byte-identical; multi-value and `inset` shadows handled; no raw `box-shadow` geometry literal remains outside the token layer.
- A typed `breakpoints` constant exports the canonical set (the distinct in-use `@media` values, as-is) for JS-driven responsive logic, and is the documented source the CSS `@media` values must match.
- Every app-CSS `@media` pixel value is a member of the canonical set; no `@media` fires at a different viewport than today.
- The new guard(s) find no raw `border-radius` / `box-shadow`-geometry / `z-index` literal outside the token layer, and no `@media` pixel outside the canonical set; the allowlist names only legitimate token-source files.
- The Story-40 color guards, Story-41 type guard, and Story-42 spacing guard stay green.
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` all pass.
- The Story-39 `visual` job is zero-diff against committed baselines; no baseline is updated.
- The breakpoint canonicalization is argued correct by inspection, not merely shown green against the single 1280×800 baseline; no responsive firing point changes.

### Verified current state (read directly against the `story-43-bp-radii-elevation-z` working tree, 2026-06-03)

The token sheet (`packages/ui/styles/tokens.css`) post-Story-42 carries the full two-tier color, type, and spacing tiers. Its non-tokenized entries relevant here are `--u-radius: 8px` and `--u-radius-lg: 12px` (single flat tokens, sitting outside the raw→semantic structure), plus `--page-max: 720px` / `--page-pad-x: 24px`. No elevation, z-index, or breakpoint tokens exist; no typed `breakpoints` export exists. `packages/ui/src/` holds `palette.ts`, `colors.ts`, `index.ts`; `packages/ui/test/` holds the five existing guards plus `tokens.test.ts`.

**Radii.** 94 `border-radius` declarations across app CSS. Distinct values (count = frequency), all confirmed:

| Value | Count | Notes |
|---|---|---|
| `var(--u-radius)` | 27 | existing token ref (=8px) |
| `8px` | 14 | bare literal **equal to `--u-radius`** (the literal-duplicate case) |
| `50%` | 8 | circular form (avatars, dots) |
| `10px` | 8 | |
| `7px` | 6 | |
| `6px` | 6 | |
| `12px` | 5 | bare literal **equal to `--u-radius-lg`** |
| `20px` | 4 | |
| `999px` | 3 | the pill form |
| `4px` | 3 | |
| `3px` | 3 | |
| `5px` | 2 | |
| `var(--u-radius-lg)` | 1 | existing token ref (=12px) |
| `var(--u-radius, 8px)` | 1 | `TagControl.css:132`, fallback **hardcodes 8px a second time** |
| `9px` | 1 | |
| `2px` | 1 | |
| `0 0 7px 7px` | 1 | `SearchBox.css:114`, the one multi-value corner shorthand (top-left/top-right `0`, bottom-right/bottom-left `7px`) |

So the distinct **literal** lengths in use are `2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 20` px (11 values), plus `50%` and `999px` (2 non-px forms), plus the components of the one corner shorthand (`0` and `7px`, both already covered). `8px` is duplicated three ways (bare `8px` ×14, `var(--u-radius)` ×27, `var(--u-radius, 8px)` ×1) and `12px` two ways (bare `12px` ×5, `var(--u-radius-lg)` ×1). No corner-specific longhands (`border-top-left-radius` etc.) exist. No `border-radius: 0` standalone (the only `0` is inside the corner shorthand). No `border-radius` literals appear in TSX (confirmed: zero `borderRadius` inline-style sites).

**Elevation (box-shadow).** 16 `box-shadow` declarations (the 17th `box-shadow` token in the source is `AuthMethodCard.css:13`, where `box-shadow` names a `transition` property, not a shadow declaration, the guard must not treat it as a shadow value). **15 distinct** values (one repeats). Every value is multi-value (offset-x, offset-y, blur, optional spread, color), and **the color component already reads a token** (`var(--u-ink-tint-*)`, `var(--u-amber-tint-*)`, `var(--u-parchment)`); only the geometry (offsets, blur, spread, `inset`) is literal. No multi-layer (comma-separated) shadows exist; no `box-shadow: none`. The distinct values:

```
0 0 0 3px var(--u-amber-tint-10)     (×2, focus ring)
inset 0 0 0 1px var(--u-amber-tint-30)   (the one inset)
0 6px 22px var(--u-ink-tint-13)
0 3px 12px var(--u-ink-tint-10)
0 1px 3px  var(--u-ink-tint-14)
0 1px 3px  var(--u-ink-tint-12)
0 1px 2px  var(--u-ink-tint-15)
0 1px 0    var(--u-ink-tint-04)
0 12px 32px var(--u-ink-tint-16)
0 10px 30px var(--u-ink-tint-16)
0 10px 26px var(--u-ink-tint-16)
0 0 0 3px var(--u-amber-tint-18)
0 0 0 3px var(--u-amber-tint-08)
0 0 0 3px var(--u-amber-tint-06)
0 0 0 2px var(--u-parchment)
```

No `box-shadow` literals appear in TSX (confirmed: zero `boxShadow` inline-style sites). These are conventional drop shadows, not the "parchment-on-parchment depth" ADR 0038 §1 frames; reconciling them with that principle changes geometry and is out of scope (a separate visual-change story).

**z-index.** Exactly 3 distinct values, each used once: `1` (`RatedByRow.css:36`, avatar-stack overlap), `40` (`SearchBox.css:68`, search dropdown), `50` (`AccountMenu.css:29`, account dropdown). No `z-index` literals in TSX (confirmed).

**Breakpoints.** 14 `@media` blocks across app CSS, **7 distinct pixel values**: `480` (×3), `540` (×4), `620` (×3), `700` (×1), `720` (×1), `860` (×1), `880` (×1). Every one is `(max-width: <n>px)`, no `min-width`, no range syntax (`(width >= …)`), no `prefers-*` / `hover` / `pointer` features anywhere. **No runtime breakpoint logic exists**: a repo-wide scan for `matchMedia`, `window.matchMedia`, `innerWidth`/`innerHeight`, and `max-width`/`min-width` in `.ts`/`.tsx` returns nothing. So the typed `breakpoints` export has **no current JS consumer**; it is established now as the canonical source for future JS-driven responsive logic and as the documented set the `@media` guard derives its allowed values from. (ADR 0038's broader audit sketched "16-plus" ad-hoc breakpoints; the count on `main` today is 7. The collapsing the audit floated is explicitly out of scope, see the two central constraints and Out of scope.)

**The two central zero-diff constraints (both load-bearing, from the story).**

- **Constraint 1, No consolidation.** Mint one token (or one canonical breakpoint member) per distinct in-use value. Do not snap `7px` and `8px` together, do not round a `6px`-blur shadow to `8px`, do not collapse `860`/`880` breakpoints. Any such change alters pixels or responsive behavior and is a separate, intentional visual-change story under the ADR 0039 discipline.
- **Constraint 2, The breakpoint blind spot.** The Story-39 `visual` harness captures a single viewport (1280×800, confirmed in `apps/web/playwright.config.ts`). At 1280px wide, **none** of the `max-width: ≤880px` rules fire, so the harness never renders the narrow viewports where the `@media` rules take effect. It therefore **cannot** prove the breakpoint refactor zero-diff. The protection for this axis is reasoning, not visual gating: each `@media` value must map to the identical canonical value, argued correct by inspection. A future multi-viewport baseline enhancement is worth recording as follow-up (see Consequences) but is not built here.

### Guard precedent

`packages/trust/test/architecture.test.ts` is the base pattern; the Story-42 `packages/ui/test/architecture-spacing-literals.test.ts` is the exact mirror this story's guards follow: `REPO = resolve(__dirname,"..","..","..")`; `SCAN_ROOTS = [apps/web/src, packages/ui]`; `ALLOWLIST` set of repo-relative paths; `SKIP_DIRS = {node_modules, dist, .git, engineering-team, e2e, data, test}`; a `walk()` collecting `.css/.ts/.tsx` excluding `.test.*`; per-property regexes capturing the value to the declaration terminator; a parenthesis-aware `splitComponents()` so `var(...)`/`calc(...)` are single atoms; TSX inline-style patterns matching numeric and quoted-string literals but never expressions; offenders aggregated into one `expect(offenders).toEqual([])`. `@unbnd/ui` runs `vitest run` under `pnpm -r test`, so new guards in `packages/ui/test/` need no wiring change. The Story-40 `architecture-palette-sync.test.ts` adds the precedent for a guard that reads a typed `@unbnd/ui` export behind a dynamic-import-against-a-typed-shim (so the guard typechecks before the module lands); the breakpoints-set guard reuses that exact shape to read the typed `breakpoints` export.

### Constraints that bind this design

- **Zero-diff is the prime directive.** Every resolved radius/shadow/z-index value stays identical; every `@media` fires at the identical viewport; the Story-39 `visual` job stays zero-diff; no baseline is updated (ADR 0039). No consolidation, no geometry redesign, no breakpoint collapse, no unit change.
- No new tooling. The guards are Vitest tests under the existing `pnpm -r test` (`CLAUDE.md`; ADR 0038 §6). The typed `breakpoints` export is plain TS in the existing `@unbnd/ui` package, which exports raw `./src/index.ts` with no build step (ADR 0038 §7).
- No AI-slop in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- These four axes only. Color (Story 40), type (Story 41), spacing (Story 42) are done; motion is epic story 7 (next). Non-radii/elevation/z-index/breakpoint token-sheet entries are left as-is.
- In-repo prior art governs; the Tapestry branch survey does not apply (ADR 0038; story "DList shapes touched: None").

## Options considered

The genuinely load-bearing decisions are (1) the **raw naming scheme** for value sets that are not clean ramps (radii, elevation, z-index), (2) **how box-shadows are tokenized** (whole-value vs composed, the multi-value/`inset` handling), and (3) the **breakpoint canonicalization mechanism** (the chief novelty: no `var()` in `@media`). Options are framed around those; the `--u-radius` fold and the guard scope then follow.

### Naming the raw tier (radii / elevation / z-index)

#### Option A, Ordinal / t-shirt scale, the shape ADR 0038 §1 sketches (`--u-raw-radius-{sm,md,lg,pill}`, `--u-raw-elevation-{0,1,2}`, `--u-raw-z-{base,dropdown,sticky,modal,toast}`)

- Pros: reads as a designed ladder; matches the umbrella's example names.
- Cons: **dishonest for the actual value sets and a zero-diff hazard.** The umbrella sketches assume tidy cardinalities (4 radii, 3 elevations, 5 z-index roles) that do not match `main`: there are **13 distinct radius values**, **15 distinct shadows**, and **3 z-index values**. Mapping 13 radii onto `{sm,md,lg,pill}` forces a consolidation the zero-diff rule forbids, or invents a dozen off-ramp names (`radius-sm`, `radius-sm2`, …) implying a ladder that does not exist. The 15 shadows have no natural `{0,1,2}` mapping without merging distinct geometries. This is the exact problem Stories 41 and 42 hit and resolved with value-keyed naming. Rejected for radii and elevation; **role naming is acceptable for z-index** (see below), where the 3 values genuinely have distinct stacking roles.

#### Option B, Value-keyed naming, one raw token per distinct value, keyed to the value itself (CHOSEN for radii and elevation)

Each distinct value becomes its own raw token whose name encodes the value, so the name cannot imply a consolidation that did not happen and every value stays individually addressable, exactly as ADR 0040 (`--u-raw-color-ink-a08` by alpha), ADR 0041 (`--u-raw-font-size-13` by px), and ADR 0042 (`--u-raw-space-8` by px) resolved the same problem:

- **radii:** `--u-raw-radius-<n>` where `<n>` is the px integer (`--u-raw-radius-8: 8px`); the two non-px forms get honest keyed names: `--u-raw-radius-circle: 50%` and `--u-raw-radius-pill: 999px` (the pill is `999px`, an effectively-infinite corner, a named off-ramp is honest here because `999px` is a sentinel, not a scale step).
- **elevation:** `--u-raw-elevation-<k>` where `<k>` distinguishes the 15 distinct shadows. The shadows do not form a clean 0/1/2 depth ladder; they are an ad-hoc set. A purely value-encoded key (e.g. `o0-b22-s0`) would be unreadable, so the chosen key is a short stable index plus a comment recording the exact geometry and the call site, matching the "literal registry, not a design vocabulary" framing of the raw tier (see Decision §2 for the exact list).

- Pros: **honest and zero-diff by construction.** The name carries the value (radii) or a stable registry index with the geometry in a comment (elevation), so no ordering or consolidation is implied. A value added later gets a new token named the same way, with no pressure to renumber an ordinal scale. Mirrors the three prior axis ADRs exactly.
- Cons: the names are less "designed" than `{sm,md,lg}`. Mitigated: the *semantic* Tier 2 is where readable role names live; the raw tier is deliberately a literal-keyed registry. A future rationalized radius/elevation scale (a separate visual-change story) can introduce a clean ordinal raw set then, because that story is *allowed* to move values.

#### Option C, Opaque sequential names (`--u-raw-radius-1 … -13`)

- Pros: stable count.
- Cons: opaque; a reader cannot tell `--u-raw-radius-7` from `--u-raw-radius-8` without the sheet, and inserting a value forces a renumber. Strictly worse than B for radii (where the value keys directly). Rejected for radii. (For elevation, where a multi-component geometry has no single number to key on, B's "index + geometry comment" is the pragmatic form of this and is chosen for elevation specifically.)

**Chosen: Option B for radii (value-keyed, with `circle`/`pill` off-ramps) and elevation (stable index + geometry comment); z-index uses role naming (Option A's shape, honest here).**

### Box-shadow tokenization: whole-value vs composed

#### Option D, Compose each shadow from per-component raw geometry tokens (a raw blur token, a raw offset token, …) assembled in the semantic alias

`box-shadow: var(--u-raw-shadow-oy-6) var(--u-raw-shadow-blur-22) … var(--u-ink-tint-13)`.

- Pros: maximal granularity; a blur value could be reused across shadows.
- Cons: **over-engineered and a zero-diff hazard.** Unlike spacing (where a single `8px` is genuinely reused as padding, margin, and gap, justifying per-value atoms), a box-shadow is a *composite* whose components are not independently reused, the offsets, blur, and spread of `0 6px 22px` are meaningful only together. Decomposing 15 shadows into ~40 geometry atoms and reassembling them multiplies the token count, makes each shadow's definition unreadable, and adds many hand-transcription chances to flip a value (a zero-diff risk on a refactor that must be invisible). The color component is *already* a `var()`; only the geometry is literal, and the geometry travels as a unit. Rejected.

#### Option E, One raw token holds the whole shadow value AS-IS (geometry + the already-`var()`-backed color), surfaced through a thin semantic elevation alias (CHOSEN)

Each distinct shadow becomes one raw token holding its complete value verbatim, the offsets, blur, optional spread, the `inset` keyword where present, and the existing `var(--u-*-tint-*)` / `var(--u-parchment)` color reference unchanged:

```css
--u-raw-elevation-1: 0 1px 3px var(--u-ink-tint-14);
--u-raw-elevation-focus-ring: 0 0 0 3px var(--u-amber-tint-10);
--u-raw-elevation-inset-hairline: inset 0 0 0 1px var(--u-amber-tint-30);
```

A thin semantic alias points at the raw (`--u-elevation-card: var(--u-raw-elevation-1)`), and each `box-shadow` declaration references the alias.

- Pros: **least churn, zero-diff by construction.** The whole value moves verbatim into one token; the resolved declaration is byte-identical because the geometry is unchanged and the color `var()` is preserved inside the token. A `var()` referencing a custom property whose value *contains another `var()`* resolves correctly (CSS substitution is recursive), so `--u-ink-tint-13` still resolves through the alias chain exactly as today. `inset` and the focus-ring forms (`0 0 0 Npx`) are just part of the stored value, no special mechanism needed. The token *is* the shadow, which matches how a shadow is authored and read. Mirrors ADR 0042's "keep the unit of authorship intact" reasoning (there, the shorthand was kept; here, the whole multi-value shadow is kept).
- Cons: a blur value common to two shadows is not deduplicated (e.g. the three `var(--u-ink-tint-16)` large shadows are three separate tokens). Accepted: that is the honest state (the three differ in offset/blur, `0 12px 32px`, `0 10px 30px`, `0 10px 26px`, so they are genuinely distinct shadows that happen to share a color tint; merging them would change geometry). The guard parses a `box-shadow` value and flags a *geometry literal*, accepting a single `var(--u-…)` reference (the token), which keeps the guard simple.

**Chosen: Option E (one raw token per whole shadow, thin semantic elevation alias).**

### Naming the axis: `--u-shadow-*` vs `--u-elevation-*`

ADR 0038 §1 uses `--u-raw-elevation-{0,1,2}` and frames the axis as "elevation." **Chosen: `--u-elevation-*` / `--u-raw-elevation-*`.** Reason: "elevation" names the *role* (how far a surface sits above the page), which is the semantic the design system reasons in and the umbrella already uses; "shadow" names the *implementation* (the CSS property). Naming the token by role matches the rest of the Tier-2 vocabulary (`--u-surface-*`, `--u-border`, `--u-signal-*` name roles, not properties) and keeps the door open for a future re-skin to express elevation differently (the parchment-depth principle) without renaming the token. The raw tier keeps `--u-raw-elevation-*` per the umbrella. (This story tokenizes the existing drop shadows verbatim; the parchment-depth *redesign* is a separate visual-change story, but the token *name* is already future-aligned.)

### Breakpoint canonicalization mechanism (the chief novelty)

The breakpoint axis has no `var()` sweep: `@media (max-width: var(--u-bp-md))` is invalid CSS, custom properties cannot be used in `@media` feature queries. So "canonical" cannot mean "every `@media` references one token." It must mean: the distinct in-use values are established as a named set in **one TS source of truth**, the `@media` literals are documented to match that set value-for-value, and a guard enforces that no `@media` pixel falls outside the set. The decision is *how* to establish that single source and *what* the guard derives its allowed set from.

#### Option F, A standalone documented list (a comment block, or a sibling JSON) the guard reads; no typed export

- Pros: simplest; no TS module.
- Cons: **violates ADR 0038 §1**, which mandates a typed `breakpoints` TS constant exported from `@unbnd/ui` for JS-driven responsive logic. A comment is not consumable by JS and drifts silently. Rejected.

#### Option G, A typed `breakpoints` const object in `packages/ui/src/breakpoints.ts`, re-exported from `index.ts`, as the single source; the guard derives the allowed `@media` set from that same export (CHOSEN)

`packages/ui/src/breakpoints.ts` exports a `const` object with literal types, the canonical set, value-for-value the 7 distinct in-use values, named honestly:

```ts
// packages/ui/src/breakpoints.ts, the single source of truth for Unbnd's
// responsive breakpoints. CSS custom properties cannot be used inside @media
// queries (ADR 0038 §1), so the canonical pixel values live here as a typed TS
// constant: (1) any JS-driven responsive logic (matchMedia, a useMediaQuery
// hook) reads these instead of hardcoding a pixel; (2) the @media guard derives
// its allowed pixel set from these values, so the CSS @media literals and the
// JS source can never drift. Values are the distinct in-use @media max-width
// values on main, preserved EXACTLY (ADR 0043, no consolidation). Keys are
// value-keyed (the px integer) so no clean-ladder ordering is implied, the set
// is not a designed ramp, it is the honest registry of values actually in use.
export const breakpoints = {
  bp480: 480,
  bp540: 540,
  bp620: 620,
  bp700: 700,
  bp720: 720,
  bp860: 860,
  bp880: 880,
} as const;

export type Breakpoint = keyof typeof breakpoints;
```

- Pros: **satisfies ADR 0038 §1 exactly** (one typed export, JS-consumable, the documented match-source). One source of truth: the guard reads `breakpoints` (via the palette-sync guard's dynamic-import-against-a-typed-shim pattern, so it typechecks and runs against real values when the module lands) and asserts every app-CSS `@media` pixel is a member of `Object.values(breakpoints)`, and (the reverse check) every member appears in at least one `@media` so the set stays honest (no dead canonical values). Because the allowed set is *derived from the export*, the export and the CSS cannot drift, adding a CSS `@media` at a new pixel fails the guard until the value is added to `breakpoints`; adding a `breakpoints` member with no `@media` consumer fails the reverse check. Plain TS, no build step, no new tooling. Value-keyed names (`bp480`) mirror the value-keyed raw-token convention of the three prior axes and avoid implying a `{xs,sm,md,lg,xl}` ladder that the 7 unequal values do not form. No current JS consumer exists, so nothing is wired today; the export is the forward-looking canonical source.
- Cons: the umbrella sketched `{xs,sm,md,lg,xl}` (5 names) but there are 7 distinct values; the value-keyed names depart from that sketch. Accepted and consistent with how Stories 41/42 departed from the umbrella's ordinal sketches for the same honest-registry reason. The CSS `@media` still carries a literal pixel (it must, `var()` is illegal there); the guard, not a `var()` substitution, is what binds it to the source. This is the inherent shape of the breakpoint axis and the reason it gets a guard rather than a sweep.

#### Whether to also mint `--u-raw-bp-*` CSS tokens

ADR 0038 §1 lists `--u-raw-bp-{xs,sm,md,lg,xl}` in the raw tier. **Decision: do NOT mint `--u-raw-bp-*` CSS custom properties.** They cannot be used in `@media` (the only place a breakpoint is consumed in CSS), so they would be dead CSS whose only conceivable reader is documentation, and the typed `breakpoints` export already is that documentation, in a consumable form. Minting CSS tokens that no rule can reference is exactly the "dead CSS" anti-pattern ADR 0040 rejected for the genre `ink`/`coverTo` values (whose only consumer was JS, so they lived in TS, not CSS). The canonical breakpoint source is the typed export alone; the CSS `@media` literals are bound to it by the guard. (If a future container-query or JS-set-CSS-variable use ever needs a breakpoint as a CSS custom property, that is a separate, motivated addition.)

**Chosen: Option G (typed `breakpoints` export in `packages/ui/src/breakpoints.ts`, re-exported from `index.ts`, as the single source; the `@media` guard derives its allowed set from it; no `--u-raw-bp-*` CSS tokens).**

### The `--u-radius` / `--u-radius-lg` fold

Mirroring the Story-40/41/42 gate decisions (keep `--signal-*`/`--genre-*`, `--font-sans`/`--font-mono`, `--page-pad-x` as-is, repointed to raw; no rename, no cosmetic `--u-` unification, no deprecated aliases, no half-migrated state): **keep `--u-radius` and `--u-radius-lg` as Tier-2 semantic names, repointed to the new raw tier** (`--u-radius: var(--u-raw-radius-8)`, `--u-radius-lg: var(--u-raw-radius-12)`). The 27 `var(--u-radius)` and 1 `var(--u-radius-lg)` call sites resolve unchanged (zero churn, zero diff). Renaming them to `--u-radius-control` etc. would either churn 28 call sites or leave a half-migrated alias state, the exact anti-pattern the three prior gates rejected. (The umbrella's `--u-radius-control` example name is a *role* alias the design system may add later when roles are designed; this story keeps the existing names and defers role aliases, exactly as type bundles and spacing role tokens were deferred.) The literal-duplicate cases resolve to one source: the 14 bare `8px` become `var(--u-radius)` (or the value-keyed `--u-radius-8` alias, see §1; either resolves to the one `--u-raw-radius-8`), the 5 bare `12px` become `var(--u-radius-lg)`, and the `var(--u-radius, 8px)` fallback in `TagControl.css:132` drops its hardcoded `8px` fallback (it is dead, `--u-radius` is defined, and removing it kills the second hardcode), becoming a plain `var(--u-radius)`.

## Decision

We choose **Option B** (value-keyed raw radii with `circle`/`pill` off-ramps; stable-index raw elevation with geometry comments) and **role naming for z-index**; **Option E** (one raw token per whole box-shadow, thin semantic elevation alias, `--u-elevation-*` naming); and **Option G** (typed `breakpoints` export as the single source, `@media` guard derives its allowed set from it, no `--u-raw-bp-*` CSS tokens). `--u-radius`/`--u-radius-lg` are kept and repointed (no rename). Together these deliver the two-tier model for radii, elevation, and z-index and canonicalize the breakpoints, holding every resolved value and every responsive firing point byte-identical.

### 1. Radii, two-tier taxonomy

**Tier 1, raw radius tokens.** Literal values only, one per distinct in-use value, units as authored:

```css
--u-raw-radius-2: 2px;   --u-raw-radius-3: 3px;   --u-raw-radius-4: 4px;
--u-raw-radius-5: 5px;   --u-raw-radius-6: 6px;   --u-raw-radius-7: 7px;
--u-raw-radius-8: 8px;   --u-raw-radius-9: 9px;   --u-raw-radius-10: 10px;
--u-raw-radius-12: 12px; --u-raw-radius-20: 20px;
--u-raw-radius-circle: 50%;    /* circular form (avatars, dots) */
--u-raw-radius-pill: 999px;    /* effectively-infinite pill corner */
```

13 raw radius tokens (11 px + circle + pill). No corner shorthand needs its own token: its components are `0` (value-stable, left bare) and `7px` (already `--u-raw-radius-7`).

**Tier 2, semantic aliases.** Point at Tier 1, never a literal. App CSS references only Tier 2. The conservative default, mirroring the three prior axes, is a thin value-keyed alias per value:

```css
--u-radius-2: var(--u-raw-radius-2);  …  --u-radius-20: var(--u-raw-radius-20);
--u-radius-circle: var(--u-raw-radius-circle);
--u-radius-pill: var(--u-raw-radius-pill);
```

**The existing `--u-radius` / `--u-radius-lg` are kept as Tier-2 names and repointed** (`--u-radius: var(--u-raw-radius-8)`, `--u-radius-lg: var(--u-raw-radius-12)`), so the 28 existing call sites resolve unchanged. The 14 bare `8px` declarations may migrate to either `var(--u-radius)` (the established role name) or `var(--u-radius-8)` (the value-keyed alias); both resolve to the one `--u-raw-radius-8`, so either is zero-diff, the Implementer should prefer `var(--u-radius)` for the 8px case (it is the existing, widely-used role name; consolidating the bare literals onto it resolves the duplicate to one source most cleanly) and `var(--u-radius-lg)` for the 12px case. Richer role aliases (`--u-radius-control`, `--u-radius-card`) are deferred to a later intentional story that designs the roles (Out of scope).

**Multi-value corner shorthand.** `SearchBox.css:114` `border-radius: 0 0 7px 7px` keeps the shorthand; each non-zero length component swaps for its alias and `0` stays bare (exactly the ADR 0042 §3 multi-value rule): `border-radius: 0 0 var(--u-radius-7) var(--u-radius-7)`. Byte-identical resolved value.

### 2. Elevation (box-shadow), two-tier taxonomy, tokenized AS-IS

**Tier 1, raw elevation tokens.** One token per distinct shadow, the whole value verbatim (geometry + the already-`var()`-backed color), `inset` preserved, color `var()` preserved. The set (15 tokens), each with a comment recording its geometry and a representative call site:

```css
/* Drop shadows (offset-y / blur / optional spread; color is an existing tint var) */
--u-raw-elevation-hairline:   0 1px 0 var(--u-ink-tint-04);     /* 1px bottom hairline */
--u-raw-elevation-1a:         0 1px 2px var(--u-ink-tint-15);
--u-raw-elevation-1b:         0 1px 3px var(--u-ink-tint-12);
--u-raw-elevation-1c:         0 1px 3px var(--u-ink-tint-14);
--u-raw-elevation-2:          0 3px 12px var(--u-ink-tint-10);
--u-raw-elevation-3:          0 6px 22px var(--u-ink-tint-13);
--u-raw-elevation-4a:         0 10px 26px var(--u-ink-tint-16);
--u-raw-elevation-4b:         0 10px 30px var(--u-ink-tint-16);
--u-raw-elevation-4c:         0 12px 32px var(--u-ink-tint-16);
/* Focus rings (0 0 0 spread; amber tint) */
--u-raw-elevation-ring-06:    0 0 0 3px var(--u-amber-tint-06);
--u-raw-elevation-ring-08:    0 0 0 3px var(--u-amber-tint-08);
--u-raw-elevation-ring-10:    0 0 0 3px var(--u-amber-tint-10);
--u-raw-elevation-ring-18:    0 0 0 3px var(--u-amber-tint-18);
--u-raw-elevation-ring-parchment: 0 0 0 2px var(--u-parchment);  /* 2px parchment ring */
/* Inset */
--u-raw-elevation-inset-hairline: inset 0 0 0 1px var(--u-amber-tint-30);
```

The names are a stable readable registry (`hairline`, `1a/1b/1c` for the three near-identical 1px-blur shadows that differ only in tint, `2/3/4a/4b/4c` for the deepening drop shadows, `ring-*` for the focus rings keyed by amber-tint alpha, `inset-hairline` for the one inset). They imply no clean depth ladder; the comment carries the exact geometry. (The exact name spellings are the Implementer's to finalize against the real call sites; the contract is one token per distinct shadow, value verbatim, the geometry recorded.)

**Tier 2, semantic elevation aliases.** Thin aliases by role where one is unambiguous, else value-keyed, pointing at Tier 1:

```css
--u-elevation-focus-ring: var(--u-raw-elevation-ring-10);   /* the ×2 focus ring */
--u-elevation-card: var(--u-raw-elevation-2);
…
```

App CSS references only Tier 2. The `var()` inside the stored shadow value resolves through the alias chain unchanged (CSS substitution is recursive), so every resolved declaration is byte-identical. **No geometry is redesigned**, the existing drop shadows are tokenized verbatim; the parchment-depth principle is a separate visual-change story (Out of scope).

### 3. z-index, small role scale

3 distinct values, each with a distinct stacking role, so role naming (the umbrella's shape) is honest here:

**Tier 1, raw:**
```css
--u-raw-z-base: 1;        /* in-flow stack (avatar overlap) */
--u-raw-z-dropdown: 40;   /* search dropdown */
--u-raw-z-popover: 50;    /* account menu */
```

**Tier 2, semantic aliases** point at the raws (`--u-z-base: var(--u-raw-z-base)`, `--u-z-dropdown`, `--u-z-popover`); the 3 call sites reference Tier 2. The umbrella's `{base,dropdown,sticky,modal,toast}` sketch listed 5 roles; only 3 values exist, so only 3 are minted (no speculative steps, the "values in use today" rule). Resolved values byte-identical.

### 4. Breakpoints, canonical typed source + `@media` guard (no `var()` sweep, no consolidation)

The 7 distinct in-use `@media` values are established as the canonical set in **one TS source**, `packages/ui/src/breakpoints.ts`, exported as the typed `breakpoints` const (shape in Option G), re-exported from `packages/ui/src/index.ts`. No `--u-raw-bp-*` CSS tokens are minted (they would be dead CSS, `var()` is illegal in `@media`). The CSS `@media` literals are **left as-is value-for-value** (each still reads e.g. `@media (max-width: 540px)`); they are not swept to `var()` (impossible) and not collapsed (forbidden). The binding between the CSS literals and the typed source is the **guard** (§5), which derives its allowed set from `breakpoints` and flags any `@media` pixel outside it.

**No runtime breakpoint logic exists today** (verified: zero `matchMedia`/`innerWidth`/`min-width`/`max-width` in any `.ts`/`.tsx`), so there is nothing to wire to the export now. The export is established as the canonical source for future JS-driven responsive logic; the ADR records that the first such consumer must read `breakpoints` rather than hardcode a pixel (the guard's `.ts/.tsx` scan, §5, enforces that going forward).

**Zero-diff argued by inspection (Constraint 2).** The Story-39 harness renders only 1280×800, where none of the `max-width: ≤880px` rules fire, so it cannot prove this axis. The argument that the breakpoint refactor is behavior-preserving is therefore made by inspection, not by the gate:

1. This story **adds** a TS constant and a guard. It does **not** edit any `@media` query's pixel value. Every `@media (max-width: Npx)` block keeps its exact `N`. (The Implementer's only CSS change for this axis is none, or at most whitespace; the guard simply asserts the existing values are in the canonical set.)
2. The canonical set is, by construction, exactly the 7 distinct values already in the CSS (`{480,540,620,700,720,860,880}`). So every `@media` value is trivially a member; no value is added, removed, rounded, or merged.
3. Therefore no `@media` query fires at a different viewport than today; responsive behavior at every narrow viewport is unchanged by inspection, independent of the single-viewport gate.

This is the "canonicalize, do not consolidate" outcome: the values are established as a named set in one place and locked by the guard, while every firing point is preserved exactly. Collapsing the set (e.g. merging `860`/`880`) is explicitly a separate intentional story that must first add multi-viewport baselines (Consequences / Out of scope).

### 5. The CI guard(s)

**Decision: one combined guard file, `packages/ui/test/architecture-shape-literals.test.ts`, for the three CSS-literal axes (radius / box-shadow geometry / z-index) plus the `@media`-set check; the `breakpoints` typed-export equality lives in the same file's set-derivation (no separate sync file is needed because there is no CSS↔TS *value* mirror to assert, the export IS the source, and the guard derives the allowed set from it rather than asserting two copies are equal).** Combining is justified: the three CSS-literal axes share the identical scan machinery (the spacing guard's `walk`/`SKIP_DIRS`/`splitComponents`/per-property regex), and bundling them matches the story's "four small related axes at once" framing; separate files would triplicate the boilerplate for a few-dozen-value scan. The `@media` check rides in the same file because it scans the same CSS files in the same walk.

One caveat drives a **second small file**: the `@media`-set check must read the typed `breakpoints` export, which (like the palette-sync guard's modules) does not exist before the Implementer lands it. To keep the pure-filesystem radius/shadow/z-index/`@media`-literal scans from being taken down by the not-yet-present module's load failure, the **`breakpoints`-derived allowed-set assertion goes in its own file, `packages/ui/test/architecture-breakpoints.test.ts`**, using the Story-40 palette-sync pattern (dynamic-import-against-a-typed-shim so it typechecks pre-Implementer and runs against the real export once it lands). So: **two files**, `architecture-shape-literals.test.ts` (radius + box-shadow geometry + z-index literal scans, pure filesystem, no `@unbnd/ui`-source dependency) and `architecture-breakpoints.test.ts` (the `@media` pixel set checked against the typed `breakpoints` export). Both mirror `architecture-spacing-literals.test.ts` structure and run under the existing `pnpm -r test`.

**`architecture-shape-literals.test.ts`, scope and patterns.** Scans `.css` under `apps/web/src` and `packages/ui` (the allowlisted token sheet is scanned so the exemption is explicit), plus `.ts/.tsx` for the forward TSX regression net. Reuses the spacing guard's parenthesis-aware `splitComponents()` and value machinery.

- **`border-radius` (CSS):** match `border-radius` (and the corner longhands `border-(top|bottom)-(left|right)-radius`, included so a future one is caught though none exist now); tokenize the value into components; an offender is any component that is a bare length literal (`Npx`) or a bare `50%`/`999px`-style literal that is not `var(...)`, `calc(...)`, a zero, or a keyword. (So `0 0 var(--u-radius-7) var(--u-radius-7)` passes; `0 0 7px 7px` is an offender.)
- **`box-shadow` (CSS):** match `box-shadow:` declarations **only**, critically, the regex keys on `box-shadow` followed by `:` and a value, so `AuthMethodCard.css:13`'s `box-shadow 120ms ease` (a `transition` *property name*, no colon after `box-shadow`) is **not** matched. An offender is a `box-shadow` value containing any **geometry literal**, a bare length (`Npx`, an unitless offset `0`/`3`, etc. in offset/blur/spread position), i.e. a value that is not a single `var(--…)` reference (the token), `none`, `inherit`/`initial`/`unset`. Mechanically: after stripping the leading `inset` keyword (allowed) and the trailing color `var(--…)`, if any remaining component is a bare number/length, it is an offender. The clean post-sweep form `box-shadow: var(--u-elevation-card)` has a single `var()` component → passes; `box-shadow: 0 1px 3px var(--u-ink-tint-14)` has bare `0`/`1px`/`3px` geometry → offender. (Comma-separated multi-layer shadows do not exist today; if one appears, the per-layer same check applies, the guard splits on top-level commas first.)
- **`z-index` (CSS):** match `z-index:`; an offender is a bare integer literal (not `var(...)`, not `auto`/`inherit`/`initial`/`unset`). `z-index: var(--u-z-dropdown)` passes; `z-index: 40` is an offender.
- **TSX forward regression net:** inline-style keys `borderRadius`, `boxShadow`, `zIndex` assigned a numeric or quoted-string literal are offenders (never an expression, mirroring the type/spacing guards, so a computed value is not flagged). Green on landing (no such literals exist today) and red on any future inline literal.

Allowlist (names ONLY the legitimate token-source file): `packages/ui/styles/tokens.css`. `apps/web/src/data`, `apps/web/e2e`, and `packages/ui/test` are scope-excluded via `SKIP_DIRS`, consistent with the prior guards.

**`architecture-breakpoints.test.ts`, the `@media` set check.** Loads the typed `breakpoints` export (dynamic-import-against-a-typed-shim, the palette-sync pattern) and computes `ALLOWED = new Set(Object.values(breakpoints))`. Scans every `.css` under `apps/web/src` for `@media` blocks. Parses each `@media` *prelude* (the text between `@media` and `{`) for pixel values in the feature queries it must handle: `min-width`/`max-width`/`min-height`/`max-height` colon forms **and** the modern range forms (`(width >= Npx)`, `(Npx <= width <= Npx)`), so a future range-syntax breakpoint is also caught (today only `max-width` colon form exists). It ignores non-length features (`prefers-*`, `hover`, `pointer`, `orientation`). Two assertions:

1. **Forward (the AC):** every pixel value extracted from an app-CSS `@media` is a member of `ALLOWED`; any out-of-set pixel is an offender (reported with file, line, and the offending `@media` prelude). This catches a stray new breakpoint without flagging the legitimate canonical ones.
2. **Reverse (keeps the set honest):** every member of `breakpoints` appears in at least one app-CSS `@media`; a canonical value with no consumer is flagged, so dead canonical values cannot accumulate.

It also extends the **TSX forward net**: a `matchMedia`/`window.innerWidth`/`window.innerHeight` comparison against a hardcoded pixel literal in `.ts/.tsx` is an offender (future JS responsive logic must read `breakpoints`). None exists today, so green on landing. Allowlist: `packages/ui/src/breakpoints.ts` (the typed source), and the guard does not flag `breakpoints.ts`'s own literals because they ARE the canonical set.

**Green on landing, red on regression.** The radius/shadow/z-index sweep removes every literal from app CSS first; the breakpoint values are already in the CSS and become the canonical set; both guards are green the moment they land and red forever after on any new shape literal, out-of-set `@media`, or hardcoded breakpoint in JS, exactly as ADR 0038 §6 requires. The Story-40 color guards, Story-41 type guard, and Story-42 spacing guard are untouched and stay green; this story only adds two files under `packages/ui/test/`.

## Consequences

- **Enables** a future radius/elevation/depth change as a Tier-2-to-raw remap with no app-CSS change, a future `[data-theme]` skin's overrides for these axes, and JS-driven responsive logic that reads one typed `breakpoints` source. Completes four of the token axes (color, type, spacing, radii/elevation/z-index) plus the canonical breakpoint source; only motion (epic story 7) remains among the token axes.
- **Constrains** all future radius/shadow/z-index work to go through Tier-2 tokens (CSS), all future breakpoints to be members of `breakpoints` (CSS `@media` and JS alike), enforced by the two guards, real, not advisory.
- **New debt / follow-ups:** (1) richer semantic role aliases for radii (`--u-radius-control`/`-card`) and elevation, and a fuller z-index role scale, are deferred to a later intentional story that designs the roles; (2) a genuinely rationalized radius/elevation scale (snapping near radii, a clean depth ladder) is a separate visual-change story under ADR 0039; (3) **redesigning elevation onto the parchment-depth principle** (ADR 0038 §1) is a separate visual-change story, this story tokenizes the existing drop shadows verbatim; (4) **collapsing the breakpoints** onto a smaller ramp is a separate intentional story that must **first add multi-viewport visual baselines** so a real gate exists for the narrow viewports the current single-viewport harness cannot see; (5) **a multi-viewport visual-baseline enhancement to the Story-39 harness** is worth recording as future work so any later breakpoint-consolidation story has a real gate, not built here; (6) the value-keyed raw names (radii) and stable-index names (elevation) are literal registries by design, a future rationalized scale may introduce ordinal names then.
- **Affects existing fixtures?** No. No data fixtures change. The migration repoints CSS literals to tokens with byte-identical resolved values; no TSX is touched (no inline radius/shadow/z-index/breakpoint literals exist). The Story-39 `visual` job confirms zero-diff at the gated viewport; the breakpoint axis is argued zero-diff by inspection (it edits no `@media` value).
- **New dependency?** No. `breakpoints.ts` is a new TS module inside the existing `@unbnd/ui` package; the two guards are new Vitest tests in the existing `packages/ui/test/`. No new third-party dependency, no new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes. Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors for the Implementer (Architect is read-only on source; these are the targets, not edits made here):

- **Token sheet:** `packages/ui/styles/tokens.css`, add three new clearly-commented blocks after the spacing Tier-2 block and before the `--page-*` layout tokens: (a) **radii** Tier-1 `--u-raw-radius-{2,3,4,5,6,7,8,9,10,12,20,circle,pill}` + Tier-2 thin aliases `--u-radius-{…}`, and **move** the existing `--u-radius: 8px` / `--u-radius-lg: 12px` (currently lines 215-216) into the Tier-2 block repointed as `--u-radius: var(--u-raw-radius-8)` / `--u-radius-lg: var(--u-raw-radius-12)` (keep the names; do not delete the old lines, repoint them); (b) **elevation** Tier-1 `--u-raw-elevation-*` (15 whole-shadow tokens, §2, each geometry preserved verbatim with the existing color `var()` and a geometry comment) + Tier-2 `--u-elevation-*` aliases; (c) **z-index** Tier-1 `--u-raw-z-{base,dropdown,popover}` + Tier-2 `--u-z-*` aliases. Leave all color, type, spacing, and `--page-*` tokens exactly as they are.
- **Breakpoint source:** new `packages/ui/src/breakpoints.ts` exporting the typed `breakpoints` const (§4 / Option G) and the `Breakpoint` type; re-export both from `packages/ui/src/index.ts` (`export { breakpoints } from "./breakpoints"; export type { Breakpoint } from "./breakpoints";`). Do **not** mint `--u-raw-bp-*` CSS tokens.
- **App CSS radius sweep:** across `apps/web/src/**/*.css`, replace every bare `border-radius` length literal with the matching Tier-2 alias, the 14 bare `8px` → `var(--u-radius)`, the 5 bare `12px` → `var(--u-radius-lg)`, and `7px`/`6px`/`10px`/`20px`/`4px`/`3px`/`5px`/`9px`/`2px` → `var(--u-radius-<n>)`, `50%` → `var(--u-radius-circle)`, `999px` → `var(--u-radius-pill)`. `TagControl.css:132` `var(--u-radius, 8px)` → `var(--u-radius)` (drop the dead hardcoded fallback). `SearchBox.css:114` `border-radius: 0 0 7px 7px` → `border-radius: 0 0 var(--u-radius-7) var(--u-radius-7)` (keep shorthand, `0` stays bare).
- **App CSS box-shadow sweep:** replace each `box-shadow:` declaration's whole value with the matching `var(--u-elevation-*)` Tier-2 alias (the 14 distinct + the ×2 focus ring across the 16 sites in `SearchBox/BookCard/AuthForm/BookHeader/Hero/RatingsPanel/AccountMenu/PoVBar/AuthMethodCard/Pill/AuthShell/ToggleSwitch/Submit/RatedByRow`). Do **not** touch `AuthMethodCard.css:13`'s `box-shadow` inside the `transition` list (it names a property, not a shadow value).
- **App CSS z-index sweep:** `SearchBox.css:68` `z-index: 40` → `var(--u-z-dropdown)`; `AccountMenu.css:29` `z-index: 50` → `var(--u-z-popover)`; `RatedByRow.css:36` `z-index: 1` → `var(--u-z-base)`.
- **Breakpoints:** **no `@media` edits.** The 7 distinct `@media (max-width: …)` values stay exactly as authored; the canonical set is established in `breakpoints.ts` and the guard binds them. (No runtime breakpoint logic exists to rewire.)
- **Guards:** `packages/ui/test/architecture-shape-literals.test.ts` (radius + box-shadow geometry + z-index CSS literal scans + TSX regression net), copying `architecture-spacing-literals.test.ts` structure (`REPO`, `SCAN_ROOTS`, `walk()` over `.css/.ts/.tsx`, `SKIP_DIRS`, `splitComponents`, single aggregated `expect`); `ALLOWLIST = {packages/ui/styles/tokens.css}`. And `packages/ui/test/architecture-breakpoints.test.ts` (the `@media` pixel set checked against the typed `breakpoints` export via the palette-sync dynamic-import-shim pattern; forward + reverse assertions + TSX `matchMedia`/`innerWidth`-literal net); `ALLOWLIST = {packages/ui/src/breakpoints.ts}`. Both run under the existing `pnpm -r test`. (Test Design phase fixes the exact patterns; this names the contract.)
- **Verification gate:** after the sweep, `pnpm -r typecheck` (incl. the new typed `breakpoints` export), `pnpm -r test` (both new guards + all prior guards + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job must all pass, the last zero-diff with **no baseline update**. The breakpoint axis is additionally reviewed by inspection (each `@media` value maps to the identical canonical value; no firing point changes).

## Out of scope

- **Consolidation / rationalization of any axis.** Every distinct in-use radius, shadow, z-index, and breakpoint value is preserved exactly; no near-radii snapped, no shadow geometry rounded, no z-index layers collapsed, no near-breakpoints merged. A rationalized scale for any axis is a separate, intentional visual-change story under ADR 0039. **First central constraint.**
- **Collapsing the breakpoints.** A responsive *behavior* change the single-viewport harness cannot prove; deferred to a separate intentional story that establishes multi-viewport baselines first. This story canonicalizes the existing 7 values as-is. **Second central constraint.**
- **Redesigning elevation onto the parchment-depth principle** (ADR 0038 §1). The shadows on `main` are conventional drop shadows; reconciling them changes geometry and pixels. Tokenized verbatim here; the redesign is a visual-change story.
- **`--u-raw-bp-*` CSS tokens.** Not minted, unusable in `@media`, so dead CSS. The typed `breakpoints` export is the sole canonical source.
- **Richer semantic role tokens** for radii (`--u-radius-control`/`-card`), elevation, and a fuller z-index scale. Deferred to a later intentional story that designs the roles; mapping the values onto role names now risks merging distinct values (zero-diff hazard), the same trap deferred for type bundles (0041) and spacing roles (0042).
- **A multi-viewport visual baseline** for the Story-39 harness. Recorded as future work so a later breakpoint-consolidation story has a real gate; not built here.
- **Any other token axis:** color (done, Story 40), type (done, Story 41), spacing (done, Story 42), motion, durations/easings (epic story 7, next). Non-radii/elevation/z-index/breakpoint token-sheet entries are left exactly as they are.
- **Cosmetic `--u-` renames.** `--u-radius`/`--u-radius-lg` are kept and repointed (no rename, no deprecated aliases, no half-migrated state), consistent with the Story-40/41/42 gate decisions for `--signal-*`/`--genre-*`, `--font-sans`/`--font-mono`, `--page-pad-x`.
- **Primitives, the icon registry / `<Icon>` abstraction, the motion layer, and layout primitives** (later epic stories). The guard allowlist names only the token sheet and `breakpoints.ts`; later stories add their own source files per ADR 0038 §6.
- **Authoring a dark theme or any second skin** (ADR 0038; epic story 13). The two-tier structure must admit one; building one is later work.
- **Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui`** and citing the new guards (epic story 14).
- Any behavior, copy, or information-architecture change. The only visible change permitted is none, proven zero-diff against the Story-39 harness at the gated viewport and argued zero-diff by inspection for the breakpoint axis.
