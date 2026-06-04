# Story 49: Layout primitives (`Container`/`Stack`/`Grid`) — separate structure from skin, honest scope (the hardest axis; lands partial), zero-diff

**Status:** Done
**Created:** 2026-06-04
**Type:** Refactor (structural / modularity-only / invisible-to-users / zero-diff) — scope under review

## Background

This is epic story 12 of Epic 0001 (Overhaul-ready design system, `@unbnd/ui`) and repo Story 49. The epic line reads: "**Layout primitives (`Stack`/`Grid`/`Container`)** — separate structure from skin; convert screens to layout primitives. Hardest axis; the story states which screens convert now and which are explicitly deferred. **May land partial.**" ADR 0038 §5 (Layout primitives) states it in the umbrella's own words: "`Stack` (vertical/horizontal flow with a token-spaced `gap`), `Grid`, `Container` (max-width + page padding, replacing `--page-max`/`--page-pad-x` usage). These separate **structure** from **skin** so a re-skin does not have to touch layout and a layout change does not have to touch color/type. **This is the hardest axis because structure is the most entangled with component logic, so it is sequenced late and may land partially; the epic states which screens convert and which are deferred.**" The epic also flags this as a live gate question: "**Layout axis depth (Story 12):** how far to push the layout-primitive conversion in this epic versus deferring tail screens to a follow-up." That depth call is the load-bearing decision of this story.

This is the **last structural axis** of the epic (Story 13 = theming substrate, Story 14 = docs re-point remain). The epic and ADR both pre-flag it as the hardest and the one most likely to **land partial**.

### The binding constraint: structural/modularity, invisible to users, ZERO-DIFF, escalate-don't-normalize

The user has re-grounded the epic for all remaining stories: it is **structural/modularity only — invisible to users, NO new features, ZERO-DIFF, no normalization.** A layout primitive reproduces its converted instances **byte-identical**: same rendered markup/classes where they also carry layout, same resolved declarations, same flow, same responsive behavior, same spacing. **If a layout cannot be reproduced zero-diff by a clean primitive, that is an ESCALATION — it is LEFT BESPOKE, never normalized** (binding directive). This story does not unify the varied flex/grid layouts the way a redesign would; making the inconsistent spacings/columns consistent alters pixels, fails the Story-39 visual gate, and is a separate, deliberate, design-reviewed visual-change story. The precedent is fresh and explicit: Story 47 (form/surface primitives) lifted the clean primitives byte-identical and **escalated/left-bespoke** everything that did not reduce to a clean API (`Input`, `Card`, the divergent field wrappers); Story 48 (motion util) honestly closed most of its scope as **redundant/no-op** rather than padding it. This story follows both: build only what is genuinely zero-diff-reproducible and value-adding; escalate the rest; do not pad (the quality bar, `memory/feedback_unbnd_quality_bar.md`, forbids busywork to justify the story's existence).

The epic's operating principle holds: "same pixels, better structure." House-rule anchors: `CLAUDE.md` "Brand tokens are the visual source of truth" (the primitives reference only existing tokens — `--page-max`/`--page-pad-x` and the `--u-space-*` scale; they mint none) and "No new lint/typecheck/build tooling without an ADR" (this story adds none; any guard is a Vitest test under the existing `pnpm -r test`). `AGENTS.md` §4 design rules. Governing ADR: 0038 §5/§6. A refining ADR is expected per the Stories 40–47 pattern, because the scope/depth call, the primitive prop contracts, the zero-diff-vs-escalation map, and whether a guard is honestly green-able under partial coverage are real design calls (see open questions).

### Why this axis is structurally different from the token/component axes (lower modularity value)

The token axes (40–44) and the component axes (45–47) had high modularity payoff: a re-skin flows through tokens automatically, and a button restyle is one primitive edit instead of N. **Layout is different.** The epic's own done-definition frames the prize as "a re-skin is a tokens-and-internals change with no app-code churn" — and a re-skin *already* flows through the tokens; it does not touch layout. Layout structure (which things stack, in what direction, at what gap, reflowing at which breakpoint) is **inherently per-screen** and entangled with component logic, which is exactly why ADR 0038 §5 sequences it last and flags partial landing. The modularity gain from primitivizing layout is therefore **real but smaller** than the prior axes, and concentrated in the one place layout is genuinely repeated. The honest job here is to find that one place, convert it zero-diff, and resist primitivizing the genuinely-bespoke remainder just to check the epic-story-12 box.

## Layout survey (read-only against `main`, 2026-06-04)

The survey is the PO's grounding read, not the final API (the Architect's call). The headline finding mirrors Stories 47 and 48: **the page-frame (`Container`) is the one clean, narrow, zero-diff candidate — but it is *already* deduplicated by a single CSS class, so its modularity gain is low; `Stack` and `Grid` are accidentally varied / inherently per-screen and do not cluster into a zero-diff-collapsible primitive.** Layout is the least primitivizable axis of the epic.

