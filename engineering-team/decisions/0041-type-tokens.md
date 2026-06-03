# ADR 0041: Two-tier type tokens (sizes, weights, line-heights, letter-spacing, families) and the type CI guard

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/41-type-tokens.md`

**Approved 2026-06-03** at the architecture gate. Gate resolutions: (1) **letter-spacing IS in scope** (36 declarations / 17 values; excluding it would force a dishonest guard allowlist and a second sweep); (2) the `--u-text-*` semantic bundles are **deferred** to a later intentional typography story (bundles would merge near-unequal call-site combinations and move pixels; this refactor uses thin per-property aliases only); (3) **no `--u-family-*` aliases** are added — `--font-sans`/`--font-mono` are kept and repointed to raw (consistent with the Story-40 decision to leave `--signal-*`/`--genre-*` as-is; cosmetic `--u-` unification is its own complete story if ever wanted).

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03, §1 two-tier token layer, §6 CI guards, §7 package shape). Mirrors the just-accepted **ADR 0040** (the color axis: raw Tier 1 → semantic Tier 2 aliases kept at their existing names, repointed to raw; guards under `packages/ui/test/` copying `packages/trust/test/architecture.test.ts`; zero-diff D2 discipline that mints a token equal to the current rendered value rather than consolidating). Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job at `maxDiffPixelRatio: 0`, and the rule that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 4, the type axis, sequenced after color in the lowest-entanglement-first order). This ADR resolves the type-taxonomy, naming, bundles-vs-aliases, property-scope, family-fold, runtime-injection, and guard-scope open questions the story carries. It does not relitigate 0038, 0039, or 0040.

## Context

The type axis is the second axis migration of the design-system overhaul. The umbrella (ADR 0038 §1) sets the target: a two-tier token layer in `@unbnd/ui` where Tier 1 is a raw scale of literal type values (sizes, weights, line-heights, families) and Tier 2 is semantic aliases that point at Tier 1 and never at a literal; app CSS references only Tier 2. The hard constraint from the user and orchestrator is that this story is a refactor and must be **zero-diff**: every resolved type value stays byte-identical, the Story-39 `visual` job is zero-diff against committed baselines, and **no baseline is updated**. ADR 0038's audit counted ~210 `font-size` and ~109 `font-weight` declarations and zero type tokens beyond the two font families; confirming and inventorying the distinct values is this ADR's job.

### Acceptance criteria (quoted from the story)

- Type tokens are two-tier: a raw scale of literal values (sizes, weights, line-heights, families, per ADR 0038 §1 Tier-1 naming) and semantic type aliases or bundles that reference the raw tier and never a literal; the app references the semantic tier.
- After the sweep, no raw `font-size`, `font-weight`, or `line-height` literals remain outside the token layer; type usage references the type tokens.
- Every distinct font-size, font-weight, and line-height value in use today is migrated to a raw token preserving it exactly; no near-values are consolidated onto a cleaner scale, so every resolved type value stays byte-identical.
- `--font-sans` and `--font-mono` fold into the family tier (raw family tokens with any semantic alias the Architect chooses); no family literal is duplicated across the token layer or app CSS.
- The new type guard scans app CSS for raw `font-size` / `font-weight` / `line-height` literals outside the token layer, finds none, and passes; its allowlist names only the legitimate token-source files.
- The Story-40 color guards stay green; `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm --filter @unbnd/web build` succeeds.
- The Story-39 `visual` job is zero-diff against committed baselines; no baseline is updated.

### Verified current state (read directly against the `story-41-type-tokens` working tree, 2026-06-03)

The token sheet (`packages/ui/styles/tokens.css`) post-Story-40 carries the full two-tier **color** tier plus the non-color `--u-radius`/`--u-radius-lg`, `--page-max`/`--page-pad-x`, and the two type **families** `--font-sans` / `--font-mono` (the only type tokens that exist). No type sizes, weights, line-heights, or letter-spacings are tokenized; every one is a raw literal in component/route CSS.

**The declaration counts confirm ADR 0038's audit** (43 CSS files under `apps/web/src`):

| Property | Total declarations | Distinct values |
|---|---|---|
| `font-size` | **210** | **21** (17 px + 4 rem) |
| `font-weight` | **109** | **4** |
| `line-height` | **41** | **12** |
| `letter-spacing` | **36** | **17** |
| `font-family` | 12 | already tokenized: `var(--font-mono)` ×5, `var(--font-sans)` ×4, `inherit` ×3 |

**Distinct `font-size` values** (count = usage frequency), preserved exactly, no consolidation:

`13px` (60), `12px` (41), `11px` (36), `14px` (28; one of these is `14px !important` in `About.css:33` — same value, the `!important` flag is preserved at the call site, not in the token), `15px` (8), `16px` (6), `26px` (5), `10px` (5), `22px` (3), `20px` (2), `17px` (2), `9px` (1), `38px` (1), `30px` (1), `28px` (1), `24px` (1), `18px` (1); and four rem values: `0.9rem` (2), `0.95rem` (2), `0.92rem` (2), `0.85rem` (1). The rem values live in `FollowButton.css` and `RatingControl.css`. They are kept **as authored** (rem, not converted to px): the root font-size is the browser default (no `font-size` is set on `:root`/`html` in app CSS, confirmed), so `0.9rem` resolves to `14.4px`, but the literal stays `0.9rem` because converting would change the authored unit and risk a sub-pixel rounding diff under the visual gate. **Decision: no rem→px conversion, ever, in this refactor** (rationalizing the px/rem split is a separate visual-change story).

**Distinct `font-weight` values:** `600` (53), `500` (50), `700` (4), `400` (2). A clean four-step ladder, so the ordinal/keyword scale is honest here.

**Distinct `line-height` values:** `1.6` (8), `1.3` (7), `1.55` (5), `1.4` (5), `1.5` (4), `1` (3), `1.7` (2), `1.25` (2), `1.2` (2), `1.75` (1), `1.65` (1), `0` (1, `RatingControl.css:42`, an icon-reset zero). Unitless ratios plus the two integer resets (`1`, `0`); not a clean ramp.

**Distinct `letter-spacing` values:** `-0.3px` (5), `0.3px` (4), `0.2px` (4), `-0.6px` (4), `-0.5px` (4), `0.5px` (3), `0.1px` (2), `1px` (1), `0.4px` (1), `0.04em` (1), `0.02em` (1), `0` (1), `-1.1px` (1), `-0.7px` (1), `-0.4px` (1), `-0.2px` (1), `-0.1px` (1). Seventeen distinct values mixing positive and negative px and two em values; the densest, least-laddered set of all.

**The `font:` shorthand** appears three times (`AuthorEdit.css:31`, `AuthShell.css:89`, `ClaimControl.css:10`), each as `font: inherit;`. `inherit` is a CSS-wide keyword, not a literal, so these carry no size/weight/family literal and are left alone (the guard does not flag them).

**The runtime-injected font literals (the decisive parallel to Story 40's color-in-JS case).** Three TSX files inject font values into inline `style={{}}` objects rather than CSS, so a literal can hide outside the scanned CSS:

| File:line | Property | Value | In the CSS raw set? |
|---|---|---|---|
| `routes/NotFound.tsx:17` | `fontSize` | `26` | yes (`26px`) |
| `routes/NotFound.tsx:18` | `fontWeight` | `600` | yes |
| `routes/NotFound.tsx:19` | `letterSpacing` | `"-0.6px"` | yes |
| `routes/NotFound.tsx:27` | `fontSize` | `14` | yes (`14px`) |
| `routes/NotFound.tsx:37` | `fontSize` | `13` | yes (`13px`) |
| `routes/NotFound.tsx:38` | `fontWeight` | `500` | yes |
| `routes/AuthWelcome.tsx:41` | `fontSize` | `11` | yes (`11px`) |
| `routes/AuthWelcome.tsx:44` | `lineHeight` | `1.5` | yes |
| `components/Avatar.tsx:43` | `fontSize` | `Math.round(size * 0.4)` | **computed**, not a literal |

`Avatar.tsx:43` is a *computed* size (`Math.round(size * 0.4)` from the `size` prop), not a literal type value; it is not a token candidate and the guard must not flag it. `NotFound.tsx` and `AuthWelcome.tsx` are different from Story 40's color case in one respect: their font values are **bare numeric/string literals inline on JSX `style` objects**, not props threaded through a TS constant (the way `logoFill` color props were). That difference shapes the chosen handling (see §6).

**Guard precedent.** `packages/trust/test/architecture.test.ts` is the base pattern; Story 40's `packages/ui/test/architecture-color-literals.test.ts` is the exact mirror this guard follows: `REPO = resolve(__dirname,"..","..","..")`; `SCAN_ROOTS = [apps/web/src, packages/ui]`; an `ALLOWLIST` set of repo-relative paths; `SKIP_DIRS` including `node_modules`, `dist`, `.git`, `engineering-team`, `e2e`, `data`, `test`; a `walk()` collecting `.css/.ts/.tsx` excluding `.test.*`; a `PATTERNS` list of `{label, pattern}`; offenders aggregated into one `expect(offenders).toEqual([])`. `@unbnd/ui` already runs `vitest run` under `pnpm -r test`, so a new guard in `packages/ui/test/` needs no wiring change.

### Constraints that bind this design

- **Zero-diff is the prime directive.** Every resolved type value stays identical; the Story-39 `visual` job stays zero-diff; no baseline is updated (ADR 0039). No near-value consolidation, no unit conversion.
- No new tooling. The guard is a Vitest test under the existing `pnpm -r test` (`CLAUDE.md`; ADR 0038 §6). `@unbnd/ui` exports raw `./src/index.ts` with no build step (ADR 0038 §7).
- No AI-slop in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- Type axis only. Color is done (Story 40); spacing, radii, elevation, z-index, motion, breakpoints are later epic stories; the non-type token-sheet entries are left as-is, except `--font-sans`/`--font-mono` move into the new family tier.
- In-repo prior art governs; the Tapestry branch survey does not apply (ADR 0038; story "DList shapes touched: None").

## Options considered

The genuinely load-bearing decisions are (1) the **raw naming scheme** for value sets that are not clean ramps, (2) **semantic bundles vs thin per-property aliases**, and (3) **how the runtime-injected TSX font literals are handled**. Options are framed around those; property scope and the family fold then follow.

### Naming the raw tier

#### Option A — Ordinal / t-shirt scale (`--u-raw-size-xs … -3xl`, `--u-raw-weight-{regular…bold}`)

The shape ADR 0038 §1 sketches.

- Pros: reads as a designed ladder; matches the umbrella's example names.
- Cons: **dishonest for the actual value sets.** The in-use font-sizes are 21 distinct values (9–38px plus four rems) with no even spacing; mapping them onto `xs…3xl` either forces a consolidation the zero-diff rule forbids, or invents a dozen off-ramp names (`xs`, `xs2`, `sm-`, …) that imply a ladder that does not exist. Letter-spacing (17 values, signed, mixed units) and line-height (12 unitless ratios plus two resets) have no natural t-shirt mapping at all. An ordinal name also silently asserts an ordering relationship between adjacent steps that the migration must not create. Rejected for sizes, line-heights, and letter-spacings; **acceptable only for weight**, where the four values genuinely are a regular/medium/semibold/bold ladder.

#### Option B — Numeric-by-value naming, one raw token per distinct value, keyed to the value itself (CHOSEN for size / line-height / letter-spacing)

Each distinct value becomes its own raw token whose name encodes the value, so the name cannot imply a consolidation that did not happen and every value stays individually addressable:

- **sizes:** `--u-raw-font-size-<n>` where `<n>` is the px integer (`--u-raw-font-size-13: 13px`) and `--u-raw-font-size-<n>rem` for the four rem values (`--u-raw-font-size-90rem: 0.9rem`, encoding `0.90rem` as `90rem` to keep a legal CSS identifier; the comment records the literal). Unit kept as authored.
- **line-heights:** `--u-raw-leading-<nn>` where `<nn>` is the ratio with the decimal point dropped (`--u-raw-leading-160: 1.6`, `--u-raw-leading-100: 1`, `--u-raw-leading-0: 0`). Unitless, preserved exactly.
- **letter-spacings:** `--u-raw-tracking-<sign><n>` (`--u-raw-tracking-n30: -0.3px` for `-0.3px`, `--u-raw-tracking-p30: 0.3px`, the two em values `--u-raw-tracking-p04em: 0.04em`). `n`/`p` prefixes encode the sign legibly without a leading `-` in the identifier.

- Pros: **honest and zero-diff by construction.** The name is the value, so no ordering or consolidation is implied; a reader sees exactly which literal a token carries. New values added later get a new token named the same way, with no pressure to renumber an ordinal scale. Mirrors ADR 0040's own resolution of the same problem (the color `rgba` overlays were named `--u-raw-color-ink-a08` by base+alpha, by value, precisely because they were not a clean ramp).
- Cons: the names are less "designed" than `xs/sm/md`. Mitigated: the *semantic* Tier 2 (below) is where readable role names live; the raw tier is deliberately a literal-keyed registry, not a design vocabulary, exactly as the color raw tier is. A future rationalized type scale (a separate visual-change story) can introduce a clean ordinal raw set then, because that story is *allowed* to move values.

#### Option C — Hash/opaque names (`--u-raw-size-1 … -21`)

Sequential indices with no relation to the value.

- Pros: stable count.
- Cons: opaque; a reader cannot tell `--u-raw-size-7` from `--u-raw-size-8` without the sheet, and inserting a value forces a renumber or an out-of-order index. Strictly worse than B's value-keyed names for no benefit. Rejected.

**Chosen: Option B for sizes, line-heights, letter-spacings; Option A's keyword ladder for weights** (the one axis that genuinely is a clean four-step ramp: `--u-raw-weight-regular: 400`, `-medium: 500`, `-semibold: 600`, `-bold: 700`).

### Semantic tier: bundles vs thin aliases

#### Option D — Semantic role bundles now (`--u-text-body`, `--u-text-heading`, `--u-text-caption` pairing size+weight+leading)

The shape ADR 0038 §1 sketches.

- Pros: the eventual design vocabulary; a call site says `font: var(--u-text-body)` once.
- Cons: **a bundle is a consolidation decision and a zero-diff hazard.** CSS has no first-class "type style" custom property; a bundle would be either a `font:` shorthand string (which also sets `font-family`, `font-style`, `font-variant`, overriding inherited values and changing resolved output) or a convention that several call sites adopt the *same* size+weight+leading triple. The audit shows the real call sites do **not** cluster onto a small set of clean triples; mapping ~210 size uses × ~109 weight uses × 41 line-height uses onto `body/heading/caption` would merge near-identical-but-not-equal combinations, which moves pixels and the visual gate would correctly fail. Building the role bundles honestly requires first knowing the intended roles, which is a design decision, not a mechanical refactor. Rejected for this story.

#### Option E — Raw tier plus thin per-property semantic aliases (CHOSEN)

Land the raw tier, and a Tier-2 of **per-property** semantic aliases mapped 1:1 from raw, with app CSS referencing the semantic aliases. Tier 2 names by property and a light role hint where one is unambiguous, e.g. `--u-font-size-body: var(--u-raw-font-size-15)`, but the conservative default is a thin value-keyed alias `--u-font-size-13: var(--u-raw-font-size-13)`, `--u-font-weight-semibold: var(--u-raw-weight-semibold)`, `--u-leading-relaxed: var(--u-raw-leading-160)`, `--u-tracking-tight: var(--u-raw-tracking-n30)`. Each call site swaps its literal for the matching semantic alias; the resolved value is byte-identical because the alias chains raw → literal unchanged.

- Pros: **zero-diff by construction** — every call site keeps its exact resolved value; no combination is merged, because nothing pairs properties together. Establishes the two-tier structure (raw behind semantic) the umbrella requires, and admits a re-skin (remap Tier 2 → new raw) without app-CSS change. Leaves the *richer* role bundles to a later, intentional story that is permitted to make the role-mapping design call. Mirrors ADR 0040's resolution exactly: the color story kept thin per-role aliases (`--u-border`, `--u-surface`, `--signal-*`) rather than inventing new composite roles, precisely to stay zero-diff.
- Cons: the semantic tier is thinner than the umbrella's `--u-text-*` bundle sketch; a call site still references three separate type tokens rather than one bundle. Accepted: thinness is the price of zero-diff, and the bundle is a clean later addition once roles are designed. The ADR records the deferral explicitly so the umbrella's bundle vision is not lost.

**Chosen: Option E (raw + thin per-property semantic aliases).** Bundles are deferred to a later, intentional story under the ADR 0039 visual-change discipline.

### Handling the runtime-injected TSX font literals

#### Option F — Re-source from a typed `@unbnd/ui` constant (the Story-40 `SEMANTIC_COLORS` mechanism)

Mint a `TYPE_SCALE` TS constant in `@unbnd/ui` and have `NotFound.tsx`/`AuthWelcome.tsx` read `fontSize: TYPE_SCALE.size13` etc., kept equal to the CSS raws by an equality guard.

- Pros: symmetric with the color story; one TS source for the runtime-injected path.
- Cons: **over-engineered for the actual surface.** Story 40 needed `SEMANTIC_COLORS`/`GENRE_PALETTE` because the color values were threaded through *reusable component props* (`logoFill`, the `Avatar`/`view-model` palette consumed by a runtime hash) where the value genuinely had to be a shared, order-load-bearing constant. Here the font literals are **one-off inline styles on two leaf route components**, not props, not shared, not hashed. A `TYPE_SCALE` constant whose only readers are two JSX `style` objects is dead weight. Rejected unless the simpler path cannot keep the guard honest — and it can.

#### Option G — Move the inline type styles into each route's CSS, deleting the JSX literals (CHOSEN)

`NotFound.tsx` and `AuthWelcome.tsx` already use CSS for their neighbors; the handful of inline `style={{ fontSize, fontWeight, lineHeight, letterSpacing }}` entries move into the route's stylesheet (`NotFound.css` / the existing auth CSS) referencing the new semantic type tokens, exactly like every other call site. The non-type inline properties on those same `style` objects (`padding`, `marginBottom`, `textAlign`, `color: var(--u-muted)`) are left inline (this story is type-only; spacing is a later axis and color already references a token). `Avatar.tsx:43`'s computed `fontSize: Math.round(size * 0.4)` stays as-is (it is not a literal).

- Pros: **deletes the off-CSS literal surface entirely** rather than relocating it to TS, so the type guard only ever needs to scan CSS for the size/weight/leading axes (no TS-side type-literal allowlist needed). Each migrated value flows through the same semantic-token path as every CSS call site — one mechanism, not two. No new TS constant, no new equality guard. Zero-diff: same resolved values, just authored in CSS. (`NotFound` is not in the Story-39 six-screen baseline set, but `AuthWelcome` is; both are held to the same zero-diff bar regardless.)
- Cons: `NotFound.tsx` needs a small new `NotFound.css` (it currently has none) and a `className`. A minor structural touch to a leaf route, fully behavior-preserving. The guard must still scan `.tsx` for the size/weight axes to catch *future* inline literals (green on landing because these two are swept), so the TS-side scan is retained as a regression net even though no allowlist entry is needed.

**Chosen: Option G.** The runtime-injected literals are swept into CSS, not re-sourced into TS. The guard keeps a `.tsx` scan as a forward regression net (it is green on landing, having no remaining inline type literals, and `Avatar`'s computed value is not a literal so it is not matched).

## Decision

We choose **Option B** (value-keyed raw names) for sizes/line-heights/letter-spacings and the **weight keyword ladder** for weights; **Option E** (raw + thin per-property semantic aliases, bundles deferred); and **Option G** (sweep the runtime-injected TSX font literals into CSS, no TS constant). Together they deliver the two-tier type model across all four properties in scope while holding every resolved value byte-identical.

### 1. Two-tier type taxonomy

**Tier 1 — raw type tokens.** Literal values only, no semantics. Naming `--u-raw-<axis>-<value-key>`, one token per distinct value actually in use (no speculative steps), units kept as authored (no rem→px). Representative set (full list is the inventory above):

- **sizes** `--u-raw-font-size-*`: `-9: 9px`, `-10: 10px`, `-11: 11px`, `-12: 12px`, `-13: 13px`, `-14: 14px`, `-15: 15px`, `-16: 16px`, `-17: 17px`, `-18: 18px`, `-20: 20px`, `-22: 22px`, `-24: 24px`, `-26: 26px`, `-28: 28px`, `-30: 30px`, `-38: 38px`, plus the four rems `-85rem: 0.85rem`, `-90rem: 0.9rem`, `-92rem: 0.92rem`, `-95rem: 0.95rem`. (21 tokens.)
- **weights** `--u-raw-weight-*`: `-regular: 400`, `-medium: 500`, `-semibold: 600`, `-bold: 700`. (4 tokens, the one honest ordinal ladder.)
- **line-heights** `--u-raw-leading-*`: `-0: 0`, `-100: 1`, `-120: 1.2`, `-125: 1.25`, `-130: 1.3`, `-140: 1.4`, `-150: 1.5`, `-155: 1.55`, `-160: 1.6`, `-165: 1.65`, `-170: 1.7`, `-175: 1.75`. (12 tokens.)
- **letter-spacings** `--u-raw-tracking-*`: `-0: 0`, `-n10: -0.1px`, `-n20: -0.2px`, `-n30: -0.3px`, `-n40: -0.4px`, `-n50: -0.5px`, `-n60: -0.6px`, `-n70: -0.7px`, `-n110: -1.1px`, `-p10: 0.1px`, `-p20: 0.2px`, `-p30: 0.3px`, `-p40: 0.4px`, `-p50: 0.5px`, `-p100: 1px`, `-p02em: 0.02em`, `-p04em: 0.04em`. (17 tokens.)
- **families** `--u-raw-family-sans` and `--u-raw-family-mono` (see §4).

**Tier 2 — semantic / per-property aliases.** Point at Tier 1, never a literal. App CSS references only Tier 2. Default is a thin value-keyed alias per property (`--u-font-size-13: var(--u-raw-font-size-13)`, `--u-font-weight-semibold: var(--u-raw-weight-semibold)`, `--u-leading-160: var(--u-raw-leading-160)`, `--u-tracking-n30: var(--u-raw-tracking-n30)`), so every existing call site swaps its literal for the matching alias with no resolved-value change. The Implementer MAY give a small number of unambiguous aliases a readable role name (e.g. `--u-leading-body`, `--u-tracking-tight`) **only** where the rename does not merge two distinct values onto one alias; when in doubt, keep the value-keyed alias. A re-skin remaps Tier 2 → new raw values; app CSS, referencing only Tier 2, does not change. Authoring richer composite role bundles (`--u-text-body` etc.) is deferred (see Out of scope).

### 2. Property scope

In scope and tokenized + guarded this story: **font-size, font-weight, line-height, and letter-spacing.** The story's PO read was "stay aligned to the ADR's named trio (size, weight, line-height) unless the Architect finds a reason to include letter-spacing." The reason is here and decisive: the audit found **36 `letter-spacing` declarations across 17 distinct values**, a literal surface as real as line-height's. Leaving it untokenized would force the guard's allowlist to be dishonestly broad (it would have to tolerate `letter-spacing` literals app-wide) and would leave a second type-literal sweep for a later story for no benefit. Including it now is the same mechanical move as the other three and keeps the guard honest. `font-style`/`font-variant`/`font-feature-settings`/`text-transform` are **not** type *scale* values and are not tokenized (none carry a numeric scale literal; `text-transform: uppercase` etc. are keywords). The `font: inherit` shorthand (3 sites) is keyword-only and untouched.

### 3. Bundles vs aliases

Per-property thin semantic aliases now (Option E); composite role bundles (`--u-text-{body,heading,caption}` pairing size+weight+leading) deferred to a later, intentional story that is permitted to make the role-mapping design call under the ADR 0039 visual-change discipline. Reason: bundling pairs properties together and would merge near-identical-but-unequal combinations, moving pixels and failing the zero-diff gate; the honest role mapping is a design decision, not a mechanical refactor.

### 4. The family fold (zero-diff)

`--font-sans` and `--font-mono` move into the type tier as two-tier:

- **Tier 1:** `--u-raw-family-sans: <the current --font-sans stack>`, `--u-raw-family-mono: <the current --font-mono stack>` (the exact stacks now in `tokens.css` lines 219–223, byte-for-byte).
- **Tier 2:** the existing names are **kept and repointed** so call sites do not change (zero churn, zero diff), exactly as ADR 0040 kept `--u-ink`/`--signal-*`: `--font-sans: var(--u-raw-family-sans)` and `--font-mono: var(--u-raw-family-mono)`. The 9 app-CSS `var(--font-sans)`/`var(--font-mono)` references resolve unchanged.

The Implementer MAY additionally add `--u-family-sans`/`--u-family-mono` as `--u-`-prefixed Tier-2 aliases for naming consistency with the rest of the type tier, but **MUST NOT** rename or remove `--font-sans`/`--font-mono` in this story (renaming would either churn the 9 call sites or leave a half-migrated alias state — the exact anti-pattern ADR 0040's gate rejected for `--signal-*`). No family literal is duplicated: the stacks live once, in the Tier-1 raws.

### 5. The type CI guard

One new guard, `packages/ui/test/architecture-type-literals.test.ts`, mirroring `architecture-color-literals.test.ts` (`REPO` resolve, `SCAN_ROOTS = [apps/web/src, packages/ui]`, `walk()` collecting `.css/.ts/.tsx` excluding `.test.*`, `SKIP_DIRS = {node_modules, dist, .git, engineering-team, e2e, data, test}`, single aggregated `expect(offenders).toEqual([])`). It runs under the existing `pnpm -r test`.

**Scope and patterns.** The guard scans for raw type *literals* outside the token layer. An offender is any match outside the allowlist. Patterns (each authored to match a property's value, not its appearance inside a `var(--…)` reference or a comment):

- **CSS `font-size` literal:** a `font-size:` declaration whose value is a bare `<number>px` or `<number>rem` (i.e. not `var(--…)`, not `inherit`/`initial`/`unset`/`smaller`/`larger`). Pattern keys on the property name followed by a value that contains a digit-unit literal and no `var(`.
- **CSS `font-weight` literal:** `font-weight:` whose value is a bare numeric (`100`–`900`) or one of the literal keywords `bold`/`normal` used as a weight, and not `var(--…)`/`inherit`. (The four real values are numeric; `bold`/`normal` are included so a future keyword literal is also caught.)
- **CSS `line-height` literal:** `line-height:` whose value is a bare number (unitless or with a unit) and not `var(--…)`/`inherit`/`normal`.
- **CSS `letter-spacing` literal:** `letter-spacing:` whose value is a bare `<number>px`/`<number>em` (or `0`) and not `var(--…)`/`inherit`/`normal`.
- **TSX inline `font*` literal (forward regression net):** in `.ts/.tsx`, an inline-style key `fontSize`/`fontWeight`/`lineHeight`/`letterSpacing` assigned a *literal* (a numeric literal or a quoted string literal such as `"-0.6px"`). A value that is an *expression* (e.g. `Math.round(size * 0.4)`, a variable, a token-reading call) is **not** a literal and is not matched, so `Avatar.tsx:43` passes. `font-family`/`fontFamily` literals are also caught so the family fold cannot be bypassed inline.

`font-family` in CSS is already token-referenced (`var(--font-*)`) or `inherit`, so it produces no offenders; the guard nonetheless flags any bare `font-family:` string literal to lock the family fold.

**Allowlist (names ONLY legitimate token-source files).** The single legitimate home for type literals is the token sheet:

- `packages/ui/styles/tokens.css` (the Tier-1 raw type literals live here).

No TS file is allowlisted: per Option G the runtime-injected literals are swept into CSS, not into a TS constant, so there is no `type-scale.ts` to exempt. (If the Implementer ever finds a genuinely shared, prop-threaded type value that must live in TS — none exists today — that would be a new allowlisted source file recorded by amendment, mirroring how `colors.ts`/`palette.ts` were allowlisted in ADR 0040. It is not needed now.) `apps/web/src/data` and `apps/web/e2e` are scope-excluded via `SKIP_DIRS`, consistent with the color guard. The `@unbnd/ui` `test/` dir is skipped (it holds these guards, which name literals as test expectations).

**Green on landing, red on regression.** The sweep removes every type literal from app CSS and the two TSX files first; the guard is then green the moment it lands and red forever after on any new raw `font-size`/`font-weight`/`line-height`/`letter-spacing` outside `tokens.css`, exactly as ADR 0038 §6 requires.

**The Story-40 color guards are untouched** and stay green; this story only adds a file under `packages/ui/test/`.

## Consequences

- **Enables** a future type overhaul (a new scale, a new heading weight, a typeface change) as a Tier-2-to-raw remap with no app-CSS change, and a future `[data-theme]` skin's type overrides. Folds the families into the same two-tier model as every other type value, so there is one source for family stacks.
- **Constrains** all future type work: new sizes/weights/line-heights/letter-spacings must go through Tier-2 tokens (CSS); inline JSX font literals are forbidden by the guard's `.tsx` scan. The guard makes this real, not advisory.
- **New debt / follow-ups:** (1) composite semantic role bundles (`--u-text-{body,heading,caption}`) are deferred to a later intentional story that designs the roles and is allowed to move values under ADR 0039; (2) a genuinely rationalized type scale that collapses near-duplicate sizes/line-heights/letter-spacings onto a cleaner ramp (and the px/rem unit split) is a separate visual-change story, not this refactor; (3) the value-keyed raw names are a literal registry by design — when the rationalized scale lands, that story may introduce ordinal raw names then.
- **Affects existing fixtures?** No. No data fixtures change. The two TSX route files (`NotFound.tsx`, `AuthWelcome.tsx`) lose inline type literals to CSS with byte-identical resolved values; `NotFound.tsx` gains a small `NotFound.css` and a `className`. The Story-39 `visual` job confirms zero-diff.
- **New dependency?** No. The guard is a new Vitest test in the existing `packages/ui/test/`. No new third-party dependency, no new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes. Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors for the Implementer (Architect is read-only on source; these are the targets, not edits made here):

- **Token sheet:** `packages/ui/styles/tokens.css` — add a Tier-1 raw type block (`--u-raw-font-size-*` ×21, `--u-raw-weight-*` ×4, `--u-raw-leading-*` ×12, `--u-raw-tracking-*` ×17, `--u-raw-family-sans`/`-mono` holding the current stacks); add the Tier-2 per-property aliases (`--u-font-size-*`, `--u-font-weight-*`, `--u-leading-*`, `--u-tracking-*`) each `var()`-pointing at its raw; repoint `--font-sans`/`--font-mono` to `var(--u-raw-family-*)` (keep those names). Leave all color, radius, and page tokens exactly as they are.
- **App CSS sweep:** replace every raw `font-size`/`font-weight`/`line-height`/`letter-spacing` literal across `apps/web/src/**/*.css` with the matching Tier-2 alias `var(--…)`. Preserve `14px !important` as `var(--u-font-size-14) !important` (the flag stays at the call site). Keep rem values referencing their rem-named tokens (no conversion). `font: inherit` (3 sites) is untouched.
- **Runtime-injected literals:** `routes/NotFound.tsx` — add `NotFound.css`, move the `fontSize/fontWeight/letterSpacing/fontSize/fontSize/fontWeight` inline literals into it as token references via a `className`, leave the non-type inline props (`padding`, `margin*`, `textAlign`, `color: var(--u-muted)`, `color: var(--u-amber)`) inline. `routes/AuthWelcome.tsx` — move the `fontSize: 11` and `lineHeight: 1.5` from the inline `style` into the existing auth CSS via a class (or the nearest existing class), leaving non-type props inline. `components/Avatar.tsx:43` — **no change** (computed value, not a literal).
- **Guard:** `packages/ui/test/architecture-type-literals.test.ts`, copying `architecture-color-literals.test.ts` structure, `walk()` over `.css/.ts/.tsx`, `SKIP_DIRS` as listed, allowlist `{ packages/ui/styles/tokens.css }`, patterns per §5 (CSS size/weight/leading/tracking literals; TSX inline `font*` literals matching only literals, never expressions). It runs under the existing `pnpm -r test`.
- **Verification gate:** after the sweep, `pnpm -r typecheck`, `pnpm -r test` (the new type guard + the existing color guards + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job must all pass, the last zero-diff with **no baseline update**.

## Out of scope

- **Type-scale rationalization.** Every distinct font-size, font-weight, line-height, and letter-spacing value is preserved exactly; no near-values are consolidated onto a cleaner ramp, and no rem is converted to px (both would move pixels and the Story-39 gate would correctly fail). A genuinely rationalized type scale is a separate, intentional visual-change story under the ADR 0039 discipline. This is the central constraint of the story.
- **Composite semantic role bundles** (`--u-text-{body,heading,caption}` pairing size+weight+leading). Deferred to a later intentional story that designs the roles; bundling near-unequal combinations now would break zero-diff.
- **Any other token axis:** color (done, Story 40), spacing, radii, elevation, z-index, motion, breakpoints (epic stories 5+). Non-type token-sheet entries are left exactly as they are, except the family fold.
- **Re-sourcing the runtime-injected font values into a TS constant.** The two TSX surfaces are one-off inline styles, not shared props; they are swept into CSS (Option G), not relocated to a `TYPE_SCALE` TS module. If a shared prop-threaded type value ever appears, that is a later allowlisted TS source by amendment.
- Primitives, the icon registry / `<Icon>` abstraction, the motion layer, and layout primitives (later epic stories).
- Authoring a dark theme or any second skin (ADR 0038; epic story 13). The two-tier type structure must admit one; building one is later work.
- Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui` and citing the new guard (epic story 14).
- Any behavior, copy, or information-architecture change. The only visible change permitted is none, proven zero-diff against the Story-39 harness.
