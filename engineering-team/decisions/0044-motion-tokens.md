# ADR 0044: Two-tier motion tokens (durations / easings), the `transition`-shorthand sweep, the global reduced-motion block, and the motion CI guard

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/done/44-motion-tokens.md`

**Approved 2026-06-03** at the architecture gate. Gate resolutions (recommended defaults): (1) easing raw token `--u-raw-ease-default: ease` (readable, over an awkward value-keyed spelling); (2) reduced-motion zeroes the semantic `--u-duration-*` aliases to **`0.01ms`** (not `0ms`, so `transitionend` still fires); (3) FollowButton's `0.15s` maps to a `150ms`-authored token (computed-identical, zero-diff). 6 distinct durations (120/140/160/180/200ms + 0.15s≡150ms), 1 easing (`ease`). Transition shorthand kept, each duration/easing component → `var()`. The reduced-motion block is the one intentional, ADR-0038-sanctioned accessibility addition; it is inert at the no-preference state the Story-39 harness captures, so the default render stays zero-diff.

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03, §1 two-tier token layer incl. the motion tokens and the reduced-motion mechanism, §6 CI guards, §7 package shape). Mirrors the accepted **ADR 0040** (color), **ADR 0041** (type), **ADR 0042** (spacing), and **ADR 0043** (radii / elevation / z-index / breakpoints): raw value-keyed Tier 1 behind thin semantic Tier-2 aliases, existing names kept and repointed (no rename, no cosmetic unification), no premature semantic role bundles, a guard under `packages/ui/test/` copying `packages/trust/test/architecture.test.ts`, and the zero-diff D2 discipline that mints a token equal to the current resolved value rather than consolidating. The `transition`-shorthand handling echoes ADR 0042's multi-value spacing-shorthand handling and ADR 0043's box-shadow handling (keep the unit of authorship intact; swap each length/easing component for a `var()`). Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job at `maxDiffPixelRatio: 0`, single viewport 1280×800, captured at the no-preference media state with animations frozen, and the rule that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 7, the motion axis and the last of the token-ish axes). This ADR resolves the raw duration/easing naming, the `0.15s`-vs-`150ms` notation case, the `transition`-shorthand handling, the exact reduced-motion mechanism (which tier it overrides, the zero value, the default-baseline-zero-diff confirmation), the `animation`/`@keyframes` defensive-coverage question, the `scroll-behavior`/broader-reset question, the TSX-net question, and the guard scope. It does not relitigate 0038, 0039, 0040, 0041, 0042, or 0043.

## Context

Motion is the fifth and last token axis of the design-system overhaul (color, type, spacing, radii/elevation/z-index are done; motion remains). The umbrella (ADR 0038 §1) sets the target: a two-tier token layer in `@unbnd/ui` where Tier 1 is a raw scale of literal motion values (`--u-raw-duration-{instant,fast,base,slow}`, `--u-raw-ease-{standard,emphasized,exit}`) and Tier 2 is semantic aliases (`--u-duration-control`, `--u-ease-control`) that point at Tier 1 and never at a literal; app CSS references only Tier 2. ADR 0038 §1 also names the one behavior addition verbatim: **"a global `@media (prefers-reduced-motion: reduce)` block in `@unbnd/ui` zeroes the motion-duration tokens, so every motion that reads the tokens degrades automatically."** ADR 0038 §6 names the guard: **"No raw `transition`/`animation` durations or easings outside the motion layer,"** plus (epic story-7 line) **"presence of the reduced-motion block."**

This story carries **two load-bearing constraints**, both quoted from the story:

- **Constraint 1 — No consolidation.** Mint one token per distinct in-use value. Do not snap `120ms`/`140ms`/`160ms`/`180ms`/`200ms` onto a "cleaner" set; keep the single easing as it is. The `0.15s` form is the specific instance: either preserve it byte-identically or treat it as the same value as a `150ms` token, **acceptable only if the resolved declaration is byte-identical and no other near-value is snapped onto it**. A genuine motion-scale rationalization is a separate, intentional motion-design story.
- **Constraint 2 — The reduced-motion block is a DELIBERATE ACCESSIBILITY ADDITION, not pure refactor.** Tokenizing the durations/easings is zero-diff (it changes where a value is defined, not what it is; the Story-39 harness, capturing at no-preference with animations frozen, confirms the default render is byte-identical). Adding a global `@media (prefers-reduced-motion: reduce)` block that zeroes the duration tokens is **net-new behavior** for users who request reduced motion — there is none today, an accessibility gap. It is the one intentional behavior change and is sanctioned by ADR 0038 §1. It does **not** change the default-state render (the harness captures at the no-preference media state), so the baseline stays zero-diff and no baseline is updated.

### Acceptance criteria (quoted from the story)

- Motion tokens are two-tier: a raw tier of literal duration/easing values (per ADR 0038 §1 Tier-1 naming, following the Story-41–43 value-keyed-raw approach) and semantic motion aliases that reference the raw tier and never a literal; the app references the semantic tier.
- After the sweep, no raw transition/animation duration or easing literals (`ms`/`s` durations; timing-function values `ease`/`ease-in`/`linear`/`cubic-bezier(...)`) remain outside the token layer; transition timing and easing reference the motion tokens.
- Every distinct in-use duration and easing is migrated to a raw token preserving it exactly; no near-durations consolidated, easing not retuned, every resolved transition byte-identical. The `0.15s`-vs-`150ms` case is resolved such that the resolved declaration is byte-identical and no other value is snapped onto it.
- `transition` shorthands (single-layer and comma-separated multi-layer) migrate with the property name and the layer structure preserved, each duration → a duration token, each easing → an easing token, byte-identical; mirrors the Story-42/43 multi-value/shorthand approach. Any longhands or `animation` declarations present are handled the same way.
- A UA reporting `prefers-reduced-motion: reduce` gets a global `@media` block from `@unbnd/ui` that zeroes the motion-duration tokens so every token-driven transition degrades to instant. This is the only intentional behavior addition.
- At the default (no-preference) media state, the render is byte-identical to before this story; the reduced-motion block does not affect it.
- The new motion guard scans app CSS for raw transition/animation duration/easing literals outside the token layer and finds none, AND asserts the presence of the reduced-motion block, and passes; its allowlist names only legitimate token-source files.
- The Story-40 color guards, Story-41 type guard, Story-42 spacing guard, and Story-43 shape/breakpoint guards stay green.
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` all pass.
- The Story-39 `visual` job is zero-diff against committed baselines; no baseline is updated.

