# ADR 0049: `Container` layout primitive (Story 49) — the one clean zero-diff page-frame primitive; `Stack`/`Grid`/`.rate`/auth-shell left bespoke

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/done/49-layout-primitives.md`

**Accepted 2026-06-04** (auto-mode epic closeout; user-scoped Container-only). Build `Container` in `@unbnd/ui` emitting `.page`, move the 3 `.page` declarations from `base.css` into co-located `Container.css`, convert the 16 `<div className="page">` sites byte-identical. One narrow new guard (no raw `--page-max`/`--page-pad-x` outside `Container.css` + the bespoke `.rate` allowlist). `Stack`/`Grid`/`.rate`/auth-shell left bespoke. Zero-diff; no escalation on the conversion. Gate OQs (add guard / allowlist `.rate` / emit-`.page`) all accepted.

Refining ADR under the umbrella **ADR 0038** (§5 layout primitives — `Stack`/`Grid`/`Container`, "structure separated from skin," the "hardest axis / may land partial" framing; §2 the typed-prop / additive-layout-only `className` rule; §6 CI guards; §7 the no-build-step package + co-located CSS pattern). Held to the gate set by **ADR 0039** (the Story-39 Playwright `visual` job, `maxDiffPixelRatio: 0`, no baseline update). Follows the discipline of **ADR 0047** (Story 47a — lift what reduces to a clean API byte-identical; leave the inconsistent surfaces bespoke) and **ADR 0048** (Story 47b — the clean `Avatar` **MOVE** + co-located-CSS + `index.ts` re-export pattern; the honest "no new green-able guard under partial coverage" call), and the no-op-honesty discipline of Story 48 (do not pad a near-empty axis). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 12; the "Layout axis depth" gate question). It does not relitigate the prior ADRs.

**Binding user scoping decision: `Container` only.** Build a zero-diff `<Container>` over the existing `.page` page-frame; **`Stack` and `Grid` are NOT built** (left bespoke / deferred). This is the load-bearing depth call the epic flagged, resolved by the user to Option (a).

**This is a zero-diff refactor, NOT a normalization.** The one converted frame renders byte-identical; no baseline moves. Everything that cannot reduce to a clean byte-identical primitive is **ESCALATED (left bespoke)**, never normalized — here that is `Stack`, `Grid`, the divergent `.rate` frame, and the auth shell.

## Context

### Acceptance criteria carried by the story (Option a)

- `@unbnd/ui` provides a typed `Container` layout primitive exported from `packages/ui/src/index.ts`, mirroring the `Button`/`Link`/`Field`/`Avatar` precedent, referencing only the existing `--page-max`/`--page-pad-x` tokens (and `--u-space-32` for the existing bottom padding) — no new token minted.
- The prop API rides on real typed props (ADR 0038 §2); no re-skin `className`; any permitted `className` is additive layout-only.
- The ~17 `className="page"` call sites migrate to `<Container>`, each rendering **byte-identical**: same `max-width`/`margin`/`padding`, same emitted class or equivalent resolved styles, same children, same nesting.
- The divergent `.rate` frame and the auth-card shell are **left bespoke**, render unchanged.
- `Stack`/`Grid` are **left bespoke / deferred** — no flex/grid rule is rewired — with the survey evidence recorded as the escalation rationale.
- All nine prior guards (38–47) stay green; any new guard lands green or none is added (the green-ability question, resolved below).
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` all pass; the Story-39 `visual` job is zero-diff with **no baseline update**.

### Verified survey (read directly against `apps/web/src`, branch `story-49-layout-container`, 2026-06-04)

**The exact `.page` rule.** `apps/web/src/styles/base.css` (lines 59–63), verbatim:

```css
.page {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 0 var(--page-pad-x) var(--u-space-32);
}
```