### `Container` — ALREADY DRY (one shared class), not a repeated bespoke pattern. Clean to wrap, low modularity gain.

The page-width frame ADR 0038 §5 names (`max-width: var(--page-max)` + `padding: 0 var(--page-pad-x)`) is **not** repeated bespoke across screens. It lives in **exactly one** CSS rule — `.page` in `apps/web/src/styles/base.css`:

```
.page { max-width: var(--page-max); margin: 0 auto; padding: 0 var(--page-pad-x) var(--u-space-32); }
```

`.page` is applied via `className="page"` at **~17 call sites across 12 route files** (`Home`, `Search`, `Browse`, `GenreBrowse`, `BookDetail` ×3, `Profile`, `ProfileMe` ×2, `Submit`, `Settings` ×2, `CommunitySubmissions`, `NotFound`, `About`). So the page-frame is **already centralized** — one class, one declaration block, every route reusing it. There is no N-way duplication to collapse; the duplication was already solved by the shared class.

There is **one** divergent second use of the `--page-max` token: `.rate` in `RatingControl.css` (`max-width: var(--page-max); margin: 0 auto; padding: var(--u-space-24) var(--page-pad-x); border-top: 1px solid var(--u-border)`). This is a *different* frame (different padding, plus a border-top skin) that happens to reuse the width token — it is **not** the same Container and should not be folded into one (folding would either change `.rate`'s pixels = not zero-diff, or force a sprawling padding/border prop surface). The auth screens (`AuthWelcome`/`AuthMethodSelect`/`AuthEmailSignup`/`AuthNostrConnect`) use a separate `auth-card` shell, not `.page` — also out of the Container's scope.

**Assessment:** `Container` is the single cleanest zero-diff candidate — a `<Container>` that emits exactly the `.page` declarations (or wraps the existing `.page` class) reproduces all ~17 sites byte-identical, and it is the truest "structure separated from skin" win ADR 0038 §5 describes. **But** because `.page` is *already* one shared class, the modularity gain is converting `className="page"` → `<Container>` at 17 sites — a markup-shape change with no resolved-value or dedup gain (the class already centralized it). Real but modest. `.rate` stays bespoke (escalation); the auth shell stays bespoke (out of scope).

### `Stack` — VARIED + inherently per-screen (escalation surface). No dominant zero-diff-collapsible cluster.

`display: flex` appears in **93** app-CSS rules; `flex-direction: column` in **37**. Tallying the *vertical* (flex-column) blocks by their `gap` token, and the *horizontal* (row-flex) blocks by `gap` × alignment:

- **Vertical (flex-column), by gap:** `space-8` ×5, `space-2` ×5, `space-12` ×5, *(no gap)* ×4, `space-14` ×3, `space-10` ×3, `space-6` ×2, `space-4` ×2, `space-22` ×2, `space-16` ×2, `space-1` ×2, `space-5` ×1, `space-18` ×1. **Thirteen distinct gap values; the largest cluster is 5.**
- **Horizontal (row-flex), by gap × alignment:** the largest single cluster is `gap: space-10 + align-items: center` at **6**; then `space-12 + center` ×5, `space-10` (no align) ×5, plain `display:flex` (no gap) ×5, `space-8 + center` ×4, `space-8` ×4, and a long tail of `space-6/16/18/4/28/14/22` × {center, none} × {space-between, center} combos, almost all ×1–3.

Two findings kill a zero-diff `Stack` collapse:

1. **No dominant cluster.** The gap/alignment combinations spread thinly across ~20 distinct shapes; no single `(direction, gap, align)` tuple covers enough sites to be a meaningful dedup. This is the same "varies along multiple independent axes, no collapsible cluster" finding Story 48 reached for the `transition()` helper.
2. **The blocks are not byte-identical rule bodies.** Nearly every flex-column/row-flex rule carries *additional* declarations beyond `display`/`direction`/`gap` — `align-items: flex-start`, `padding-top`, `border-top`, `margin-top`, `justify-content`, and responsive `flex-direction` flips (e.g. `Submit.css` `.sub-row` reflows column at `max-width: 540px`). Collapsing these onto a shared `<Stack gap=… direction=…>` would mean either (a) editing each rule's declaration list (not zero-diff if any extra declaration differs — and they differ everywhere), or (b) extracting the layout half to the primitive while leaving the skin/extras as an additive `className` — which **rewires `className` lists in dozens of TSX sites for no resolved-value gain** and risks a diff. That is the "normalize/consolidate" move the directive forbids and tells us to **escalate** instead.

**Assessment:** `Stack` is accidentally varied and inherently per-screen. There is no clean, dominant, byte-identical cluster to primitivize zero-diff. Converting it would be high-churn, high-diff-risk markup rewiring for low gain. **Escalation surface — leave the flex layouts bespoke**, exactly as the epic anticipates ("which screens are deferred").

### `Grid` — TWO bespoke instances, not a cluster. Each escalates.

`display: grid` appears in **exactly 2** app-CSS rules:

- `BookGrid.css` `.bgrid` — `repeat(5, 1fr)`, `gap: space-24 space-16`, with a **bespoke 4-step responsive cascade** (5→4 cols at 880px, →3 at 700px, →2 + a tighter `gap: space-22 space-14` at 480px).
- `GenreGrid.css` `.genre-grid` — `repeat(4, 1fr)`, with its own breakpoint (→2 cols at a different width).

These are **two different grids** with different column counts, different gaps, and different bespoke responsive cascades. They do not cluster onto one `<Grid cols=… gap=…>` API without a sprawling responsive-prop surface, and each is already a single shared class (`.bgrid`/`.genre-grid`) used by its one component. There is no N-way duplication to collapse and no shared shape. **Assessment:** two bespoke grids, each an escalation — leave bespoke.

### Survey summary

| Primitive | Sites / shape | Clustering | Zero-diff? | Modularity gain |
|---|---|---|---|---|
| `Container` | `.page` (1 class, ~17 call sites, 12 routes) + 1 divergent `.rate` | **Already DRY** (one class) | **Yes** — wrap/emit `.page` declarations byte-identical | **Low** — class already centralizes it; gain is `className`→component |
| `Stack` | 37 flex-column + ~50 row-flex, ~20 distinct gap×align shapes, almost all carrying extra skin/layout decls | **Varied, no dominant cluster** | **No** — not byte-identical-collapsible; conversion = markup rewiring, diff risk | Low / negative (high churn) |
| `Grid` | 2 grids (`.bgrid` 5-col, `.genre-grid` 4-col), each a bespoke responsive cascade | **2 bespoke instances** | **No** — no shared shape | None |

## SCOPE RECOMMENDATION (honest; lands partial)

**Recommend Option (a): `Container` only. Build a zero-diff `<Container>` over the existing `.page` frame; LEAVE `Stack` and `Grid` BESPOKE / DEFERRED.** This is the honest read of the epic's own "may land partial" framing and the escalate-don't-normalize directive.

The three options the gate asked the PO to present, assessed:

- **(a) `Container` only — RECOMMENDED.** `Container` is the one clean, certain, zero-diff layout primitive: it reproduces the ~17 `.page` sites byte-identical and is the truest "max-width + page padding, replacing `--page-max`/`--page-pad-x` usage" item ADR 0038 §5 names by example. It discharges the §5 `Container` line and lands the structure-from-skin separation on the page frame — the one place layout is genuinely the same across screens. `.rate` (divergent frame) and the auth shell stay bespoke. `Stack` and `Grid` are explicitly DEFERRED with the survey rationale recorded.
- **(b) fuller `Stack`+`Grid`+`Container` conversion — NOT recommended.** The survey shows `Stack` has no dominant zero-diff cluster (≤6 sites per shape, ~20 shapes, all carrying extra declarations) and `Grid` is two bespoke instances. Forcing them through primitives is either a normalization (forbidden — alters pixels, fails the Story-39 gate) or a high-churn `className`-rewiring exercise across dozens of TSX sites that risks a diff for no resolved-value gain. This is exactly the Story-47 lesson (escalate the inconsistent surfaces) and the Story-48 lesson (do not pad with redundant infra).
- **(c) thin/skip entirely — defensible fallback, but leaves the one clean win on the table.** If the gate weighs "layout's modularity payoff is inherently low — a re-skin flows through tokens, not layout" heavily enough, the whole axis could be closed as a near-no-op with a note (like Story 48), deferring even `Container`. The PO's read is that `Container` is a genuine, certain, zero-diff win worth taking, so (a) is preferred over (c); but if the Architect judges the `className`→`<Container>` swap at 17 sites to be churn without enough gain, (c)+note is honest too.

**What converts (Option a):** the `.page` page-frame → `<Container>`, byte-identical, at its ~17 call sites.
**What stays bespoke / deferred:** all flex-based `Stack` layouts (37 column + ~50 row, varied); both `Grid`s (`.bgrid`, `.genre-grid`); the `.rate` divergent frame; the auth-card shell. These are escalations (left bespoke), recorded so a future deliberate story can revisit if a dominant pattern ever emerges.

**Default remains zero-diff.** Where exact reproduction would force an ugly/sprawling API or a markup rewrite that risks a diff, the Architect FLAGS it (leave bespoke) rather than normalizing. No layout in this story changes a pixel.

## User-facing description

As an Unbnd engineer, I want the page-width frame expressed as a single token-backed `<Container>` layout primitive in `@unbnd/ui` (replacing the ad-hoc `.page` class usage with a structural primitive that references only `--page-max`/`--page-pad-x`), and I want the genuinely-varied flex/grid layouts left bespoke rather than force-fit into primitives, so that the design system separates page structure from skin on the one screen frame that is truly shared while honestly deferring the per-screen layouts the epic always expected to land partial.

There is **no user-facing change.** The page frame renders byte-identical; `Stack`/`Grid` layouts are untouched. Readers, Curators, and Authors see nothing different.

## Acceptance criteria

Testable from the outside. (Stated for the recommended Option (a); if the gate chooses (c)/thin, the no-code ACs from the "Both / thin" set apply.)

- [ ] Given `@unbnd/ui`, when its exports are inspected, then it provides a typed `Container` layout primitive exported from `packages/ui/src/index.ts` mirroring the `Button`/`Link`/`Field` precedent, referencing only the existing `--page-max`/`--page-pad-x` tokens (and `--u-space-*` for the existing bottom padding) — no new token minted.
- [ ] Given the `Container` prop API, when inspected, then any state/variant rides on real typed props per ADR 0038 §2, and there is no `className` prop that re-skins the primitive; any permitted `className` is additive layout-only.
- [ ] Given the ~17 `className="page"` call sites across the 12 route files, when each is migrated to `<Container>`, then each renders **byte-identical** to its pre-migration output: same `max-width`/`margin`/`padding` declarations, same emitted class or equivalent resolved styles, same children, same nesting.
- [ ] Given the divergent `.rate` frame and the auth-card shell, when this story completes, then they are **left bespoke** (not folded into `Container`) and render unchanged.
- [ ] Given the `Stack` and `Grid` layouts, when this story completes, then they are **left bespoke / deferred** — no flex-column, row-flex, or grid rule is rewired through a layout primitive — and the story records (with the survey evidence) why each is an escalation rather than a zero-diff conversion.
- [ ] Given the guard set, when `pnpm -r test` runs, then all nine prior guards (38–47) stay green (this story weakens none), and **any new guard added in this story lands green** — see the open question on whether a layout-primitive guard is honestly green-able under partial coverage (the PO's read: likely not, since most layout stays bespoke; a guard that demanded all layout flow through primitives would be red on day one).
- [ ] Given the workspace, when `pnpm -r typecheck` runs, then it passes (the new `Container` prop types included).
- [ ] Given the workspace, when `pnpm -r test` runs, then it passes, including any migrated unit tests and all guards.
- [ ] Given the workspace, when the `apps/web` build runs (`pnpm --filter @unbnd/web build`), then it succeeds.
- [ ] Given the Story-39 `visual` job, when it runs against this story's change, then it is **zero-diff** against the committed baselines with **no baseline update**. If any `.page` site genuinely cannot be reproduced byte-identical by `<Container>`, that site is **escalated** (left bespoke) for an Architect decision, never silently changed; a diff is investigated, not re-baselined.

**If the gate chooses Option (c) / thin (no code):**

- [ ] Given this story, when it is resolved, then it records that `Container` is the only clean zero-diff layout primitive, that `Stack`/`Grid` do not cluster into a zero-diff-collapsible primitive (with the survey evidence), and that the layout axis lands partial/deferred per ADR 0038 §5; the §5 closeout note is folded into the docs story (epic story 14). No code lands; the app is byte-identical; the visual job is zero-diff with no baseline update; all guards stay green.

**Both options:**

- [ ] No layout normalization, no gap/column/breakpoint rationalization, no reflow change, no feel change. Any tempting consolidation of the varied flex/grid layouts is **escalated (left bespoke), never performed** — that is a separate, deliberate, design-reviewed visual-change story.

## DList shapes touched

None. This is a front-end layout-primitive-extraction refactor, not a DList-shaped change. ADR 0038 records that the Tapestry branch survey does not apply to this design-system work; the governing prior art is in-repo: the Stories 40–47 guards under `packages/ui/test/` for the guard pattern, the existing `packages/ui/src/components/` directory and `index.ts` exports for the primitive precedent, and `apps/web/src/styles/base.css` `.page` plus the bespoke flex/grid CSS as the byte-identical source of truth. No data fixture changes.

## Out of scope

The fence is the zero-diff `Container` extraction (Option a) — or a decision/defer note (Option c) — and nothing more. It is a behavior-preserving, byte-identical refactor, NOT a layout redesign.

- **Any layout REDESIGN, reflow, or normalization.** This story reproduces the converted frame's current pixels exactly. It does NOT make the varied flex gaps/alignments consistent, unify the two grids, retune any breakpoint cascade, or change any flow/spacing. Each such change alters pixels, fails the Story-39 gate, and is a separate, deliberate, design-reviewed visual-change story. **This is the central constraint.**
- **`Stack` and `Grid` primitives / conversion.** Left bespoke / deferred per the survey (no dominant zero-diff cluster; inherently per-screen). Not built here. A future deliberate story may revisit if a dominant repeated pattern ever emerges.
- **The divergent `.rate` frame and the `auth-card` shell.** Left bespoke (not the same Container). Untouched.
- **No re-skin `className` escape hatch** (ADR 0038 §2): the `Container` prop surface is typed props; any `className` is additive layout-only and can never restyle the primitive.
- **No new token.** `Container` references only the existing `--page-max`/`--page-pad-x` (and `--u-space-32` for the existing bottom padding). If exact reproduction appeared to need a value not in the token set, that is a signal to escalate, not to add a token.
- **Token / motion / component / theming work.** Stories 40–44 (tokens), 45–47 (Button/IconButton/Icon/Link/Pill/Avatar/Field/Label), 48 (motion util), 13 (theming/dark-mode) own those. This story mints no token and builds no non-layout primitive.
- **Doc re-point.** Updating `CLAUDE.md`/`AGENTS.md` to cite `@unbnd/ui` and the guards is epic story 14 (the docs story), which is also where an Option-(c) §5 closeout note would land. This story leaves the docs as they are.
- **Behavior, copy, or information-architecture change.** No screen gains, loses, or changes a handler, label, route, or content. The render must be byte-identical, proven zero-diff against the Story-39 harness with no baseline update.
- **Any layout that cannot be reproduced zero-diff by a clean primitive.** ESCALATED (left bespoke), never normalized. This story **lands partial by design** — `Container` converts; `Stack`/`Grid` and the divergent frames stay bespoke.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, bounty marketplace, social feed, reading progress, federation, or notifications). It is behavior-preserving Phase-2 platform-hardening infrastructure and does not approach the §11.3 line.

## Open questions

For the Architect to resolve in the Architecture phase. The PO frames the scope/depth call and the survey; the PO does not pick prop names, the file layout, or the guard internals.

- **HEADLINE — the depth call: Option (a) `Container` only, (b) fuller `Stack`+`Grid`+`Container`, or (c) thin/skip?** The PO recommends **(a)**: build `Container` zero-diff over `.page`; leave `Stack`/`Grid` bespoke/deferred. The survey shows (b) is not zero-diff-reproducible (no dominant `Stack` cluster, two bespoke grids; conversion would normalize or rewire markup for no gain) and (c) leaves the one clean win on the table. The Architect confirms (a), or chooses (c)+note if the `className`→`<Container>` swap at 17 sites is judged churn-without-gain. This is the load-bearing decision the epic flagged as a live gate question.
- **HEADLINE — is a guard honestly green-able under partial coverage?** ADR 0038 §6 and epic story 12 name a guard: "spacing-literal guard extended to enforce layout flows through primitives **on converted screens**." The PO's read is that a guard demanding *all* layout flow through primitives would be **red on day one** (most layout stays bespoke by design), so it is **likely not honestly green-able** as a blanket rule. The Architect decides whether a *scoped* guard is meaningful here (e.g. "no raw `--page-max`/`--page-pad-x` usage outside `Container`" — narrow and green-able, locking only the Container win) or whether this story adds **no new guard** and simply keeps the nine prior guards green. A guard must land green the moment it ships; a guard that cannot be green under the honest partial scope should not be invented to check the box.
- **The `Container` prop contract.** How `<Container>` reproduces `.page` byte-identical: does it emit the existing `.page` class, or its own co-located CSS with the same declarations? Does it take an `as`/polymorphic prop (the sites are all `<div>` today)? How is the bottom `padding … var(--u-space-32)` expressed? The Architect designs the typed surface; the PO requires only that it be zero-diff and mint no token.
- **Which `.page` sites are zero-diff-reproducible vs escalations.** The PO's read is all ~17 are identical (one shared class), so all convert cleanly. The Architect confirms per site and flags any that a clean `<Container>` cannot reproduce byte-identical (e.g. a site that adds an extra class alongside `page`) — any such site is escalated (left bespoke), never normalized.
- **Confirm `Stack`/`Grid` have no zero-diff conversion.** The PO's read is **no** (no dominant cluster; blocks carry extra declarations; grids are bespoke). The Architect confirms there is no clean byte-identical conversion available, or escalates any tempting one rather than normalizing.
- **Whether a refining ADR is warranted.** The PO's read is yes, as for Stories 40–47: the depth call, the `Container` contract, the zero-diff-vs-escalation map for `Stack`/`Grid`, and the guard-green-ability question are design choices worth recording on top of umbrella ADR 0038 §5/§6. The Architect confirms and writes it (or, under Option c, a short ADR/addendum recording "§5 layout axis: `Container` converts; `Stack`/`Grid` deferred bespoke").

## Phase-2 hardening note

This is Phase-2 platform hardening under Epic 0001 (design-system overhaul), not a product-feature change. It touches no product surface and no PRD §11.x in-scope claim. The outcome — a `Container` primitive over the page frame, with `Stack`/`Grid` left bespoke — is invisible to Readers, Curators, and Authors. Any PRD addendum is the post-Phase-2 platform-hardening addendum, not now. Per ADR 0038 §5 and the epic, this axis **lands partial by design**; that partial landing is the honest, intended outcome, not a shortfall.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella; §5 layout primitives — `Stack`/`Grid`/`Container`, the structure-from-skin rationale, the "hardest axis / may land partial" framing; §6 CI guards). A refining ADR on the layout-primitive scope/contract is expected from the Architecture phase.
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 12; the "Layout axis depth" gate question).
- Precedents: `engineering-team/stories/done/47-form-surface-primitives.md` (the clean-primitives-only, escalate-don't-normalize precedent — lift what reduces to a clean API byte-identical, leave the inconsistent surfaces bespoke) and `done/48-motion-util.md` (the honest no-op/thin precedent — do not pad a near-empty axis; close it truthfully).
- Test plan: none expected (the guard, if any, is itself the locking test; under Option c there is no code to test).
- Review: `engineering-team/reviews/49-layout-container.md` (PASS — Container shipped; Stack/Grid left bespoke/deferred).