### Verified current state (read directly against the `story-44-motion-tokens` working tree, 2026-06-03)

The token sheet (`packages/ui/styles/tokens.css`) post-Story-43 carries the full two-tier color, type, spacing, radius, elevation, and z-index tiers, plus the `--page-max` / `--page-pad-x` layout tokens. **No motion is tokenized**; every transition timing and easing is a raw literal in component CSS.

**29 `transition:` declarations, across 23 CSS files, confirmed exactly** (`grep -rEn "^\s*transition\s*:"` → 29; the story and ADR 0038's audit both said 29). **Zero `@keyframes`, zero `animation` declarations, zero transition longhands** (`transition-duration` / `-timing-function` / `-delay` / `-property`), **zero `scroll-behavior`**, and **zero `prefers-reduced-motion` handling** anywhere in `apps/web/src` (all confirmed by direct grep). **Zero `transition` / `animation` strings and zero duration/easing literals in any `.tsx`** (confirmed): no runtime-injected motion exists.

**Distinct DURATION values (count = component-occurrence frequency), preserved exactly, no consolidation:**

| Duration | Occurrences | Notes |
|---|---|---|
| `120ms` | 35 | the dominant control transition |
| `140ms` | 3 | `ToggleSwitch.css` (×2), `CallToAction.css` (×1) |
| `160ms` | 2 | `GenreGrid.css` (transform + border-color) |
| `180ms` | 2 | `BookCard.css` (transform + box-shadow) |
| `200ms` | 1 | `PoVBar.css:89` (`width` track transition) |
| `0.15s` | 3 | `FollowButton.css` only (background-color / border-color / color), authored in **seconds** |

That is **6 distinct durations** (5 in `ms`, 1 in `s`). **The PO's read named only four (`120ms`/`140ms`/`200ms`/`0.15s`) and missed `160ms` and `180ms`;** the story explicitly leaves the per-value breakdown to the Architect ("the exact per-value breakdown is the Architect's and Implementer's to confirm; the PO does not enumerate it as a contract"), and this is that correction. All six are distinct in-use values and each gets its own token (Constraint 1).

**Distinct EASING values:** exactly **one** — `ease` (46 component-occurrences; it appears once per timing component across the single- and multi-layer transitions). No `ease-in`, `ease-out`, `ease-in-out`, `linear`, `step-*`, `cubic-bezier(...)`, or `steps(...)` anywhere (confirmed). This matches the PO's read.

**`transition` is a shorthand, and frequently multi-layer.** Of the 29 declarations, 17 are single-layer single-line (`transition: color 120ms ease`) and 12 are comma-separated multi-layer (`transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease`), several authored across multiple physical lines. Every declaration is `transition: <property> <duration> <easing>[, …]` — property name first, then duration, then easing; no `transition-delay` component, no longhand, no reverse-order or shorthand-omitted forms. The property name and the comma-separated layer structure are the unit of authorship and must be preserved; only the duration and easing components are literals to tokenize.

**The `0.15s` notation.** `FollowButton.css` (3 components) authors its duration in seconds; `0.15s` is the same **computed value** as `150ms` (CSS resolves both to 150 milliseconds). There is **no `150ms` literal anywhere else in the codebase** (confirmed), so `0.15s` is a fully isolated value: no other near-value can be snapped onto it, and tokenizing it cannot affect any other site. This is the per-value isolation Constraint 1 requires.

### Guard precedent

`packages/trust/test/architecture.test.ts` is the base pattern; the Story-42 `packages/ui/test/architecture-spacing-literals.test.ts` and Story-43 `architecture-shape-literals.test.ts` are the exact mirrors this guard follows: `REPO = resolve(__dirname,"..","..","..")`; `SCAN_ROOTS = [apps/web/src, packages/ui]`; `ALLOWLIST` set of repo-relative paths; `SKIP_DIRS = {node_modules, dist, .git, engineering-team, e2e, data, test}`; a `walk()` collecting `.css/.ts/.tsx` excluding `.test.*`; per-property regexes capturing the value to the declaration terminator; a parenthesis-aware `splitComponents()` so `var(...)` / `cubic-bezier(...)` are single atoms; TSX inline-style patterns matching numeric and quoted-string literals but never expressions; offenders aggregated into one `expect(offenders).toEqual([])`. `@unbnd/ui` runs `vitest run` under `pnpm -r test`, so a new guard in `packages/ui/test/` needs no wiring change. The motion guard adds one new assertion shape over the prior guards: a **presence** check (assert the reduced-motion block exists in the token sheet), which is a simple `readFileSync` + regex on the one allowlisted file.

### Constraints that bind this design

- **Zero-diff is the prime directive for the tokenization.** Every resolved transition (duration + easing) stays byte-identical; the Story-39 `visual` job stays zero-diff at the no-preference media state; no baseline is updated (ADR 0039). No near-duration consolidation, no easing retune, no unit change beyond what is proven identical-computed-value.
- **The reduced-motion block is the one intentional behavior addition** (Constraint 2), sanctioned by ADR 0038 §1, affecting only `prefers-reduced-motion: reduce` users, leaving the default-state render byte-identical.
- No new tooling. The guard is a Vitest test under the existing `pnpm -r test` (`CLAUDE.md`; ADR 0038 §6). `@unbnd/ui` exports raw `./src/index.ts` with no build step (ADR 0038 §7).
- No AI-slop in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- Motion axis only. The non-motion token-sheet entries are left exactly as-is. The motion util/`transition()` helper and the `matchMedia`-driven JS hook are epic stories 11, out of scope here.
- In-repo prior art governs; the Tapestry branch survey does not apply (ADR 0038; story "DList shapes touched: None").

## Options considered

The genuinely load-bearing decisions are (1) the **raw duration/easing naming** for a value set that is not a clean ramp, (2) the **`0.15s`-vs-`150ms` notation case**, (3) **how the `transition` shorthand is migrated**, and (4) the **reduced-motion mechanism** (which tier it overrides, the zero value, the default-baseline-zero-diff confirmation). Options are framed around those; the `animation`/`scroll-behavior`/TSX-net scope and the guard then follow.

### Naming the raw tier (durations / easings)

#### Option A — Ordinal / role scale, the shape ADR 0038 §1 sketches (`--u-raw-duration-{instant,fast,base,slow}`, `--u-raw-ease-{standard,emphasized,exit}`)

- Pros: reads as a designed ladder; matches the umbrella's example names.
- Cons: **dishonest for the actual value set and a zero-diff hazard.** The umbrella sketch assumes a tidy 4-step duration ramp and a 3-easing palette. `main` has **6 distinct durations** and **1 easing**. Mapping 6 durations onto `{instant,fast,base,slow}` either forces consolidation (snapping `160ms`/`180ms` together, which Constraint 1 forbids and the gate would catch as a feel change the frozen-animation capture cannot see) or invents off-ramp names (`fast`, `fast2`, …) implying a ladder relationship that does not exist; and there is exactly one easing, so a 3-name `{standard,emphasized,exit}` palette would mint two dead tokens (the "no speculative steps" rule the four prior axes held). This is the exact problem Stories 41–43 hit and resolved with value-keyed naming. Rejected for the raw tier.

#### Option B — Value-keyed naming, one raw token per distinct value, keyed to the value itself (CHOSEN)

Each distinct value becomes its own raw token whose name encodes the value, so the name cannot imply a consolidation that did not happen and every value stays individually addressable, exactly as ADR 0041 (`--u-raw-font-size-13` by px), ADR 0042 (`--u-raw-space-8` by px), and ADR 0043 (`--u-raw-radius-8` by px) resolved the same problem:

- **durations:** `--u-raw-duration-<n>ms` where `<n>` is the millisecond integer (`--u-raw-duration-120ms: 120ms`, `--u-raw-duration-200ms: 200ms`). The `0.15s` site is handled by the notation decision below.
- **easings:** one token for the single in-use timing function, keyed by the keyword: `--u-raw-ease-ease: ease`. (See the easing naming note below — the doubled `ease-ease` is awkward, so the chosen spelling is `--u-raw-ease-default: ease` with a comment binding it to the literal; the contract is one raw token per distinct timing function.)

- Pros: **honest and zero-diff by construction.** The name carries the value, so no ordering or consolidation is implied; a reader sees exactly which literal a token carries. A value added later gets a new token named the same way, with no pressure to renumber an ordinal scale. Mirrors the three prior value-keyed axes exactly: the raw tier is a literal-keyed registry, not a design vocabulary.
- Cons: the names are less "designed" than `{instant,fast,base,slow}`. Mitigated: the *semantic* Tier 2 is where readable role names would live; the raw tier is deliberately a literal-keyed registry. A future rationalized motion scale (a separate motion-design story) can introduce a clean ordinal raw set then, because that story is *allowed* to move values.

**Easing naming note.** With a single easing keyword, a strictly value-keyed name (`--u-raw-ease-ease`) is awkward. The chosen raw spelling is **`--u-raw-ease-default: ease`** (a readable name for "the one easing in use"), with the literal recorded in the token value and a comment. This is the same pragmatic adjustment ADR 0043 made for elevation (where a multi-component value had no clean numeric key, so a readable stable name was used). The contract — one raw token per distinct timing function, value verbatim — is unchanged; if a second easing is ever introduced, it gets its own raw token (`--u-raw-ease-<descriptor>`) keyed to that value.

#### Option C — Opaque sequential names (`--u-raw-duration-1 … -6`)

- Pros: stable count.
- Cons: opaque; a reader cannot tell `--u-raw-duration-3` from `--u-raw-duration-4` without the sheet, and inserting a value forces a renumber. Strictly worse than B for no benefit. Rejected (same as ADR 0041/0042 Option C).

**Chosen: Option B (value-keyed raw durations `--u-raw-duration-<n>ms`; one readable-named raw easing `--u-raw-ease-default` for the single in-use keyword).**

### The `0.15s`-vs-`150ms` notation case

`0.15s` (FollowButton's 3 components) and a hypothetical `150ms` are the **same computed value**; the only question is the authored form of the token and that the resolved declaration stays byte-identical. There is no `150ms` literal anywhere else, so the two cannot collide.

#### Option D — Mint a separate seconds-keyed raw token `--u-raw-duration-015s: 0.15s`, preserving the seconds notation byte-for-byte

- Pros: preserves the exact authored token *value string* (`0.15s`); maximally literal.
- Cons: introduces a **notation-keyed name** (`015s`) that is inconsistent with the `<n>ms` convention used for the other five durations, for a value that is *computationally* a millisecond duration like the rest. It also splits the duration registry across two notations for no behavior reason. The "byte-identical" requirement is about the **computed/resolved transition**, not the source string of a token definition — CSS resolves `0.15s` and `150ms` to the identical 150 ms, so a `150ms`-valued token at the FollowButton call site produces a byte-identical resolved transition. Rejected as needlessly inconsistent.

#### Option E — Normalize FollowButton's site onto a single millisecond-keyed token `--u-raw-duration-150ms: 150ms`, since it computes identically and no other value is snapped onto it (CHOSEN)

The FollowButton's three `0.15s` components each become `var(--u-duration-150ms)` (Tier-2 alias → `--u-raw-duration-150ms: 150ms`). The resolved transition duration is **150 ms either way**, so the declaration is byte-identical at compute time; the source merely reads `150ms` instead of `0.15s`.

- Pros: **one consistent `<n>ms` duration registry** (`120/140/150/160/180/200`), honest and uniform; no notation split. Zero-diff is satisfied because CSS computes `0.15s` ≡ `150ms` (the Story-39 frozen-animation capture is unaffected regardless, but the computed transition timing is provably identical). No other value is snapped onto `150ms` (Constraint 1 satisfied — `150ms` is the FollowButton value alone, isolated, with no near-value merged in). The decision is explicitly recorded as "the `0.15s` site maps to a token computing to 150 ms; the token is authored `150ms` for registry consistency; this is zero-diff because the computed duration is identical and `0.15s` does not coexist with any other `150ms` literal."
- Cons: the token's authored value string (`150ms`) differs from the call site's original string (`0.15s`). This is immaterial to the computed value and to the gate; the story explicitly authorizes "either choice is acceptable only if the resolved transition is byte-identical and no other near-value is snapped to it," and this satisfies that exactly. Recorded as a deliberate, value-stable normalization of notation only (not of value).

**Chosen: Option E (one `--u-raw-duration-150ms: 150ms` token; FollowButton's `0.15s` site resolves to it; zero-diff by identical computed duration; no other value snapped onto it).** This yields **6 raw duration tokens: `120ms, 140ms, 150ms, 160ms, 180ms, 200ms`.**

### `transition`-shorthand handling

#### Option F — Expand every `transition` shorthand to `transition-property` / `transition-duration` / `transition-timing-function` longhands, each referencing a token

- Pros: each component becomes a single-valued longhand.
- Cons: **high churn and a zero-diff hazard.** A multi-layer shorthand (`transition: a 120ms ease, b 120ms ease, c 120ms ease`) becomes three longhands each carrying comma lists (`transition-property: a, b, c; transition-duration: 120ms, 120ms, 120ms; transition-timing-function: ease, ease, ease`), tripling declarations and creating many hand-transcription chances to misalign a layer (the property↔duration↔easing positional correspondence must be reconstructed by hand). It changes the CSS structure (declaration count, cascade order) for no behavior gain, and is the exact anti-pattern ADR 0042 (Option D) rejected for spacing. Rejected.

#### Option G — Keep the `transition` shorthand and the per-layer structure; replace each duration component with `var(--u-duration-…)` and each easing component with `var(--u-ease-…)`; leave the property name untouched (CHOSEN)

CSS shorthands accept `var()` per component in any position, so the shorthand and the comma-separated layer structure are preserved and only the duration/easing literals change:

```css
/* before → after */
transition: color 120ms ease;
  →  transition: color var(--u-duration-120ms) var(--u-ease-default);

transition: width 200ms ease;
  →  transition: width var(--u-duration-200ms) var(--u-ease-default);

transition:
  transform 180ms ease,
  box-shadow 180ms ease;
  →  transition:
       transform var(--u-duration-180ms) var(--u-ease-default),
       box-shadow var(--u-duration-180ms) var(--u-ease-default);

transition:
  background-color 0.15s ease,        /* FollowButton */
  border-color 0.15s ease,
  color 0.15s ease;
  →  transition:
       background-color var(--u-duration-150ms) var(--u-ease-default),
       border-color var(--u-duration-150ms) var(--u-ease-default),
       color var(--u-duration-150ms) var(--u-ease-default);
```

- Pros: **least churn, structure preserved, zero-diff by construction.** Each duration/easing component swaps its literal for the matching alias; the resolved value is byte-identical because the alias chains raw → literal unchanged (and `0.15s`→`150ms` computes identically). The shorthand stays one declaration, the property name and comma-layer structure and cascade order are untouched, the diff is exactly the duration/easing substitutions. CSS fully supports `var()` inside any shorthand position. Mirrors ADR 0042's per-component `var()` substitution and ADR 0043's per-component radius substitution, extended to the two motion components.
- Cons: the guard must parse a `transition` value, split it into comma-separated layers and then space-separated components, and tell a token reference from a raw duration/easing literal while leaving the property name alone. This is a small extension of the spacing guard's `splitComponents()` (split on top-level commas first, then on whitespace; classify each component). Accepted: the guard complexity is contained and well worth avoiding the Option-F churn.

**Longhands / `animation` (none today).** No `transition-duration`/`-timing-function`/`-delay` longhands and no `animation`/`@keyframes` exist (confirmed). If any existed, the same rule applies: each duration component → a duration token, each easing component → an easing token, byte-identical; the property name / `@keyframes` selector / animation-name / iteration-count / direction / fill-mode keywords are preserved untouched. None is present to migrate; the **guard covers them defensively** (below) so a future one cannot land as a raw literal.

**Chosen: Option G (keep the shorthand, per-component `var()` substitution for duration and easing, property name untouched).**

### The reduced-motion mechanism

ADR 0038 §1 specifies "a global `@media (prefers-reduced-motion: reduce)` block in `@unbnd/ui` zeroes the motion-duration tokens, so every motion that reads the tokens degrades automatically." The decisions are: which token tier the block overrides, the exact zero value, where the block lives, and whether a broader reset (`scroll-behavior`, blanket `transition: none`) is warranted.

#### Option H — Override the RAW duration tokens under the media query

Redefine `--u-raw-duration-*: 0ms` (or near-zero) inside the media block.

- Pros: a single conceptual layer (the literals) is zeroed.
- Cons: the raw tier is the literal registry; zeroing it conceptually conflates "the literal value of fast" with "the active duration under reduced motion." More importantly, it is **redundant work** — every app-CSS transition references the *semantic* alias (`var(--u-duration-120ms)`), so overriding the semantic tier is sufficient and is the layer the app actually reads. Overriding raw would still flow through to the alias, but it is the wrong layer to express a *role-level* policy ("durations are off"). Not chosen, though not harmful.

#### Option I — Override the SEMANTIC duration aliases under the media query, to `0.01ms`; do not touch easings or `scroll-behavior`; minimal token-zeroing only (CHOSEN)

A single global block in the token sheet redefines every Tier-2 duration alias to a near-zero value:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --u-duration-120ms: 0.01ms;
    --u-duration-140ms: 0.01ms;
    --u-duration-150ms: 0.01ms;
    --u-duration-160ms: 0.01ms;
    --u-duration-180ms: 0.01ms;
    --u-duration-200ms: 0.01ms;
  }
}
```

- **Which tier:** the **semantic Tier-2 duration aliases** (`--u-duration-*`), because that is the tier app CSS references; redefining it under the media query makes every token-driven transition collapse to (near-)instant automatically, with no per-component or per-easing change. The easing aliases are deliberately **not** touched: a transition over `0.01ms` is imperceptible regardless of its easing curve, so zeroing duration alone fully satisfies "degrades to instant"; touching easing would add noise for no behavioral gain.
- **The exact zero value: `0.01ms`, not `0ms`.** `0.01ms` is functionally instantaneous (sub-frame) yet keeps the transition technically "running," which fires `transitionend` events that some interaction code relies on; a literal `0ms` can suppress `transitionend` entirely. This is the widely-used reduced-motion idiom and the safer choice for not silently breaking any future JS that awaits a transition. (No such JS exists today, but the idiom costs nothing and is forward-safe.)
- **Where it lives:** in the token sheet `packages/ui/styles/tokens.css`, immediately after the motion Tier-2 block, so it ships with the tokens as one unit (ADR 0038 §1 "a global block in `@unbnd/ui`"). It is one self-contained block; no separate file.
- **Default-baseline zero-diff confirmation:** the block is scoped entirely inside `@media (prefers-reduced-motion: reduce)`. At the **no-preference** media state — which is what the Story-39 harness captures (and it additionally freezes animations) — the block does not apply, so every `--u-duration-*` alias resolves to its full value and every transition is byte-identical to before this story. **No baseline is updated.** This is the load-bearing confirmation: the tokenization + this block leave the default render unchanged, and the reduced-motion behavior is observable only under the reduce media state, which the gate does not capture and does not need to (it is the intended, ADR-sanctioned net-new behavior).
- **`scroll-behavior` / broader reset: NOT added.** The story's out-of-scope fence says a broader reset is the Architect's call only if needed to honor "every motion that reads the tokens degrades automatically." Here the analysis is decisive: **every** motion on `main` is a `transition` that reads a duration token (no `animation`, no `scroll-behavior: smooth`, no JS-driven motion — all confirmed), so zeroing the duration aliases degrades **100%** of in-use motion. There is no untokenized motion left firing, so a blanket `transition: none` / `animation: none` / `scroll-behavior: auto` reset would protect nothing today and would be a heavier, less surgical mechanism than ADR 0038 §1 specifies. The minimal token-zeroing is both sufficient and the ADR's stated mechanism.

- Pros: **exactly the ADR 0038 §1 mechanism, minimally and surgically.** One block, six alias overrides, near-zero value, ships with the tokens, default render provably untouched, 100% of in-use motion covered. Honest framing: the duration/easing tokenization is the behavior-preserving refactor; this block is the one intentional accessibility addition layered on top.
- Cons: a *future* `animation` or `scroll-behavior: smooth` added without reading a duration token would not be caught by this block. Mitigated two ways: (1) the guard covers `animation`/longhands defensively, so a future raw `animation` duration/easing literal fails CI and must go through a token; (2) the ADR records that if a future motion type is added that does not reduce to a duration token (e.g. `scroll-behavior`), that story extends the reduced-motion block at that time. This is a forward note, not a gap today.

**Chosen: Option I (override the semantic `--u-duration-*` aliases to `0.01ms` inside a single global `@media (prefers-reduced-motion: reduce)` block in the token sheet; easings untouched; no `scroll-behavior`/blanket reset; default no-preference render byte-identical, no baseline update).**

### `animation` / `@keyframes`, `scroll-behavior`, and the TSX net (defensive scope)

- **`animation` / `@keyframes` / transition longhands:** none exist today. **Decision: the guard covers them defensively** (flags raw duration/easing literals in `animation`, `transition-duration`, `transition-timing-function`, `animation-duration`, `animation-timing-function`) so a future one cannot land as a raw literal outside the token layer. The token model needs no new tokens for them (there is nothing to migrate); a future `animation` would reference the same duration/easing aliases. `@keyframes` *blocks* define no durations/easings themselves (those live on the `animation` shorthand), so the guard does not need to parse keyframe interiors.
- **`scroll-behavior`:** none today; not tokenized (it is a behavior keyword, not a duration/easing). The guard does not scan it. Recorded as the forward note in Option I.
- **TSX net:** zero motion in TSX today (confirmed). **Decision: the guard scans `.ts/.tsx` defensively** for inline-style `transition` / `transitionDuration` / `transitionTimingFunction` / `animation` / `animationDuration` / `animationTimingFunction` keys assigned a duration/easing literal (numeric+unit string or `ease`/`cubic-bezier(...)` string), never an expression — mirroring the spacing/shape guards' forward TSX net. Green on landing, red if inline motion ever appears.

## Decision

We choose **Option B** (value-keyed raw durations `--u-raw-duration-<n>ms`; one readable raw easing `--u-raw-ease-default` for the single in-use keyword), **Option E** (the `0.15s` site maps to a `150ms`-authored token; zero-diff by identical computed duration; no other value snapped onto it), **Option G** (keep the `transition` shorthand, per-component `var()` substitution for duration and easing, property name untouched), and **Option I** (reduced-motion = a single global `@media (prefers-reduced-motion: reduce)` block zeroing the semantic `--u-duration-*` aliases to `0.01ms`, easings untouched, no broader reset, default render byte-identical). The guard covers `animation`/longhands and TSX defensively. Together these deliver the two-tier motion model across all 29 transitions, hold every resolved transition byte-identical at the no-preference state, and add the one ADR-0038-sanctioned reduced-motion accessibility behavior.

### 1. Two-tier motion taxonomy

**Tier 1 — raw motion tokens.** Literal values only, one per distinct in-use value, no semantics:

```css
/* durations — px-style value-keyed by the millisecond integer; the FollowButton
 * 0.15s site is authored here as 150ms (identical computed duration, registry
 * consistency, zero-diff — ADR 0044 Option E). No speculative steps. */
--u-raw-duration-120ms: 120ms;
--u-raw-duration-140ms: 140ms;
--u-raw-duration-150ms: 150ms;
--u-raw-duration-160ms: 160ms;
--u-raw-duration-180ms: 180ms;
--u-raw-duration-200ms: 200ms;

/* easings — exactly one timing function in use today (`ease`); a readable name
 * for the single keyword (value verbatim). A second easing, if ever added, gets
 * its own raw token keyed to its value. */
--u-raw-ease-default: ease;
```

6 raw duration tokens + 1 raw easing token.

**Tier 2 — semantic motion aliases.** Point at Tier 1, never a literal. App CSS references only Tier 2. The conservative default, mirroring the four prior axes, is a **thin value-keyed alias** per duration plus the one easing alias:

```css
--u-duration-120ms: var(--u-raw-duration-120ms);
--u-duration-140ms: var(--u-raw-duration-140ms);
--u-duration-150ms: var(--u-raw-duration-150ms);
--u-duration-160ms: var(--u-raw-duration-160ms);
--u-duration-180ms: var(--u-raw-duration-180ms);
--u-duration-200ms: var(--u-raw-duration-200ms);
--u-ease-default: var(--u-raw-ease-default);
```

Every existing duration/easing component swaps its literal for the matching alias with no resolved-value change. A re-skin (a snappier or slower motion feel) remaps Tier 2 → new raw values, or remaps a richer role tier (below) onto new raws; app CSS, referencing only Tier 2, does not change.

**Why thin per-value aliases and not richer role tokens (`--u-duration-control`, `--u-ease-control`) now.** ADR 0038 §1 sketches role aliases. A role tier is the eventual design vocabulary, but minting it now is a **consolidation decision and a zero-diff hazard**, the same trap ADR 0041 §3 (type bundles), ADR 0042 §1 (spacing roles), and ADR 0043 (radius/elevation roles) all deferred: the real call sites do not cluster onto a small set of clean role durations (six distinct durations are used across different interaction kinds), so mapping them onto `--u-duration-control` etc. would either merge near-unequal values (changing a motion's feel, which the frozen-animation gate cannot see) or invent off-ramp role names that are just the value-keyed aliases under a less honest name. The honest role mapping is a design decision, not a mechanical refactor. **Decision: thin per-value aliases now; richer role tokens (`--u-duration-control`/`--u-ease-control` etc.) are deferred** to a later intentional story that designs the roles under the ADR 0039 discipline (recorded in Out of scope). This is the exact precedent the four prior axes set.

### 2. The `transition` shorthand sweep (zero-diff)

The shorthand is **kept** (Option G). Each component is handled by kind:

| Component | Rule | Example |
|---|---|---|
| property name (`color`, `transform`, `width`, `background`, `border-color`, `box-shadow`, `background-color`) | **left untouched** | `color` → `color` |
| duration (`<n>ms`) | swap for `var(--u-duration-<n>ms)` | `120ms` → `var(--u-duration-120ms)` |
| duration (`0.15s`, FollowButton) | swap for `var(--u-duration-150ms)` (identical computed duration) | `0.15s` → `var(--u-duration-150ms)` |
| easing (`ease`) | swap for `var(--u-ease-default)` | `ease` → `var(--u-ease-default)` |
| comma between layers | **left untouched** (layer structure preserved) | `, ` → `, ` |

Every resolved declaration is byte-identical (the alias chains raw → literal unchanged; `0.15s` ≡ `150ms` at compute time). The shorthand stays one declaration; the property name, the comma-separated layer order, and the cascade are untouched. Worked examples are in Option G above. All 29 declarations (17 single-layer, 12 multi-layer) are swept this way; the FollowButton's 3 `0.15s` components are the only seconds-notation sites and all map to `--u-duration-150ms`.

### 3. The reduced-motion block (the one intentional accessibility addition)

A single global block lives in the token sheet immediately after the motion Tier-2 block:

```css
/* prefers-reduced-motion (ADR 0044 §3, sanctioned by ADR 0038 §1). The ONE
 * intentional behavior addition in Story 44: for users who have requested
 * reduced motion at the OS level, zero the semantic duration aliases so every
 * token-driven transition collapses to (near-)instant automatically. 0.01ms,
 * not 0ms, keeps transitionend firing (forward-safe for any future JS that
 * awaits a transition). Easings are untouched (a 0.01ms transition is
 * imperceptible regardless of curve). This block is INERT at the no-preference
 * media state, so the Story-39 visual baseline (captured at no-preference,
 * animations frozen) stays byte-identical — no baseline is updated. Every
 * motion on main today is a token-reading `transition`, so this covers 100% of
 * in-use motion; a broader transition:none / scroll-behavior reset is not
 * needed (ADR 0044, Option I). */
@media (prefers-reduced-motion: reduce) {
  :root {
    --u-duration-120ms: 0.01ms;
    --u-duration-140ms: 0.01ms;
    --u-duration-150ms: 0.01ms;
    --u-duration-160ms: 0.01ms;
    --u-duration-180ms: 0.01ms;
    --u-duration-200ms: 0.01ms;
  }
}
```

**This is the one behavior change; it is delineated and intentional.** The duration/easing tokenization (§1, §2) is a behavior-preserving refactor proven zero-diff by the Story-39 gate at the no-preference state. This block adds reduced-motion behavior for `prefers-reduced-motion: reduce` users only, sanctioned by ADR 0038 §1, and is inert at the default media state the gate captures.

### 4. The motion CI guard

One new guard, `packages/ui/test/architecture-motion-literals.test.ts`, mirroring `architecture-spacing-literals.test.ts` / `architecture-shape-literals.test.ts` (`REPO` resolve, `SCAN_ROOTS = [apps/web/src, packages/ui]`, `walk()` collecting `.css/.ts/.tsx` excluding `.test.*`, `SKIP_DIRS = {node_modules, dist, .git, engineering-team, e2e, data, test}`, parenthesis-aware `splitComponents()`, single aggregated `expect(offenders).toEqual([])`). It runs under the existing `pnpm -r test`. It carries **two assertions**: the literal scan (a), and the reduced-motion-block presence check (b).

**(a) Literal scan — scope and patterns.** Scans `.css` for motion-bearing declarations and `.ts/.tsx` for the forward net.

- **CSS properties matched:** `transition` (shorthand), `transition-duration`, `transition-timing-function`, `animation` (shorthand), `animation-duration`, `animation-timing-function`. (`transition-delay`/`animation-delay` carry durations too and are included for completeness; `transition-property`/`animation-name`/`animation-fill-mode` carry no duration/easing and are not scanned. `scroll-behavior` is not scanned — Option I.) The capture group is the value up to the declaration terminator (`;` or `}`).
- **Per-value parse:** split the captured value on **top-level commas** first (one segment per transition/animation layer, parenthesis-aware so a `cubic-bezier(0.4, 0, 0.2, 1)` comma is not a layer separator), then split each layer on whitespace at paren-depth 0 (`splitComponents()`). An **offender** is any component that is:
  - a **duration literal** — matches `^[+-]?\d*\.?\d+(ms|s)$` (e.g. `120ms`, `0.15s`) — i.e. a raw time value, OR
  - an **easing literal** — one of `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, `step-start`, `step-end`, or a `cubic-bezier(…)` / `steps(…)` function atom —
  that is **not** `var(--…)` (a token reference). So `transition: color var(--u-duration-120ms) var(--u-ease-default)` passes (property name `color` is neither a duration nor an easing literal; the other two are `var()`); `transition: color 120ms ease` is an **offender** (both `120ms` and `ease` are raw literals). Property names, `none`, `inherit`/`initial`/`unset`, the `0s`/`0ms` value (if any ever appears — value-stable, not flagged), and `var()` references are non-offenders.
  - **Parenthesis-aware** so `cubic-bezier()` / `steps()` are single atoms and a `var()` is one atom. A bare `cubic-bezier(...)`/`steps(...)` atom (not wrapped in `var()`) is itself an easing-literal offender.