Three declarations. **No `@media` adjustment touches `.page`** anywhere in the app CSS (the only `page`-bearing media facts in base.css are these three lines; grep across all app CSS confirms no `.page` responsive override). All three referenced tokens already exist in `packages/ui/styles/tokens.css`: `--page-max: 720px` (line 617), `--page-pad-x: 24px` (line 618), and the `--u-space-32` spacing token (Story 42 / ADR 0042).

**No compound or descendant selector references `.page`.** A repo-wide grep for `.page` in app CSS returns exactly the one rule above — there is **no** `.page > x`, `.page-header`, `.page .y`, or any selector that depends on the `.page` class being on a particular element. (The other `page`-substring hits are unrelated: a `Nav.css` comment, and `.auth-page` in `AuthShell.css`, a different class.) **This is the decisive zero-diff fact:** nothing in the cascade depends on the `.page` class beyond the three declarations themselves, so moving those declarations is provably safe.

**The `className="page"` site inventory — 16 sites, all `<div>`, all the bare literal `"page"`, none with extra classes.** (The PO estimated ~17; the verified count is **16**.) Every site is `<div className="page">` exactly — confirmed by grep returning the full-line match `<div className="page">` at each:

| Route file | Lines | Tag | className |
|---|---|---|---|
| `routes/Home.tsx` | 104 | `<div>` | `"page"` |
| `routes/Search.tsx` | 73 | `<div>` | `"page"` |
| `routes/Browse.tsx` | 43 | `<div>` | `"page"` |
| `routes/GenreBrowse.tsx` | 53 | `<div>` | `"page"` |
| `routes/BookDetail.tsx` | 102, 114, 150 | `<div>` ×3 | `"page"` |
| `routes/Profile.tsx` | 101 | `<div>` | `"page"` |
| `routes/ProfileMe.tsx` | 90, 107 | `<div>` ×2 | `"page"` |
| `routes/Submit.tsx` | 133 | `<div>` | `"page"` |
| `routes/Settings.tsx` | 65, 150 | `<div>` ×2 | `"page"` |
| `routes/CommunitySubmissions.tsx` | 110 | `<div>` | `"page"` |
| `routes/About.tsx` | 8 | `<div>` | `"page"` |
| `routes/NotFound.tsx` | 8 | `<div>` | `"page"` |

**16 sites across 12 route files.** Two findings simplify the contract:
1. **Every element is a `<div>`.** No `<main>`/`<section>` variant exists today. The `as` prop (below) defaults to `<div>` and carries any future tag verbatim, but no site needs a non-`div` tag now.
2. **No site adds an extra class.** Every site is the bare `className="page"` — there is no `className="page something"` anywhere. So no site needs the additive-`className` path for zero-diff; it is provided (per ADR 0038 §2 and the `Link`/`Field` precedent) but unused at migration time. **No site is an escalation** — all 16 are byte-identical-reproducible.

**The divergent `.rate` frame — NOT the same Container, left bespoke.** `apps/web/src/components/RatingControl.css` `.rate` = `max-width: var(--page-max); margin: 0 auto; padding: var(--u-space-24) var(--page-pad-x); border-top: 1px solid var(--u-border)`. It reuses the `--page-max`/`--page-pad-x` tokens but is a **different frame**: different padding (`24 / page-pad-x`, not `0 / page-pad-x / space-32`) plus a `border-top` skin. Folding it into `Container` would either change `.rate`'s pixels (not zero-diff) or force a sprawling padding/border prop surface (the grab-bag debt ADR 0045/0048 reject). **Left bespoke.**

**The auth shell — NOT `.page`, out of scope.** `AuthShell.tsx` renders `<div className="auth-page">` (`AuthShell.css` `.auth-page`), a separate centered-card shell, not the page frame. Untouched.

### `Stack`/`Grid` — confirmed no zero-diff conversion (the deferred escalations)

