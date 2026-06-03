# ADR 0042: Two-tier spacing tokens (padding / margin / gap), multi-value shorthand handling, and the spacing CI guard

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/42-spacing-tokens.md`

**Approved 2026-06-03** at the architecture gate. Gate resolutions (all the recommended defaults, consistent with ADR 0040/0041): (1) **thin per-value semantic aliases** `--u-space-<n>` now; richer inset/stack/inline role tokens DEFERRED to a later intentional story; (2) **`--page-pad-x` left as-is** (no rename; optional internal repoint allowed); (3) **positioning offsets `top`/`right`/`bottom`/`left`/`inset` are OUT of scope** (positioning, not box spacing; contaminated with `%`/`calc`); (4) **bare `0` left bare** (value-stable; not tokenized). Multi-value shorthands keep the shorthand with each length component swapped to `var(--u-space-…)`; `auto`/keywords untouched; negative `-8px` → `--u-raw-space-n8`; no unit conversion.

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03, §1 two-tier token layer, §6 CI guards, §7 package shape). Mirrors the accepted **ADR 0040** (color axis) and **ADR 0041** (type axis): raw value-keyed Tier 1 behind thin per-property Tier-2 aliases, the existing names kept and repointed, no premature semantic bundles, a guard under `packages/ui/test/` copying `packages/trust/test/architecture.test.ts`, and the zero-diff D2 discipline that mints a token equal to the current rendered value rather than consolidating. Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job at `maxDiffPixelRatio: 0`, and the rule that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 5, the spacing axis, sequenced last in the lowest-entanglement-first order, color → type → spacing). This ADR resolves the raw-naming, semantic-tier, multi-value-shorthand, zero/units/negative/keyword, property-scope, page-frame, runtime-injection, and guard-scope open questions the story carries. It does not relitigate 0038, 0039, 0040, or 0041.

## Context

The spacing axis is the third and last axis migration of the design-system overhaul. The umbrella (ADR 0038 §1) sets the target: a two-tier token layer in `@unbnd/ui` where Tier 1 is a raw scale of literal spacing values and Tier 2 is semantic aliases that point at Tier 1 and never at a literal; app CSS references only Tier 2. ADR 0038 §1 sketches `--u-raw-space-1 … -12` on a single scale "the 355 hardcoded values collapse onto this" and §6 names the guard: "No raw spacing (`padding`/`margin`/`gap` numeric literals) outside the token layer and layout primitives." The hard constraint from the user and orchestrator is that this story is a refactor and must be **zero-diff**: every resolved spacing value stays byte-identical, the Story-39 `visual` job is zero-diff against committed baselines, and **no baseline is updated**. The word "collapse" in the umbrella sketch is the sketch's word, not a license to consolidate: the story's central constraint forbids snapping near-values together, so the actual mechanic is one raw token per distinct in-use value, exactly as Stories 40 and 41 resolved the same wording for color and type.

Spacing differs from color and type in one mechanically decisive way the story calls out: `padding` and `margin` are **shorthands that pack one to four values into a single declaration** (`padding: 8px 12px`, `margin: 0 auto 16px`, `padding: 8px 12px 8px 34px`), and those components mix length literals with keywords (`auto`) and the bare `0`. The single-value type and color sweeps had no analogue. The multi-value handling and the keyword/`0`/negative rules are the new design calls; the rest mirrors 0041.

### Acceptance criteria (quoted from the story)

- Spacing tokens are two-tier: a raw spacing scale of literal values (per ADR 0038 §1 Tier-1 naming, following the Story-41 value-keyed-raw approach) and semantic spacing aliases that reference the raw tier and never a literal; the app references the semantic tier.
- After the sweep, no raw spacing literals (`padding` / `margin` / `gap` numeric values, including each value of a multi-value shorthand) remain outside the token layer; spacing usage references the spacing tokens.
- Every distinct in-use spacing value is migrated to a raw token preserving it exactly; no near-values are consolidated onto a cleaner 4px/8px grid, so every resolved spacing value stays byte-identical.
- Multi-value shorthands migrate so each spacing component resolves to a token and any non-spacing keyword (`auto`, `0` where the Architect rules `0` out of token scope) is preserved, byte-identical to today.
- The new spacing guard scans app CSS for raw spacing literals (the property set the Architect fixes) outside the token layer, finds none, and passes; its allowlist names only legitimate token-source files (and layout primitives, if any exist by then).
- The Story-40 color guards and the Story-41 type guard stay green.
- `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/web build` all pass.
- The Story-39 `visual` job is zero-diff against committed baselines; no baseline is updated.

### Verified current state (read directly against the `story-42-spacing-tokens` working tree, 2026-06-03)

The token sheet (`packages/ui/styles/tokens.css`) post-Story-41 carries the full two-tier color tier and the full two-tier type tier (sizes, weights, line-heights, letter-spacings, families). Its non-token-axis entries are `--u-radius: 8px`, `--u-radius-lg: 12px`, `--page-max: 720px`, and `--page-pad-x: 24px`. **No spacing is tokenized**; every `padding` / `margin` / `gap` value is a raw literal in component/route CSS, except two declarations that already reference `var(--page-pad-x)` (`styles/base.css:62`, `components/RatingControl.css:4`).

**The declaration counts confirm ADR 0038's audit** (44 CSS files under `apps/web/src`). The 355 total is exact:

| Property | Declarations |
|---|---|
| `padding` (shorthand) | 103 |
| `gap` | 92 |
| `margin-bottom` | 69 |
| `margin` (shorthand) | 47 |
| `margin-top` | 30 |
| `margin-left` | 8 |
| `padding-top` | 4 |
| `margin-right` | 1 |
| `padding-bottom` | 1 |
| **Total** | **355** |

No logical longhands (`padding-inline`, `margin-block`, …) and no `row-gap` / `column-gap` exist in the app CSS today; only `gap` is used. **114 of the 355 declarations are multi-value** (a shorthand with two or more components).

Expanding every shorthand into its components yields **508 component tokens**, broken down by kind:

| Component kind | Count |
|---|---|
| length literal | 417 |
| bare `0` | 78 |
| `auto` | 11 |
| `var(--page-pad-x)` | 2 |

There are **no** percentages, **no** `calc()`, **no** `em`/`rem`, and **no** `!important` anywhere in box-spacing declarations (all confirmed by direct grep). `auto` appears only in `margin … auto` centering (11 sites; e.g. `margin: 0 auto`, `margin: 0 auto 28px`, `margin-left: auto`).

**Distinct length values (count = component-occurrence frequency), preserved exactly, no consolidation:**

`8px` (52), `10px` (44), `12px` (42), `14px` (37), `16px` (34), `6px` (28), `18px` (24), `2px` (23), `4px` (20), `28px` (15), `22px` (13), `24px` (13), `20px` (12), `9px` (11), `5px` (7), `32px` (6), `36px` (6), `3px` (6), `11px` (3), `13px` (3), `1px` (3), `40px` (3), `7px` (3), `56px` (2), `26px` (1), `30px` (1), `34px` (1), `42px` (1), `48px` (1), `60px` (1), and one **negative** value `-8px` (1, `components/RatedByRow.css:24`, `margin-left: -8px`, an avatar-stack overlap). That is **31 distinct length values** (30 positive + 1 negative), plus the bare `0`.

The set is **not a clean 4px/8px grid**: it carries `1px`, `2px`, `3px`, `5px`, `7px`, `9px`, `11px`, `13px`, `22px`, `26px`, `34px`, `42px` off the grid. This is the same non-laddered shape the type sizes had, and forces the same value-keyed naming decision (see Options).

**Positioning offsets (`top` / `right` / `bottom` / `left` / `inset`).** 13 declarations exist, exactly the PO's count, in five files:

| File:line | Declaration | Nature |
|---|---|---|
| `SearchBox.css:25` | `left: 11px` | icon centering offset |
| `SearchBox.css:37` | `left: 14px` | icon centering offset |
| `SearchBox.css:60` | `top: calc(100% + 8px)` | dropdown anchor |
| `SearchBox.css:61` | `left: 0` | absolute fill edge |
| `SearchBox.css:62` | `right: 0` | absolute fill edge |
| `GenreGrid.css:50` | `top: 0` | absolute fill edge |
| `GenreGrid.css:51` | `left: 0` | absolute fill edge |
| `Hero.css:42` | `left: 14px` | icon centering offset |
| `Hero.css:43` | `top: 50%` | centering percentage |
| `AccountMenu.css:21` | `top: calc(100% + 8px)` | dropdown anchor |
| `AccountMenu.css:22` | `right: 0` | absolute fill edge |
| `ToggleSwitch.css:39` | `top: 2px` | knob inset |
| `ToggleSwitch.css:40` | `left: 2px` | knob inset |

These are **positioning offsets, not box spacing**: they place an absolutely/relatively positioned element against its containing block, and they carry values that are not spacing at all (`50%`, `calc(100% + 8px)`, the `0` fill edges). They are **out of scope** for this story (see §2 property scope and the justification there).

**Runtime-injected spacing literals (the parallel to Story 41's type-in-TSX case).** Two leaf route components inject spacing values into inline `style={{}}` objects rather than CSS, so a literal can hide outside the scanned CSS:

| File:line | Property | Value | In the CSS raw set? |
|---|---|---|---|
| `routes/NotFound.tsx:12` | `padding` | `"80px 0 60px"` | `60px` yes; `80px` **no** (TSX-only) |
| `routes/NotFound.tsx:19` | `marginBottom` | `10` | yes (`10px`) |
| `routes/NotFound.tsx:28` | `marginBottom` | `22` | yes (`22px`) |
| `routes/AuthWelcome.tsx:44` | `marginTop` | `16` | yes (`16px`) |

This is the same shape Story 41 swept: bare numeric/string spacing literals inline on JSX `style` objects on two leaf route components (not props, not shared, not computed). Both files already carry CSS classes from the Story-41 type sweep (`not-found-heading`, `not-found-body`, `not-found-link`, `auth-welcome-note`), so the migration target CSS already exists. `NotFound.tsx:12`'s `80px` is a value not present in the CSS set; it becomes a new raw token like any other distinct value (see §1). **`Avatar.tsx:51`** uses `style={{ width: size, height: size }}` where `size` is a numeric prop; this is a **computed** dimension, not a literal spacing value, and is not a token candidate (it is also `width`/`height`, not a spacing property — out of scope regardless).

**Page-frame tokens.** `--page-max: 720px` (a `max-width`) and `--page-pad-x: 24px` (a horizontal page padding) already exist and are referenced in `styles/base.css` and `RatingControl.css`. `--page-pad-x` is a spacing value used inside two `padding` shorthands (`padding: 0 var(--page-pad-x) 32px`, `padding: 24px var(--page-pad-x)`).

**Guard precedent.** `packages/trust/test/architecture.test.ts` is the base pattern; Story 41's `packages/ui/test/architecture-type-literals.test.ts` is the exact mirror this guard follows: `REPO = resolve(__dirname,"..","..","..")`; `SCAN_ROOTS = [apps/web/src, packages/ui]`; `ALLOWLIST = new Set(["packages/ui/styles/tokens.css"])`; `SKIP_DIRS = {node_modules, dist, .git, engineering-team, e2e, data, test}`; a `walk()` collecting `.css/.ts/.tsx` excluding `.test.*`; a `cssValueIsLiteral()` helper that strips `!important`, treats `var(...)` and CSS keywords as non-literals; per-property `CSS_PROPS` regexes capturing the value up to `;`/`}`; TSX inline-style patterns matching numeric and quoted-string literals but never expressions; offenders aggregated into one `expect(offenders).toEqual([])`. `@unbnd/ui` already runs `vitest run` under `pnpm -r test`, so a new guard in `packages/ui/test/` needs no wiring change.

### Constraints that bind this design

- **Zero-diff is the prime directive.** Every resolved spacing value stays identical; the Story-39 `visual` job stays zero-diff; no baseline is updated (ADR 0039). No near-value consolidation, no grid-snapping, no unit change.
- No new tooling. The guard is a Vitest test under the existing `pnpm -r test` (`CLAUDE.md`; ADR 0038 §6). `@unbnd/ui` exports raw `./src/index.ts` with no build step (ADR 0038 §7).
- No AI-slop in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- Spacing axis only. Color is done (Story 40), type is done (Story 41); radii, elevation, z-index, motion, breakpoints are later epic stories; the non-spacing token-sheet entries are left as-is. Layout primitives (`Stack`, `Grid`, `Container`) are a later epic story and are not built here, though the guard allowlist anticipates them per ADR 0038 §6.
- In-repo prior art governs; the Tapestry branch survey does not apply (ADR 0038; story "DList shapes touched: None").

## Options considered

The genuinely load-bearing decisions are (1) the **raw naming scheme** for a value set that is not a clean grid, (2) **how multi-value shorthands are migrated** (the chief new mechanic), and (3) **whether positioning offsets and `0` are in scope**. Options are framed around those; the semantic tier, page-frame fold, runtime-injection, and guard then follow.

### Naming the raw tier

#### Option A — Ordinal / single-step scale (`--u-raw-space-1 … -12`)

The shape ADR 0038 §1 sketches.

- Pros: reads as a designed ladder; matches the umbrella's example names.
- Cons: **dishonest for the actual value set and a zero-diff hazard.** The in-use values are 31 distinct lengths (1–60px plus `-8px`) with no even spacing. A 12-step ordinal scale either forces consolidation the zero-diff rule forbids, or needs 31 off-ramp names (`space-1`, `space-1b`, …) that imply a ladder relationship that does not exist. An ordinal name also asserts an ordering between adjacent steps the migration must not create. Identical to the reason Stories 40 and 41 rejected ordinal naming for non-laddered sets. Rejected.

#### Option B — Value-keyed naming, one raw token per distinct value, keyed to the value itself (CHOSEN)

Each distinct value becomes its own raw token whose name encodes the value, so the name cannot imply a consolidation that did not happen and every value stays individually addressable:

- **px lengths:** `--u-raw-space-<n>` where `<n>` is the px integer (`--u-raw-space-8: 8px`, `--u-raw-space-13: 13px`, `--u-raw-space-60: 60px`).
- **negative:** `--u-raw-space-n8: -8px`, the `n` prefix encoding the sign legibly without a leading `-` in the identifier (exactly the convention ADR 0041 used for negative letter-spacing, `--u-raw-tracking-n30`).

- Pros: **honest and zero-diff by construction.** The name is the value, so no ordering or consolidation is implied; a reader sees exactly which literal a token carries. A value added later gets a new token named the same way, with no pressure to renumber an ordinal scale. Mirrors ADR 0040 (`--u-raw-color-ink-a08` keyed by alpha) and ADR 0041 (`--u-raw-font-size-13` keyed by px) exactly: the raw tier is a literal-keyed registry, not a design vocabulary.
- Cons: the names are less "designed" than `space-1 … -12`. Mitigated: the *semantic* Tier 2 (below) is where readable role names would live; the raw tier is deliberately a literal-keyed registry. A future rationalized spacing scale (a separate visual-change story) can introduce a clean ordinal raw set then, because that story is *allowed* to move values.

#### Option C — Opaque sequential names (`--u-raw-space-1 … -31`)

Sequential indices with no relation to the value.

- Pros: stable count.
- Cons: opaque; a reader cannot tell `--u-raw-space-7` from `--u-raw-space-8` without the sheet, and inserting a value forces a renumber. Strictly worse than B for no benefit. Rejected (same as ADR 0041 Option C).

**Chosen: Option B (value-keyed raw names).**

### Multi-value shorthand handling (the chief new mechanic)

#### Option D — Expand every shorthand to longhand properties

`padding: 8px 12px` becomes `padding-top: …; padding-right: …; padding-bottom: …; padding-left: …` (or the two-value `padding-block`/`padding-inline` form), each referencing one token.

- Pros: every declaration becomes single-valued, so the guard's per-property regex is the simplest possible (one value per declaration).
- Cons: **high churn and a zero-diff hazard.** A two-value shorthand becomes four declarations; the diff balloons far beyond the spacing sweep, and each expansion is a hand-transcription chance to flip a value or an axis (top/bottom vs left/right). It also changes the CSS structure (declaration count, cascade order within a rule) for no behavior gain. Expanding `margin: 0 auto` to longhand is especially noisy (`margin-top: 0; margin-right: auto; margin-bottom: 0; margin-left: auto`). Rejected: it maximizes churn and risk on a refactor that must be invisible and minimal.

#### Option E — Keep the shorthand, replace each length component with a `var(--u-space-…)`, leave keywords and `0` per the §3 rules (CHOSEN)

CSS shorthands accept `var()` per component, so the shorthand structure is preserved and only the length literals change:

```css
/* before → after */
padding: 8px 12px;            →  padding: var(--u-space-8) var(--u-space-12);
margin: 0 auto 28px;          →  margin: 0 auto var(--u-space-28);
padding: 8px 12px 8px 34px;   →  padding: var(--u-space-8) var(--u-space-12) var(--u-space-8) var(--u-space-34);
margin-left: -8px;            →  margin-left: var(--u-space-n8);
padding: 0 var(--page-pad-x) 32px;  →  padding: 0 var(--page-pad-x) var(--u-space-32);
```

- Pros: **least churn, structure preserved, zero-diff by construction.** Each length component swaps its literal for the matching alias; the resolved value is byte-identical because the alias chains raw → literal unchanged. The shorthand stays one declaration, the cascade and rule order are untouched, the diff is exactly the length substitutions. CSS fully supports `var()` inside any shorthand position, so there is no rendering caveat. Mirrors ADR 0041's per-call-site literal-to-alias swap, extended to per-component.
- Cons: the guard must parse a shorthand and accept a value that mixes `var()` references with bare keywords (`auto`) and bare `0`, rejecting only a remaining length literal. This is a slightly richer guard value-check than the single-value type guard, but it is a small extension of the existing `cssValueIsLiteral()` helper (tokenize the value, check each component). Accepted: the guard complexity is contained and well worth avoiding the Option-D churn.

**Chosen: Option E (keep the shorthand, per-component `var()` substitution).**

### Positioning offsets and `0` scope

#### Option F — Tokenize positioning offsets (`top`/`right`/`bottom`/`left`/`inset`) and the bare `0`

Bring the 13 positioning declarations and the 78 bare `0`s into the token system.

- Pros: maximal coverage; nothing length-like is left untokenized.
- Cons for positioning: **they are not box spacing, and the set is contaminated with non-spacing values.** The 13 offsets carry `50%`, `calc(100% + 8px)`, and the `0` fill edges (`left: 0; right: 0; top: 0`) that are positioning semantics, not a spacing scale. Tokenizing `left: 11px` as `var(--u-space-11)` would conflate "place this icon 11px from the edge" with "pad this box by 11px", which is exactly the role-confusion the two-tier model is meant to prevent; and the `50%`/`calc` values have no spacing token at all. The umbrella §6 names only `padding`/`margin`/`gap`. Rejected for positioning: out of scope, justified below.
- Cons for `0`: a unitless/`0px` zero is **value-stable** (it resolves identically under any spacing scale; a density change never wants `0` to become non-zero), so tokenizing it adds 78 substitutions of pure noise (`var(--u-space-0)` for `0`) that protect nothing. Leaving `0` bare keeps the diff to the values that actually carry a scale. (Counter-consideration: a `--u-space-0` makes the guard's "is this a literal?" check marginally simpler. Resolved against, below.) Rejected for `0`.

#### Option G — Scope = `padding` / `margin` / `gap` and their longhand/logical forms; leave positioning offsets and bare `0` out (CHOSEN)

Tokenize and guard exactly the box-spacing properties (the umbrella's named trio plus the longhand/logical forms, present and future). Leave `top`/`right`/`bottom`/`left`/`inset` as positioning offsets (a later concern, if ever), and leave the bare `0` bare.

- Pros: **honest scope, minimal diff, zero-diff by construction.** The token system models box spacing (the thing a density re-skin changes); positioning offsets are a different concern that a spacing re-skin does not touch. Bare `0` stays bare because it is value-stable and tokenizing it is pure churn. Matches the PO's read ("stay aligned to the ADR's named trio unless the Architect finds a reason to widen it; `0` and keyword values are a judgment call worth recording").
- Cons: a future reader might expect `top: 11px` to be a token. Mitigated: the ADR records the positioning exclusion explicitly with the per-declaration table above, so the boundary is auditable, not accidental. If a later story wants a positioning-offset scale, it is a separate, intentional decision (likely with its own role names, not the box-spacing scale).

**Chosen: Option G.**

## Decision

We choose **Option B** (value-keyed raw names), **Option E** (keep the shorthand, per-component `var()` substitution), and **Option G** (scope = box spacing; positioning offsets and bare `0` excluded). Together they deliver the two-tier spacing model across `padding`/`margin`/`gap` while holding every resolved value byte-identical.

### 1. Two-tier spacing taxonomy

**Tier 1 — raw spacing tokens.** Literal values only, no semantics. Naming `--u-raw-space-<value-key>`, one token per distinct value actually in use (no speculative steps), unit kept as authored (px). The negative value uses the `n` sign prefix. The full set is the inventory above; the complete Tier-1 block is:

```
--u-raw-space-1: 1px;    --u-raw-space-2: 2px;    --u-raw-space-3: 3px;
--u-raw-space-4: 4px;    --u-raw-space-5: 5px;    --u-raw-space-6: 6px;
--u-raw-space-7: 7px;    --u-raw-space-8: 8px;    --u-raw-space-9: 9px;
--u-raw-space-10: 10px;  --u-raw-space-11: 11px;  --u-raw-space-12: 12px;
--u-raw-space-13: 13px;  --u-raw-space-14: 14px;  --u-raw-space-16: 16px;
--u-raw-space-18: 18px;  --u-raw-space-20: 20px;  --u-raw-space-22: 22px;
--u-raw-space-24: 24px;  --u-raw-space-26: 26px;  --u-raw-space-28: 28px;
--u-raw-space-30: 30px;  --u-raw-space-32: 32px;  --u-raw-space-34: 34px;
--u-raw-space-36: 36px;  --u-raw-space-40: 40px;  --u-raw-space-42: 42px;
--u-raw-space-48: 48px;  --u-raw-space-56: 56px;  --u-raw-space-60: 60px;
--u-raw-space-80: 80px;  /* TSX-only (NotFound.tsx padding), swept to CSS */
--u-raw-space-n8: -8px;  /* negative; avatar-stack overlap */
```

That is **31 px tokens** (30 from CSS + `80px` from the swept `NotFound.tsx` inline style) plus **1 negative** = 32 raw spacing tokens.

**Tier 2 — semantic / per-property aliases.** Point at Tier 1, never a literal. App CSS references only Tier 2. The conservative default, mirroring ADR 0041 exactly, is a **thin value-keyed alias** that is property-agnostic (spacing roles are not property-specific the way `font-size`/`font-weight` are: the same `8px` is used as padding, margin, and gap, so a single `--u-space-<n>` alias serves all three properties):

```
--u-space-1:  var(--u-raw-space-1);   --u-space-2:  var(--u-raw-space-2);   …
--u-space-8:  var(--u-raw-space-8);   …   --u-space-80: var(--u-raw-space-80);
--u-space-n8: var(--u-raw-space-n8);
```

Every existing length component swaps its literal for the matching `--u-space-<n>` alias with no resolved-value change. A re-skin (a tighter inset scale, a roomier stack rhythm) remaps Tier 2 → new raw values, or remaps a richer role tier (below) onto new raws; app CSS, referencing only Tier 2, does not change.

**Why thin per-value aliases and not richer inset/stack/inline roles now.** ADR 0038 §1 sketches `--u-space-inset-{sm,md,lg}` and stack/inline `gap` roles. A role tier is the eventual design vocabulary, but minting it now is a **consolidation decision and a zero-diff hazard**, the same trap ADR 0041 §3 identified for type bundles: the real call sites do not cluster onto a small set of clean inset/stack values (the inventory shows 31 distinct values used interchangeably across padding/margin/gap), so mapping them onto `inset-{sm,md,lg}` would either merge near-unequal values (moving pixels, failing the visual gate) or invent dozens of off-ramp role names that are just the value-keyed aliases under a less honest name. The honest role mapping is a design decision, not a mechanical refactor. **Decision: thin per-value aliases now; richer inset/stack/inline role tokens are deferred** to a later, intentional story that designs the roles under the ADR 0039 visual-change discipline (recorded in Out of scope). This is the exact precedent ADR 0040 set for color (`--u-border`/`--u-surface` kept thin) and ADR 0041 set for type (per-property aliases, bundles deferred).

### 2. Property scope

In scope and tokenized + guarded this story: **`padding`, `margin`, `gap`, and their longhand and logical forms** (`padding-top`/`-right`/`-bottom`/`-left`, `padding-block`/`-inline`(`-start`/`-end`), the `margin-*` equivalents, and `row-gap`/`column-gap`). Of these, the forms actually present today are `padding`, `gap`, `margin`, `margin-bottom`, `margin-top`, `margin-left`, `padding-top`, `margin-right`, `padding-bottom`; the longhand/logical and `row-gap`/`column-gap` forms are included in the guard's property set so a future use is caught even though none exist now.

**Positioning offsets out of scope.** `top` / `right` / `bottom` / `left` / `inset` (13 declarations, table in Context) are **not** tokenized or guarded. They are positioning offsets, not box spacing: they place a positioned element against its containing block and carry values that are not on a spacing scale (`50%`, `calc(100% + 8px)`, the `0` fill edges). A spacing/density re-skin does not change them; conflating them with the box-spacing scale would create exactly the role confusion the two-tier model prevents. A positioning-offset scale, if ever wanted, is a separate intentional decision with its own role names. (Note: `top: calc(100% + 8px)` even nests a spacing-like `8px` inside a `calc`; this story does not reach into positioning `calc` expressions.)

**Bare `0` out of token scope.** A unitless/`0px` zero is value-stable across any spacing scale (a density change never wants `0` to become non-zero), so it is **left bare**, not tokenized. This keeps the 78 `0` components from becoming `var(--u-space-0)` noise and keeps the diff to the values that actually carry a scale. The guard treats a bare `0` (and `0px`/`0rem`) as a non-offender (see §5). Inside a shorthand, `0` stays `0` (`margin: 0 auto` → `margin: 0 auto`, only non-`0` lengths get a token).

**`auto` and other keywords stay.** `auto` (11 sites, all `margin … auto` centering) is a keyword, not a spacing scale value, and is left as `auto` inside its shorthand (`margin: 0 auto` → `margin: 0 auto`; `margin-left: auto` → `margin-left: auto`). The guard treats `auto`/`inherit`/`initial`/`unset` as non-offenders.

**`var(--page-pad-x)` stays.** The two existing `var(--page-pad-x)` references inside `padding` shorthands are already token references and are left exactly as they are; the guard accepts `var(...)` components.

### 3. Multi-value shorthand, `0`, units, negative, keyword rules (all zero-diff)

The shorthand is **kept** (Option E). Each component is handled by kind:

| Component | Rule | Example |
|---|---|---|
| px length (positive) | swap for `var(--u-space-<n>)` | `8px` → `var(--u-space-8)` |
| px length (negative) | swap for `var(--u-space-n<n>)` | `-8px` → `var(--u-space-n8)` |
| bare `0` (or `0px`/`0rem`) | **left bare** (value-stable, not tokenized) | `0` → `0` |
| `auto` | **left as `auto`** (keyword) | `auto` → `auto` |
| existing `var(...)` | **left as-is** | `var(--page-pad-x)` → unchanged |

Worked examples (every resolved value byte-identical):

```css
padding: 12px 14px;          →  padding: var(--u-space-12) var(--u-space-14);
margin: 0 auto;              →  margin: 0 auto;
margin: 0 auto 28px;         →  margin: 0 auto var(--u-space-28);
padding: 8px 12px 8px 34px;  →  padding: var(--u-space-8) var(--u-space-12) var(--u-space-8) var(--u-space-34);
margin-left: -8px;           →  margin-left: var(--u-space-n8);
gap: 6px;                    →  gap: var(--u-space-6);
padding: 24px var(--page-pad-x);     →  padding: var(--u-space-24) var(--page-pad-x);
padding: 0 var(--page-pad-x) 32px;   →  padding: 0 var(--page-pad-x) var(--u-space-32);
```

Units: only px is in use; the rules forbid any unit conversion (there is no rem/em/% spacing to convert, and a px→anything conversion would be a value change). `calc()` does not appear in box spacing, so no rule is needed beyond "the guard accepts a `calc(...)` component as a non-literal if one ever appears" (none today).

### 4. Page-frame tokens (`--page-max` / `--page-pad-x`)

**`--page-pad-x` stays as-is this story; it does NOT fold into the spacing tier.** It is a Tier-2-shaped semantic name already (the page's horizontal padding role), its two call sites already reference it, and its value `24px` is identical to the new `--u-raw-space-24`. Folding it now would mean either renaming it (churning its two call sites, the anti-pattern ADR 0040/0041 gates rejected for `--signal-*`/`--font-*`) or repointing it at `var(--u-raw-space-24)` (a cosmetic internal change with no call-site or render effect). The conservative, zero-churn choice consistent with the prior two ADRs is to **leave it exactly as-is**, a defined Tier-2 token the guard treats as a legitimate spacing token. `--page-max` is a `max-width` (not a spacing property in scope at all) and is untouched. The Implementer MAY optionally repoint `--page-pad-x: 24px` to `--page-pad-x: var(--u-raw-space-24)` for internal consistency (zero render effect, zero call-site change), but MUST NOT rename or remove it; if a `--page-pad-x` → spacing-scale unification is ever wanted, it is its own complete story.

### 5. The spacing CI guard

One new guard, `packages/ui/test/architecture-spacing-literals.test.ts`, mirroring `architecture-type-literals.test.ts` (`REPO` resolve, `SCAN_ROOTS = [apps/web/src, packages/ui]`, `walk()` collecting `.css/.ts/.tsx` excluding `.test.*`, `SKIP_DIRS = {node_modules, dist, .git, engineering-team, e2e, data, test}`, single aggregated `expect(offenders).toEqual([])`). It runs under the existing `pnpm -r test`.

**Scope and patterns.** The guard scans for raw spacing *literals* outside the token layer. The in-scope CSS properties (and only these) are matched: `padding`, `margin`, `gap`, `row-gap`, `column-gap`, and the longhand/logical forms (`padding-top|right|bottom|left|block|inline[-start|-end]`, the `margin-*` equivalents). `top`/`right`/`bottom`/`left`/`inset` are **not** matched (positioning, out of scope per §2). Each property's value is captured up to the declaration terminator (`;` or `}`), as in the type guard.

The decisive extension over the type guard is that a spacing value is a **multi-component shorthand**, so the guard cannot just check the whole value. It **tokenizes the captured value into space-separated components** (respecting parentheses so `var(...)` and `calc(...)` are single atoms), strips a trailing `!important`, and an **offender is any declaration with at least one component that is a bare length literal** — i.e. a component matching `[+-]?\d*\.?\d+(px|rem|em|vh|vw)?` that is not one of the exempt kinds:

- `var(--…)` reference → exempt (a token).
- `calc(…)` → exempt (no spacing `calc` exists today; exempted so a future one is not a false positive — a later story may tighten this).
- `auto` / `inherit` / `initial` / `unset` / `normal` → exempt (CSS keywords).
- bare `0` / `0px` / `0rem` → exempt (value-stable; §2 leaves it bare). The check is "the numeric value parses to zero", so `0`, `0px`, `0.0` are all exempt.

So `padding: var(--u-space-8) var(--u-space-12)` passes (all components are `var()`), `margin: 0 auto` passes (`0` exempt, `auto` keyword), `margin: 0 auto var(--u-space-28)` passes, and `padding: 8px var(--u-space-12)` is an **offender** (the `8px` component is a bare length). This is exactly the AC requirement: a fully-`var()`/keyword shorthand is accepted; any remaining length literal is rejected.

**TSX inline-style spacing literals (forward regression net).** In `.ts/.tsx`, an inline-style key in `{padding, paddingTop|Right|Bottom|Left, margin, marginTop|Right|Bottom|Left, gap, rowGap, columnGap}` assigned a literal is an offender: a numeric literal (`marginBottom: 10`), or a quoted-string literal (`padding: "80px 0 60px"`). An *expression* value (`width: size`, a variable, a member/call) is not a literal and is not matched — the same value-shape patterns the type guard uses, so `Avatar.tsx:51`'s `width: size`/`height: size` is not matched (and `width`/`height` are not spacing keys anyway). After the sweep (NotFound.tsx and AuthWelcome.tsx moved to CSS) this scan is green on landing and red on any future inline spacing literal.

**Allowlist (names ONLY legitimate token-source files).** The single legitimate home for spacing literals is the token sheet:

- `packages/ui/styles/tokens.css` (the Tier-1 raw spacing literals live here; `--page-pad-x`/`--page-max` also live here as defined tokens).

No TS file is allowlisted: per §3 the runtime-injected spacing literals are swept into CSS, not into a TS constant, so there is no spacing-scale TS module to exempt (the exact Option-G outcome ADR 0041 reached). `apps/web/src/data` and `apps/web/e2e` are scope-excluded via `SKIP_DIRS`, consistent with the color and type guards. The `@unbnd/ui` `test/` dir is skipped (it holds the guards). When layout primitives (`Stack`/`Grid`/`Container`) land in a later story, that story adds their files to the allowlist per ADR 0038 §6 wording; this story builds no primitive, so the allowlist names only the token sheet now.

**Green on landing, red on regression.** The sweep removes every spacing literal from app CSS and the two TSX files first; the guard is then green the moment it lands and red forever after on any new raw spacing literal outside `tokens.css`, exactly as ADR 0038 §6 requires.

**The Story-40 color guards and the Story-41 type guard are untouched** and stay green; this story only adds a file under `packages/ui/test/`.

## Consequences

- **Enables** a future spacing or density change (a tighter inset scale, a roomier stack rhythm) as a Tier-2-to-raw remap with no app-CSS change, and a future `[data-theme]` skin's spacing overrides. Completes the three lowest-entanglement axis sweeps (color, type, spacing); the token sheet now models color, type, and spacing as two-tier.
- **Constrains** all future spacing work: new `padding`/`margin`/`gap` values must go through Tier-2 tokens (CSS); inline JSX spacing literals are forbidden by the guard's `.tsx` scan. The guard makes this real, not advisory.
- **New debt / follow-ups:** (1) richer semantic spacing role tokens (`--u-space-inset-{sm,md,lg}`, stack/inline `gap` roles per ADR 0038 §1) are deferred to a later intentional story that designs the roles and is allowed to move values under ADR 0039; (2) a genuinely rationalized spacing scale that collapses near-duplicate values onto a clean 4px/8px grid (e.g. snapping `13px`/`11px`/`9px`) is a separate visual-change story, not this refactor; (3) the value-keyed raw names are a literal registry by design — when the rationalized scale lands, that story may introduce ordinal raw names then; (4) positioning offsets (`top`/`right`/`bottom`/`left`/`inset`) are left untokenized; a positioning-offset scale, if ever wanted, is a separate decision; (5) `--page-pad-x` is left as a standalone Tier-2 token; folding it into the spacing scale (or repointing it at `--u-raw-space-24`) is an optional later tidy.
- **Affects existing fixtures?** No. No data fixtures change. The two TSX route files (`NotFound.tsx`, `AuthWelcome.tsx`) lose inline spacing literals to their existing CSS classes with byte-identical resolved values. The Story-39 `visual` job confirms zero-diff.
- **New dependency?** No. The guard is a new Vitest test in the existing `packages/ui/test/`. No new third-party dependency, no new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes. Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors for the Implementer (Architect is read-only on source; these are the targets, not edits made here):

- **Token sheet:** `packages/ui/styles/tokens.css` — add a Tier-1 raw spacing block (`--u-raw-space-*` ×31 px + `--u-raw-space-n8`, the full set in §1) and the Tier-2 thin per-value aliases (`--u-space-*` and `--u-space-n8`, each `var()`-pointing at its raw). Leave all color, type, radius, and `--page-*` tokens exactly as they are (optionally repoint `--page-pad-x: 24px` → `var(--u-raw-space-24)` for internal consistency, no rename, no call-site change). A natural home is a new clearly-commented block after the type Tier-2 block and before the `--page-*` layout tokens.
- **App CSS sweep:** across `apps/web/src/**/*.css`, replace every bare length component of every in-scope `padding`/`margin`/`gap`/longhand declaration with the matching Tier-2 alias `var(--u-space-<n>)` (negative → `var(--u-space-n8)`), keeping the shorthand structure, leaving bare `0` as `0`, `auto` as `auto`, and existing `var(--page-pad-x)` untouched. Do not touch `top`/`right`/`bottom`/`left`/`inset` (positioning, out of scope). Per the §3 table.
- **Runtime-injected literals:** `routes/NotFound.tsx` — move the inline `padding: "80px 0 60px"`, `marginBottom: 10`, `marginBottom: 22` into the existing CSS (the section's class and `not-found-heading`/`not-found-body` classes added in Story 41) as token references (`padding: var(--u-space-80) 0 var(--u-space-60)` etc.); leave non-spacing inline props (`textAlign`, `color: var(--u-muted)`, `color: var(--u-amber)`) inline. `routes/AuthWelcome.tsx` — move `marginTop: 16` into the existing `auth-welcome-note` class as `margin-top: var(--u-space-16)`; leave `textAlign`/`color` inline. `components/Avatar.tsx:51` — **no change** (`width: size`/`height: size` is a computed dimension, not a literal, and not a spacing property).
- **Guard:** `packages/ui/test/architecture-spacing-literals.test.ts`, copying `architecture-type-literals.test.ts` structure (`REPO`, `SCAN_ROOTS`, `walk()` over `.css/.ts/.tsx`, `SKIP_DIRS` as listed, `ALLOWLIST = {packages/ui/styles/tokens.css}`, single aggregated `expect`). Extend the value check to **tokenize the shorthand into components** (parenthesis-aware split so `var(...)`/`calc(...)` are atoms), and flag a declaration whose any component is a bare length literal that is not `var(...)`, `calc(...)`, a keyword (`auto`/`inherit`/`initial`/`unset`/`normal`), or a zero (`0`/`0px`/`0rem`). CSS property set = `padding`/`margin`/`gap`/`row-gap`/`column-gap` + longhand/logical forms; **not** `top`/`right`/`bottom`/`left`/`inset`. TSX inline-style keys = the spacing keys in §5, matching numeric and quoted-string literals only, never expressions. It runs under the existing `pnpm -r test`.
- **Verification gate:** after the sweep, `pnpm -r typecheck`, `pnpm -r test` (the new spacing guard + the existing color and type guards + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job must all pass, the last zero-diff with **no baseline update**.

## Out of scope

- **Spacing-scale rationalization / grid-snapping.** Every distinct in-use spacing value is preserved exactly; no near-values are consolidated onto a cleaner 4px/8px grid (e.g. snapping `13px` and `12px`), which would move pixels and the Story-39 gate would correctly fail. A genuinely rationalized spacing scale is a separate, intentional visual-change story under the ADR 0039 discipline. This is the central constraint of the story.
- **Richer semantic spacing role tokens** (`--u-space-inset-{sm,md,lg}`, stack/inline `gap` roles per ADR 0038 §1). Deferred to a later intentional story that designs the roles; mapping the 31 interchangeably-used values onto a small role set now would merge near-unequal values and break zero-diff.
- **Positioning offsets** (`top`/`right`/`bottom`/`left`/`inset`, 13 declarations). Not box spacing; left untokenized. A positioning-offset scale, if ever wanted, is a separate decision.
- **The bare `0`** (78 components) is left bare (value-stable). **`auto`** (11 sites) is left as a keyword. Neither is tokenized.
- **`--page-pad-x` / `--page-max`** are left as standalone tokens (not folded into the spacing scale this story); an optional internal repoint of `--page-pad-x` to `var(--u-raw-space-24)` is allowed but no rename/removal.
- **Any other token axis:** color (done, Story 40), type (done, Story 41), radii, elevation, z-index, motion (durations, easings), breakpoints (later epic stories). Non-spacing token-sheet entries are left exactly as they are.
- **Re-sourcing the runtime-injected spacing values into a TS constant.** The two TSX surfaces are one-off inline styles, not shared props; they are swept into CSS (the ADR 0041 Option-G outcome), not relocated to a TS module.
- **Layout primitives** (`Stack`, `Grid`, `Container`), primitives (`Button` etc.), the icon registry, and the motion layer (later epic stories). The guard allowlist anticipates layout primitives per ADR 0038 §6 but this story builds none.
- **Authoring a dark theme or any second skin** (ADR 0038; epic story 13). The two-tier spacing structure must admit one; building one is later work.
- **Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui`** and citing the new guard (epic story 14).
- Any behavior, copy, or information-architecture change. The only visible change permitted is none, proven zero-diff against the Story-39 harness.