- **TSX forward net:** inline-style keys `transition`, `transitionDuration`, `transitionTimingFunction`, `animation`, `animationDuration`, `animationTimingFunction` assigned a duration/easing **literal** (a quoted string containing a `ms`/`s` time or an easing keyword/`cubic-bezier`, or a bare numeric where a duration is expected) are offenders; an **expression** value is never matched (mirrors the spacing/shape guards). Green on landing (none exist), red on any future inline motion literal.

**(b) Reduced-motion-block presence assertion.** A second `it()` reads `packages/ui/styles/tokens.css` and asserts it contains a `@media (prefers-reduced-motion: reduce)` block (a whitespace-tolerant regex, e.g. `/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/`). This locks the accessibility addition so a later edit cannot silently remove it. (It asserts presence, per ADR 0038 §6 / the epic story-7 line; it does not assert the block's interior token list, to avoid coupling the guard to the exact alias spellings — the literal scan and the visual gate already cover the values.)

**Allowlist (names ONLY the legitimate token-source file):** `packages/ui/styles/tokens.css` (the Tier-1 raw duration/easing literals and the reduced-motion block live here). `apps/web/src/data`, `apps/web/e2e`, and `packages/ui/test` are scope-excluded via `SKIP_DIRS`, consistent with the prior guards. No TS file is allowlisted (no motion-scale TS constant exists; if the later motion-util story adds one, that story adds its file to the allowlist per ADR 0038 §6 — this story builds no util).

**Green on landing, red on regression.** The sweep removes every duration/easing literal from app CSS first; the guard is then green the moment it lands and red forever after on any new raw motion literal outside `tokens.css`, exactly as ADR 0038 §6 requires. The Story-40 color guards, Story-41 type guard, Story-42 spacing guard, and Story-43 shape/breakpoint guards are untouched and stay green; this story only adds one file under `packages/ui/test/`.

## Consequences

- **Enables** a future motion change (a snappier or slower feel, a different easing curve) as a Tier-2-to-raw remap with no app-CSS change, and a future `[data-theme]` skin's motion overrides. Completes the fifth and last token axis; the token sheet now models color, type, spacing, radii, elevation, z-index, and motion as two-tier, plus the canonical breakpoint source. **Closes the standing accessibility gap:** reduced-motion is now honored globally for the first time.
- **Constrains** all future motion work: new transition durations/easings must go through Tier-2 tokens (CSS); inline JSX motion literals are forbidden by the guard's `.tsx` scan; a future `animation` must reference the motion tokens (the guard covers it defensively). The guard makes this real, not advisory. The reduced-motion block is locked present by the guard.
- **New debt / follow-ups:** (1) richer semantic motion role tokens (`--u-duration-control`/`--u-ease-control` per ADR 0038 §1) are deferred to a later intentional story that designs the roles and is allowed to move values under ADR 0039; (2) a genuinely rationalized motion scale (collapsing `160ms`/`180ms` etc. onto a cleaner ramp, retuning the easing) is a separate visual-change motion-design story, not this refactor; (3) the value-keyed raw duration names are a literal registry by design — a future rationalized scale may introduce ordinal/role raw names then; (4) the motion util / `transition()` helper and the `matchMedia`-driven reduced-motion JS hook (ADR 0038 §4, epic story 11) are not built here; (5) if a future motion type that does not reduce to a duration token is added (`animation` with its own timing, `scroll-behavior: smooth`), that story extends the reduced-motion block to cover it.
- **Affects existing fixtures?** No. No data fixtures change. No TSX is touched (no inline motion literals exist). The migration repoints CSS duration/easing literals to tokens with byte-identical resolved values. The Story-39 `visual` job confirms zero-diff at the no-preference state; the reduced-motion block is inert there.
- **New dependency?** No. The guard is a new Vitest test in the existing `packages/ui/test/`. No new third-party dependency, no new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes (the reduced-motion addition is an accessibility improvement, not a product-surface change; it touches no §11.3 out-of-scope item). Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors for the Implementer (Architect is read-only on source; these are the targets, not edits made here):

- **Token sheet:** `packages/ui/styles/tokens.css` — add a new clearly-commented motion block after the z-index Tier-2 block and before the `--page-*` layout tokens: (a) **Tier-1 raw** `--u-raw-duration-{120ms,140ms,150ms,160ms,180ms,200ms}` + `--u-raw-ease-default: ease`; (b) **Tier-2 aliases** `--u-duration-{120ms,140ms,150ms,160ms,180ms,200ms}` + `--u-ease-default`; (c) the **reduced-motion `@media` block** (§3) overriding the six `--u-duration-*` aliases to `0.01ms`. Leave all color, type, spacing, radius, elevation, z-index, and `--page-*` tokens exactly as they are.
- **App CSS sweep:** across `apps/web/src/**/*.css`, in every `transition` declaration (29 sites, 23 files: `AuthForm`, `ReviewsList`, `FollowButton`, `BookCard`, `GenreGrid`, `Hero`, `Nav`, `ToggleSwitch`, `GenrePillSelector`, `Shelf`, `RatedByRow`, `PoVBar`, `AuthMethodCard`, `CallToAction`, `Footer`, `AuthShell`, `WhereToRead`, `Submit`), replace each `<n>ms` duration with `var(--u-duration-<n>ms)`, each `0.15s` (FollowButton, 3 components) with `var(--u-duration-150ms)`, and each `ease` with `var(--u-ease-default)`. Keep every property name, the comma-separated layer structure, and the multi-line formatting exactly. Per the §2 table.
- **No TSX changes** (no inline motion exists). **No `animation`/`@keyframes`/longhand/`scroll-behavior` changes** (none exist).
- **Guard:** `packages/ui/test/architecture-motion-literals.test.ts`, copying `architecture-spacing-literals.test.ts` structure (`REPO`, `SCAN_ROOTS`, `walk()` over `.css/.ts/.tsx`, `SKIP_DIRS`, `splitComponents`, single aggregated `expect`), with (a) the literal scan over the motion property set (split on top-level commas → layers → components; flag bare duration literals `^[+-]?\d*\.?\d+(ms|s)$` and easing literals `ease`/`ease-*`/`linear`/`step-*`/bare `cubic-bezier(…)`/`steps(…)` that are not `var()`; never flag property names, `var()`, `none`, `0s`/`0ms`) + the TSX forward net (motion inline-style keys assigned a literal, never an expression), and (b) the second `it()` asserting the `@media (prefers-reduced-motion: reduce)` block is present in `packages/ui/styles/tokens.css`. `ALLOWLIST = {packages/ui/styles/tokens.css}`. (Test Design phase fixes the exact patterns; this names the contract.)
- **Verification gate:** after the sweep, `pnpm -r typecheck`, `pnpm -r test` (the new motion guard + all prior guards + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job must all pass, the last zero-diff with **no baseline update** (the reduced-motion block is inert at the captured no-preference state).

## Out of scope

- **Motion-scale rationalization / retuning.** Every distinct in-use duration and easing is preserved exactly; no near-durations consolidated (`160ms`/`180ms` not snapped together), no easing retuned, no feel changed. A genuinely rationalized motion scale is a separate, intentional motion-design visual-change story under the ADR 0039 discipline. **First central constraint.**
- **Motion redesign.** No new motion added, none removed, no feel changed. The reduced-motion block is the only intentional behavior change, and it zeroes durations only for users who requested reduced motion; it does not alter the default-state feel. **Second central constraint.**
- **The notation byte-string of the `0.15s` token.** Resolved by authoring the FollowButton site's token as `150ms` (identical computed duration; registry consistency); preserving the literal seconds string `0.15s` as a separate `015s`-keyed token is rejected (Option D). This is a notation normalization only, not a value change, and is zero-diff because the computed duration is identical and `0.15s` does not coexist with any other `150ms` literal.
- **The motion util / `transition()` helper and the reduced-motion-aware JS hook** (ADR 0038 §4, epic story 11). This story tokenizes the existing CSS transitions and adds the global CSS reduced-motion block only; it builds no util, no hook, and routes no primitive interaction through them. (No JS-driven motion exists on `main`.)
- **`scroll-behavior` / a blanket `transition: none` / `animation: none` global reset under reduce.** Not added: every motion on `main` is a token-reading `transition`, so zeroing the duration aliases covers 100% of in-use motion; a broader reset would protect nothing today (Option I). If a future motion type that does not reduce to a duration token is added, that story extends the reduced-motion block.
- **Richer semantic motion role tokens** (`--u-duration-control`, `--u-ease-control` per ADR 0038 §1). Deferred to a later intentional story that designs the roles; mapping the six durations onto a small role set now risks merging near-unequal values (zero-diff hazard), the same trap deferred for type bundles (0041), spacing roles (0042), and radius/elevation roles (0043).
- **Any other token axis:** color (done, Story 40), type (done, Story 41), spacing (done, Story 42), radii/elevation/z-index/breakpoints (done, Story 43). Non-motion token-sheet entries are left exactly as they are.
- **Primitives, the icon registry / `<Icon>` abstraction, and layout primitives** (later epic stories). The guard allowlist names only the token sheet; later stories add their own source files per ADR 0038 §6.
- **Authoring a dark theme or any second skin** (ADR 0038; epic story 13). The two-tier motion structure must admit one; building one is later work.
- **Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui`** and citing the new guard (epic story 14). This story leaves the docs as they are.
- Any behavior, copy, or information-architecture change beyond the deliberate reduced-motion block. The default-state render must be byte-identical, proven zero-diff against the Story-39 harness with no baseline update.