The PO survey (story §"Stack", §"Grid") is confirmed. **`Stack`:** `display:flex` in ~93 app-CSS rules, `flex-direction:column` in 37; tallied by `(direction, gap, align)` the shapes spread across ~20 distinct tuples with the largest cluster at ~5–6 sites, and nearly every rule carries *extra* declarations beyond `display`/`direction`/`gap` (`align-items`, `padding-top`, `border-top`, `margin-top`, `justify-content`, responsive `flex-direction` flips). There is no dominant byte-identical cluster; converting would either normalize (banned) or rewire `className` across dozens of TSX sites for no resolved-value gain and real diff risk. **`Grid`:** exactly 2 `display:grid` rules (`.bgrid` 5-col with a 4-step responsive cascade, `.genre-grid` 4-col with its own breakpoint) — two bespoke grids, each already a single shared class on its one component, no shared shape. Both are **escalations (left bespoke / deferred)**, exactly as ADR 0038 §5 and the epic anticipate ("the epic states which screens convert and which are deferred"). This ADR does not build them.

### Constraints that bind this design

- **Zero-diff, gated by Story-39** (ADR 0039, `maxDiffPixelRatio: 0`). No baseline moves.
- **No new token** — `Container` references only existing `--page-max`/`--page-pad-x`/`--u-space-32` (ADR 0038 §1; CLAUDE.md "brand tokens are the source of truth"). If exact reproduction appeared to need a value outside the token set, that is a signal to escalate, not to mint a token.
- **No new tooling / no package-config change.** `@unbnd/ui` is React-ready since Story 45; co-located CSS imported by the component (ADR 0038 §7). Any guard is a Vitest test under the existing `pnpm -r test` (CLAUDE.md "no new tooling without an ADR").
- **The `className` rule** (ADR 0038 §2): additive layout-only, never a re-skin.
- **No AI-slop** in any doc-comment this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- In-repo prior art governs; the Tapestry branch survey does not apply ("DList shapes touched: None").

## Options considered

The load-bearing decisions: (0) the depth call — already resolved by the user to **(a) `Container` only**; (1) how `Container` reproduces `.page` byte-identical (emit `.page` vs emit a new class); (2) the prop contract (`as`, `className`); (3) whether a new guard is honestly green-able.

### Option A — Build `Container`; it **emits the literal `.page` class**; move the three `.page` declarations into co-located package CSS; remove the app-side `.page` rule (CHOSEN)

`<Container>` renders `<div class="page">` (its `as`/`className` extensions below). The three page-frame *declarations* move into `packages/ui/src/components/Container.css` keyed on `.page`, imported by `Container.tsx` (the co-located-CSS pattern of `Avatar.css`/`Field.css`, ADR 0048 §Implementation). The app-side `.page` rule in `base.css` is **removed**, since the package rule now owns those declarations and nothing else references the class.

- **Why emit `.page` (not a fresh class):** it is the provably-safest zero-diff move. The rendered element keeps the exact class string `"page"`, so the emitted markup is byte-identical and — critically — *any* selector that matched `.page` still matches. The survey proved no descendant/compound `.page` selector exists, so this safety margin is currently unused, but emitting `.page` makes the move zero-diff *by construction* rather than by audit, and it costs nothing. The declarations live in one place (the package); the class name on the element is unchanged.
- Pros: byte-identical emitted markup (`class="page"` unchanged); resolved declarations unchanged (same three, same tokens); no descendant selector can break (none exists, and any future one would still match); the page-frame declarations now ship from `@unbnd/ui` as the single source (the §5 "structure separated from skin" win); no token minted; matches the Avatar MOVE + co-located-CSS pattern.
- Cons: the modularity gain is modest — `.page` was *already* one shared class, so the win is `className="page"` → `<Container>` at 16 sites (a markup-shape change) plus relocating the declaration block into the package, not a dedup of N copies. This is the honest, expected outcome (the story and ADR 0038 §5 both pre-flag layout's gain as "real but smaller"). The class name `page` is now "owned" by the package rule while emitted by the package component — acceptable (it is the design system's frame), and the new guard (below) locks the token usage so the frame cannot be re-handrolled.

### Option B — Build `Container`; emit a **new package-owned class** (e.g. `.u-container`) with the same three declarations; remove `.page`

`<Container>` renders `<div class="u-container">`; `.u-container` in package CSS carries the identical three declarations.

- Pros: a clean, namespaced class consistent with the `u-`-prefixed primitive classes (`u-btn`, `u-link--*`, `u-field`); no lingering legacy class name.
- Cons: **changes the emitted class string** at all 16 sites (`page` → `u-container`). The resolved styles are identical, so it is *visually* zero-diff and would pass the Story-39 pixel gate — but it is not *markup*-byte-identical, and it removes the safety margin that any `.page` descendant selector keeps matching. The story's AC asks for "same emitted class **or** equivalent resolved styles," so B is technically permissible, but it trades away the by-construction safety of A for a cosmetic class rename with no functional gain. Rejected: A is strictly safer at zero cost; a class rename, if ever wanted, is a separate trivial change once the primitive exists.

### Option C — Thin / skip: record `Container` as the only clean candidate but do not build it (defer even `Container`)

Close the layout axis as a near-no-op with a note (the Story-48 precedent), deferring `Container` too.

- Pros: zero churn; defensible if one judges the `className`→`<Container>` swap at 16 sites to be churn-without-gain (layout's modularity payoff is inherently low — a re-skin flows through tokens, not layout).
- Cons: leaves the one genuinely clean, certain, zero-diff layout win on the table and discharges none of ADR 0038 §5's `Container` line. The user's binding decision is (a), so C is recorded only to show the alternative was weighed. Rejected per the user's scoping.

## Decision

We adopt **Option A**, per the user's binding **`Container`-only** scoping.

Build a typed `Container` primitive in `@unbnd/ui` that **emits the literal `.page` class**, move the three page-frame declarations into co-located package CSS, remove the now-orphaned app-side `.page` rule, and migrate the 16 `className="page"` `<div>` sites to `<Container>` byte-identical. `Stack`, `Grid`, the `.rate` frame, and the auth shell are **left bespoke** (escalations, recorded). Option B (rename the class) is rejected as a cosmetic trade that removes A's by-construction safety; Option C (defer `Container`) is rejected by the user's depth call.

### 1. The zero-diff move mechanism — emit `.page`, relocate the declarations, remove the app rule

- **`Container` emits `class="page"`** (plus any additive `className`, below). The rendered markup at every site is byte-identical to today's `<div className="page">`.
- **The three declarations move into `packages/ui/src/components/Container.css`**, keyed on the `.page` selector, verbatim:
  ```css
  /* packages/ui/src/components/Container.css */
  .page {
    max-width: var(--page-max);
    margin: 0 auto;
    padding: 0 var(--page-pad-x) var(--u-space-32);
  }
  ```
  imported by `Container.tsx` via `import "./Container.css";` (the `Avatar.css`/`Field.css` co-located pattern). The three tokens already ship from `packages/ui/styles/tokens.css`, so the resolved values are identical.
- **The app-side `.page` rule in `apps/web/src/styles/base.css` (lines 59–63) is removed.** Nothing else references the class (survey: no descendant/compound selector), so removal leaves no dangling dependency. The declaration block does not vanish — it moves into the package and is the only definition; the rendered element still carries `class="page"`, so the cascade is identical.
- **Net effect:** same emitted markup (`class="page"`), same resolved declarations, same tokens, no `@media` to carry (none exists), no descendant selector to break (none exists). Zero-diff by construction, provable by the Story-39 gate with no baseline update.

### 2. The `Container` prop contract

```ts
// packages/ui/src/components/Container.tsx (shape sketch)
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import "./Container.css";

interface ContainerOwnProps<T extends ElementType> {
  /**
   * The element to render as. Defaults to "div" (every current .page site is a
   * <div>). A future page that needs a <main>/<section> landmark passes it here
   * and the tag is carried verbatim; extra props flow through ...rest.
   */
  as?: T;
  /** ADDITIVE LAYOUT-ONLY (ADR 0038 §2). Never a re-skin. Appended after "page".
   *  No current site uses it (all 16 are the bare "page"); provided for the
   *  page-with-extra-layout-class case the precedent (Link/Field) anticipates. */
  className?: string;
  children: ReactNode;
}

export type ContainerProps<T extends ElementType = "div"> =
  ContainerOwnProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof ContainerOwnProps<T>>;

export function Container<T extends ElementType = "div">({
  as, className, children, ...rest
}: ContainerProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const merged = className ? `page ${className}` : "page";
  return <Tag className={merged} {...rest}>{children}</Tag>;
}
```

- **Polymorphic `as?`** (the `Link` precedent, ADR 0047 §1), default `"div"`. Every current site is a `<div>`, so the default reproduces all 16; the prop is the mechanism by which any future `<main>`/`<section>` tag is carried verbatim, element-tag-preservation per the story's OQ. No site needs a non-`div` tag at migration time.
- **No re-skin `className`.** The only `className` is **additive layout-only** (ADR 0038 §2), emitted as `"page <extra>"` so the `.page` declarations always apply and the extra is appended. No current site passes one (all 16 are bare `"page"`), so this path is unexercised by the migration but provided for parity with `Link`/`Field` and for the page-with-extra-class case. There is no prop that can restyle the frame.
- **The bottom `padding … var(--u-space-32)`** is expressed exactly as today — it is part of the single `.page` rule's `padding` shorthand (`0 var(--page-pad-x) var(--u-space-32)`), moved verbatim into the package CSS. It is not split into a prop.
- **Export** from `packages/ui/src/index.ts`: `export { Container } from "./components/Container"; export type { ContainerProps } from "./components/Container";` — mirroring the `Avatar`/`Field`/`Link` re-export lines.

### 3. Migration — 16 sites, byte-identical

Each `<div className="page">` becomes `<Container>`; the children and nesting are unchanged. The importing route adds `import { Container } from "@unbnd/ui";`. No site passes `as` or `className` (all are bare `<div className="page">`). The rendered output is `class="page"` on a `<div>` — identical to today. The 16 sites span the 12 route files in §Context.

### 4. Guard strategy — a narrow, honestly-green-able guard

The story's headline open question: is a guard green-able under partial coverage? A guard demanding *all* layout flow through primitives would be **red on day one** (Stack/Grid/rate/auth stay bespoke by design) — not green-able, so not added (the ADR 0048 §5 honesty: a guard must be green the moment it lands). But a **narrow, scoped guard is honestly green-able here** and worth adding, because it locks the one win:

- **New guard: "no raw page-frame outside `Container`."** Scan `apps/web/src` (CSS + TS/TSX) for any use of `var(--page-max)` or `var(--page-pad-x)`; the **only** legitimate consumers are (a) the package `Container.css` (allowlisted) and (b) the `.rate` frame in `RatingControl.css`, the one recorded bespoke divergent frame (allowlisted with a comment citing this ADR). Any *new* raw `--page-max`/`--page-pad-x` usage in app code is an offender. Mirrors `packages/ui/test/architecture-spacing-literals.test.ts` exactly (REPO resolve, `walk()` + `SKIP_DIRS`, `readFileSync`, single aggregated `expect(offenders).toEqual([])`), with the allowlist naming `packages/ui/src/components/Container.css` and `apps/web/src/components/RatingControl.css`.
  - **Green-ability check:** after the move, the *only* app-CSS uses of `--page-max`/`--page-pad-x` are `.rate` (allowlisted) — `base.css`'s `.page` is gone (moved into the package). The package `Container.css` is the canonical home (allowlisted). So the offender set is empty → **green the moment it lands**, red forever on a hand-rolled page frame. This is the analogue of the spacing guard's "tokens only in the token file" lock, scoped to the page-frame tokens.
  - **Why not broader:** a guard forbidding raw `display:flex`/`grid` (to force Stack/Grid) is red on day one and is not added; this ADR adds only the page-frame-token guard, which is true under the honest partial scope. (The existing spacing-literals guard already permits `var(--…)` anywhere, so it does **not** lock these tokens to `Container` — hence the new scoped guard is additive, not redundant.)

This is a single new Vitest test under the existing `pnpm -r test`; it adds no tooling (CLAUDE.md / ADR 0038 §6). If the gate prefers the Story-47/48 "no new guard under partial coverage" posture, the alternative is to add **no** guard and rely on the visual gate plus review — but because this guard *is* green-able and locks the exact win, the recommendation is to add it.

## Consequences

- **Enables:** the page-frame declarations ship from `@unbnd/ui` as a single typed `Container` primitive (ADR 0038 §5 "structure separated from skin" on the one truly-shared screen frame); the new guard makes the win permanent (no hand-rolled page frame can reappear in app CSS).
- **Constrains / makes harder:** the layout axis lands **partial by design** — `Stack`/`Grid` are not primitivized (escalated; a future deliberate story may revisit if a dominant pattern emerges). A future page that wants a `<main>` landmark must pass `as="main"` (the prop carries it; no styling changes). The `.rate` frame stays bespoke and is now the lone app-side consumer of the page-frame tokens (allowlisted in the guard).
- **New debt / follow-ups:** (1) `Stack`/`Grid` conversion remains deferred (recorded escalation, not introduced by this story); (2) the `.rate` frame could fold into `Container` only via a deliberate visual-change story (it differs in padding + border — normalizing changes pixels); (3) the doc re-point (`CLAUDE.md`/`AGENTS.md` to cite `@unbnd/ui` + the guards) is epic story 14, not here.
- **Affects existing fixtures?** No. Pure presentation refactor; no `apps/web/src/data/` change, no DList shape, no `view-model.ts` change.
- **New dependency?** No. `@unbnd/ui` is React-ready since Story 45; `Container` depends only on `react`. No new tooling; the guard is a Vitest test under the existing runner.
- **PRD section change required?** No. Touches no product surface; nowhere near PRD §11.3. Phase-2 platform hardening under Epic 0001 (ADR 0038). Invisible to Readers, Curators, Authors.

## Implementation notes

Concrete anchors (Architect is read-only on source; these are targets for the Implementer):

- **New: `packages/ui/src/components/Container.tsx` (+ `Container.css`).** Component per §2 (polymorphic `as` default `"div"`, additive layout-only `className` emitted as `"page <extra>"`, `children`). `Container.css` carries the three `.page` declarations verbatim (§1), imported via `import "./Container.css"`.
- **Export** from `packages/ui/src/index.ts`: `export { Container } from "./components/Container"; export type { ContainerProps } from "./components/Container";` (mirror the `Avatar`/`Field` re-export lines; add a doc-comment citing Story 49 / ADR 0049 / ADR 0038 §5).
- **Remove** the `.page` rule from `apps/web/src/styles/base.css` (lines 59–63). Leave every other rule in `base.css` untouched.
- **Migrate the 16 sites:** in each route file (`Home`, `Search`, `Browse`, `GenreBrowse`, `BookDetail` ×3, `Profile`, `ProfileMe` ×2, `Submit`, `Settings` ×2, `CommunitySubmissions`, `About`, `NotFound` — exact lines in §Context), replace `<div className="page">` with `<Container>` and add `import { Container } from "@unbnd/ui";`. No `as`/`className` is passed (all sites are bare `<div className="page">`). Children and nesting unchanged.
- **New guard: `packages/ui/test/architecture-page-frame.test.ts`** (§4). Copy the structure of `architecture-spacing-literals.test.ts` (REPO resolve, `walk()` over `apps/web/src` + `packages/ui`, `SKIP_DIRS`, `readFileSync`, aggregated `expect(offenders).toEqual([])`). Offender = any `var(--page-max)`/`var(--page-pad-x)` use outside the allowlist `{ packages/ui/src/components/Container.css, apps/web/src/components/RatingControl.css }`. Confirm green after the move (the only remaining app-CSS use is `.rate`, allowlisted).
- **Do NOT touch (escalated / fenced):** all flex `Stack`-shaped layouts; both `Grid`s (`.bgrid`, `.genre-grid`); the `.rate` frame (`RatingControl.css`); the auth shell (`AuthShell.tsx`/`.auth-page`).
- **Verify:** `pnpm -r typecheck`, `pnpm -r test` (all prior guards 38–47 + the new page-frame guard + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job **zero-diff with no baseline update**. If any `.page` site somehow does not reproduce byte-identical, that site is **escalated** (left bespoke) for an Architect decision, never re-baselined — but the survey predicts all 16 convert cleanly (one shared class, no descendant selectors, all `<div>`, no extra classes).

## Out of scope

- **`Stack` and `Grid` primitives / conversion.** Left bespoke / deferred per the survey (no dominant zero-diff cluster; two bespoke grids; inherently per-screen). Not built here. A future deliberate story may revisit.
- **The divergent `.rate` frame and the `auth-card`/`.auth-page` shell.** Left bespoke (different frames). Untouched; the `.rate` token usage is the lone allowlisted app-side page-frame consumer.
- **Any layout REDESIGN, reflow, or normalization.** This story reproduces the page frame's current pixels exactly. It does NOT unify flex gaps/alignments, the two grids, or any breakpoint cascade. Each such change alters pixels, fails the Story-39 gate, and is a separate, deliberate, design-reviewed visual-change story.
- **No re-skin `className` escape hatch** (ADR 0038 §2): the `Container` `className` is additive layout-only and can never restyle the frame.
- **No new token.** `Container` references only existing `--page-max`/`--page-pad-x`/`--u-space-32`.
- **Token / motion / component / theming work.** Stories 40–44 (tokens), 45–48 (Button/IconButton/Icon/Link/Pill/Avatar/Field/Label/motion), 13 (theming/dark-mode) own those. This story mints no token and builds no non-layout primitive.
- **Doc re-point.** Updating `CLAUDE.md`/`AGENTS.md` to cite `@unbnd/ui` and the guards is epic story 14. This story leaves the docs as they are.
- **Behavior, copy, or information-architecture change.** No screen gains, loses, or changes a handler, label, route, or content. The render is byte-identical, proven zero-diff against the Story-39 harness with no baseline update.

## Open questions for the gate

- **OQ-1 (the guard call — confirm).** Add the narrow "no raw page-frame (`--page-max`/`--page-pad-x`) outside `Container`" guard (recommended — it is green-able the moment it lands and locks the exact win), OR follow the Story-47/48 "no new guard under partial coverage" posture and add none. The recommendation is to add it because, unlike the no-raw-`<input>` guard ADR 0048 could not green, this one *is* green after the move (only `.rate` remains, allowlisted).
- **OQ-2 (`.rate` in the guard allowlist).** Confirm `.rate` (RatingControl.css) is allowlisted as the one legitimate bespoke app-side consumer of the page-frame tokens, with a comment citing this ADR — versus requiring `.rate` to also move into the package (rejected: `.rate` is a different frame, not `Container`; folding it changes pixels or grows the prop surface).
- **OQ-3 (class emission — confirm A over B).** Confirm `Container` emits the literal `.page` class (Option A, by-construction zero-diff + descendant-selector-safe) rather than a renamed `.u-container` (Option B, visually zero-diff but markup-different and removes the safety margin). The recommendation is A.
