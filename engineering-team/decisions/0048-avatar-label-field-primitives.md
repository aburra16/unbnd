# ADR 0048: `Avatar`, `Label`, and `Field` primitives (Story 47b) — the clean `Avatar` MOVE, the consistent `Label` skin, layout-only `Field`, and the `Input`-skin escalation

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/done/47-form-surface-primitives.md`

**Accepted 2026-06-04** (auto-mode epic closeout). Scope: `Avatar` MOVE into `@unbnd/ui` byte-identical, `Label` primitive (consistent skin), layout-only `Field` (preserves the divergent wrapper classes). **`Input` ESCALATED to left-bespoke** — its 4 input skins are accidentally inconsistent (padding/font-size/focus-ring/border/bg differ), so a zero-diff `Input` would need the banned `tone`-grab-bag or normalization; left bespoke (token-backed), a future deliberate visual-change story. Consistent with the user's "leave inconsistent ones bespoke" directive. No new guard (partial coverage). `Card` stays out (Story-47 scope).

Refining ADR under the umbrella **ADR 0038** (§2 primitive component library + the additive-layout-only `className` rule, §6 CI guards, §7 no-build-step package + co-located CSS). Held to the gate set by **ADR 0039** (the Story-39 Playwright `visual` job, `maxDiffPixelRatio: 0`). Builds on **ADR 0045** (the `@unbnd/ui` React-component + co-located-CSS pattern, the `components/` directory), **ADR 0046** (the byte-identical-NOT-normalization discipline), and **ADR 0047** (Story 47a, `Link`/`Pill`; this is the second of the two Story-47 refining ADRs). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 10). It does not relitigate the prior ADRs.

**This is the clean-MOVE half of Story 47 (47b), with no deferral obligation.** Per ADR 0047 §Decision 0 the story is split: 47a (`Link` + `Pill`, ADR 0047) cleared the Story-45 deferrals; 47b (this ADR) is the form/surface half. **`Card` is scoped out of all of Story 47** by binding user decision (the ~30 bespoke parchment surfaces stay bespoke + token-backed; a `Card` primitive would require normalization, which is banned).

**This is a zero-diff refactor, NOT a Story-45-style normalization.** Every instance this ADR migrates renders byte-identical; no baseline is updated. Where an instance cannot be reproduced byte-identical by a clean API it is **ESCALATED** (left bespoke), never normalized. **This ADR contains one such escalation** — the `Input` *skin* is accidentally inconsistent across the four forms (verified below), so a zero-diff `Input` primitive that *owns the skin* is impossible; `Input` is escalated to "left bespoke" and only the genuinely-consistent `Label` skin is primitivized, with `Field` as a layout-only composition. This is exactly the escalate-don't-normalize discipline the story mandates.

## Context

### Acceptance criteria carried by 47b (from the story)

- `@unbnd/ui` provides the in-scope typed form/surface primitives, exported from `packages/ui/src/index.ts` mirroring the `Button`/`IconButton`/`Icon`/`Link`/`Pill` precedent, each styled only against existing semantic tokens, minting none; no re-skin `className` (any `className` is additive layout-only per ADR 0038 §2).
- `Avatar` is MOVED into `@unbnd/ui` with all its call sites re-pointed, rendering byte-identical.
- The consistent input/label skin is primitivized; the four divergent field-wrapper classes (`sub-field`/`auth-field`/`set-field`/`author-edit-field`) are preserved as layout-only at the call sites where they differ; the checkbox/switch and search inputs are fenced out.
- Every migrated instance is byte-identical; the Story-39 `visual` job is zero-diff with no baseline update. Any instance a clean API cannot reproduce byte-identical is escalated, never silently changed.
- `pnpm -r typecheck`, `pnpm -r test` (incl. all prior guards), `pnpm --filter @unbnd/web build` all pass.

### The verified survey (read directly against `apps/web/src` on `story-47-form-surface-primitives`, 2026-06-04)

**`Avatar` — CLEAN. A near-direct lift.** `apps/web/src/components/Avatar.tsx` (+ `Avatar.css`) is one well-factored component: it renders a kind-0 picture `<img className="avatar avatar-img">` or a deterministic initials `<span className="avatar avatar-initials">`, sized by `size` (default 30), colored from `GENRE_PALETTE` (already token-sourced, ADR 0040), with a broken-image fallback. **One look.** Already imports from `@unbnd/ui` (`GENRE_PALETTE`). Direct importers: `RatedByRow.tsx`, `AccountMenu.tsx`, `ProfileMe.tsx`, `Profile.tsx` (4 files); the fifth call site (`acct-trigger` `IconButton` child) is inside `AccountMenu.tsx`, already counted. Unit test exists at `apps/web/test/components/avatar.test.tsx`. **Assessment: zero-diff by construction (a MOVE).**

**`Label` — CONSISTENT skin. Cleanly primitivizable.** The label skin is byte-identical across three of the four forms (verified):
- `auth-field label`, `sub-field label`, `set-field label` all = `font-size-12` / `weight-medium` / `color --u-ink-tint-70`.
- `sub-field label` additionally has `display:flex; align-items:center; gap --u-space-8` — that is **layout** (it lays out an inline hint glyph beside the text), not skin.
- `author-edit-field` is the **outlier**: the label IS the wrapper (`<label className="author-edit-field">` with implicit association), styled `font-size-13` / `color --u-muted` — a different skin and a different composition. It is fenced out of `Label` (see Decision).

**`Field` — LAYOUT-only, four divergent wrappers.** `auth-field` / `sub-field` / `set-field` are each `display:flex; flex-direction:column; gap --u-space-5` (`sub-field` and `auth-field` identical; `set-field` identical). `author-edit-field` differs (`gap --u-space-4` + label skin baked in). The wrappers also carry sibling layout (`.sub-row > .sub-field { flex:1 }`). These are layout containers, not skins.

**`Input` — ACCIDENTALLY INCONSISTENT skin (the escalation).** This contradicts the PO survey's "input skin is close/largely consistent." A line-accurate read of the four input skins:

| Form | padding | font-size | border | background | focus |
|---|---|---|---|---|---|
| `auth-field input` | `10 14` | **14** | `1px --u-border-hover` | `--u-surface-card` | amber border + `--u-elevation-ring-10` |
| `sub-field input/select/textarea` | `9 14` | **13** | `1px --u-border-hover` | `--u-surface-card` | amber border + `--u-elevation-ring-08` |
| `set-field input` | `9 14` | **13** | `1px --u-border-hover` | `--u-surface-card` | amber border, **NO box-shadow ring** |
| `author-edit-field input/textarea` | `8 10` | inherit (13) | `1px **--u-line-300**` | `**--u-surface-input**` | (none defined) |

The four input skins differ in **padding** (`10 14`/`9 14`/`8 10`), **font-size** (14 vs 13), **focus ring** (`ring-10`/`ring-08`/none), **border token** (`--u-border-hover` vs `--u-line-300`), and **background token** (`--u-surface-card` vs `--u-surface-input`). A single `Input` primitive that OWNS the skin cannot reproduce all four byte-identical without a grab-bag of per-form skin props — the exact `tone`-grab-bag debt ADR 0045 escalated and the standing quality bar forbids. **This is an ESCALATION:** `Input` is escalated to "left bespoke" (the four input skins stay on their per-form field-wrapper CSS, untouched). Normalizing them onto one input skin is a separate, deliberate, design-reviewed visual-change story.

**Fenced out (NOT this primitive, confirmed):**
- `ToggleSwitch.tsx` `<input type="checkbox">` — a styled switch with its own `.toggle` look, not a text field. Out.
- `SearchBox.tsx` `<input type="text">` — the search box with its own `searchbox-*` skin and adjacent controls. Out (stays a composed search control).
- `<select>` (Submit, ShelfControl, TagControl), `<input type="number">`, `<textarea>` — these share the per-form `sub-field`/etc. skin; since `Input` is escalated, they too stay bespoke. Out.
- `DuplicateCheck.tsx` / `ShelfControl.tsx` checkbox/number inputs — out (signal/switch/search-shaped, not the labeled-text primitive).

### Constraints that bind this design

- **Zero-diff, gated by Story-39** (ADR 0039, `maxDiffPixelRatio: 0`). No baseline moves.
- **No new tooling / no package-config change** (`@unbnd/ui` is React-ready from Story 45). **No new tokens** (the primitives reference only existing `var(--u-*)`).
- **No new dependency.** `Avatar` already depends only on `react` + `@unbnd/ui`'s `GENRE_PALETTE` (an internal export), so moving it INTO `@unbnd/ui` removes a cross-package import, not adds one.
- **The `className` rule** (ADR 0038 §2): additive layout-only, never a re-skin.
- **No AI-slop** in any doc-comment this work authors.
- In-repo prior art governs; the Tapestry branch survey does not apply (story "DList shapes touched: None").

## Options considered (47b)

The load-bearing decisions: (1) `Avatar` placement (MOVE vs re-export shim) and its test; (2) whether to build `Input` at all given the divergent skin; (3) how `Label`/`Field` compose while preserving the four wrappers as layout-only.

### Option A — MOVE `Avatar` into `@unbnd/ui`; primitivize the consistent `Label` skin; `Field` is a layout-only wrapper that PRESERVES the four divergent wrapper classes; `Input` is ESCALATED to left-bespoke (CHOSEN)

- **`Avatar`** moves verbatim into `packages/ui/src/components/Avatar.tsx` (+ `Avatar.css`), exported from `index.ts`; the four importers re-point from `../components/Avatar` to `@unbnd/ui`; the unit test moves to `packages/ui/test/avatar.test.tsx`. Byte-identical by construction.
- **`Label`** is a thin primitive emitting the consistent label skin (`font-size-12`/`weight-medium`/`--u-ink-tint-70`); the three `htmlFor`-pattern forms (`auth`/`sub`/`set`) route their `<label>` through it. `sub-field label`'s extra `display:flex/gap` (the inline-hint layout) stays as an additive layout-only class on the call site. `author-edit-field`'s wrapper-label is fenced out (different skin + implicit-association composition).
- **`Field`** is a layout-only composition wrapper that **preserves each form's divergent wrapper class** (`auth-field`/`sub-field`/`set-field`) as the additive layout-only `className` — it does NOT own a skin; it provides the `flex-column + gap` column and slots the `Label` + the (bespoke, escalated) input. Because the wrappers genuinely differ, `Field` carries the form's wrapper class through rather than minting one look.
- **`Input` is ESCALATED to left-bespoke:** the four input skins are accidentally inconsistent (verified), so no zero-diff `Input` owns them. The inputs stay raw `<input>`/`<textarea>`/`<select>` with their per-form `*-field input` skin CSS, untouched.

- Pros: every migrated instance is byte-identical; the escalation is honest and recorded (no `tone`-grab-bag debt); `Avatar` is centralized cleanly; `Label` captures the one genuinely-consistent skin; `Field` separates layout from the (divergent) skin without a re-skin hatch; no normalization, no baseline move.
- Cons: 47b ships only `Avatar` + `Label` (+ a layout `Field`), not the full forms primitive set the umbrella named — `Input` is deferred to a future deliberate story. This is the correct, mandated outcome (escalate-don't-normalize), but it means the forms axis lands partial, as the epic anticipates for the inconsistent surfaces.

### Option B — Build a single `Input` primitive that owns the skin via per-form `variant` props (reproduce all four skins zero-diff)

`Input` carries `variant="auth"|"submit"|"settings"|"author-edit"` each mapping to that form's skin.

- Pros: every input goes through one component; zero-diff today.
- Cons: **this is the `tone`-grab-bag ADR 0045 escalated and rejected** — four per-form skin variants encode accidental drift as if it were intentional design, exactly the debt the epic exists to remove and the quality bar forbids. A future input restyle would have to reason about four "form" variants that are really just drift. Rejected on the same grounds ADR 0045 rejected Option A's `tone` axis.

### Option C — Normalize the four input skins onto one `Input` look now (Story-45-style)

Pick one canonical input skin and migrate all four to it, updating baselines.

- Pros: the cleanest end state (one input look); enables a real `Input` primitive.
- Cons: **banned.** The user re-grounded every remaining epic story as zero-diff; Story 45's normalization was a one-time, explicitly-authorized deviation that must not be repeated. Normalizing the inputs changes pixels on four forms and fails the Story-39 gate. Rejected: it is a separate, deliberate, design-reviewed visual-change story, not 47b.

## Decision (47b)

We choose **Option A**. It MOVES `Avatar` byte-identical, primitivizes the one genuinely-consistent skin (`Label`), provides a layout-only `Field` that preserves the four divergent wrappers without a re-skin, and **escalates `Input` to left-bespoke** because its skin is accidentally inconsistent and any zero-diff `Input` that owned the skin would be the `tone`-grab-bag debt ADR 0045 escalated (Option B) — and normalizing it (Option C) is banned. This is the escalate-don't-normalize discipline the story mandates, applied honestly: 47b lands `Avatar` + `Label` + layout `Field`, and records the `Input` skin unification as a future deliberate visual-change story.

### 1. `Avatar` — placement, contract, and test

- **Placement: MOVE (not a re-export shim).** `apps/web/src/components/Avatar.tsx` + `Avatar.css` move to `packages/ui/src/components/Avatar.tsx` + `Avatar.css`, mirroring `Button`/`IconButton`/`Icon`/`Link`/`Pill`. A re-export shim is rejected (it leaves a second public surface for one component, diluting the "one home" gain, the same reasoning ADR 0046 used to delete `SearchIcon`/`LogoMark` rather than shim them). The `import { GENRE_PALETTE } from "@unbnd/ui"` becomes an intra-package relative import (`from "../palette"` or wherever `GENRE_PALETTE` is defined) — a cleanup, since the component now lives in the same package as the palette.
- **Contract: unchanged.** `{ label: string; seed: string; picture?: string; size?: number }`, default `size = 30`. The `useState` broken-image fallback, the FNV-1a `hash`, the `initialsOf` derivation, and the `BGS`/`INKS = GENRE_PALETTE.map(...)` order are carried verbatim — byte-identical output. The `className` is NOT exposed (Avatar has no call site that passes one; adding one would be a re-skin vector — omit it, consistent with the no-re-skin rule).
- **Export:** `export { Avatar } from "./components/Avatar"; export type { … } from "./components/Avatar";` in `packages/ui/src/index.ts`.
- **Test: MOVE alongside.** `apps/web/test/components/avatar.test.tsx` moves to `packages/ui/test/avatar.test.tsx` (the package's `vitest.config.ts` includes `test/**`). Confirm the package's vitest config resolves a `.tsx` render test (Story 45 added `@types/react`/`jsx`/`DOM`; if the package's vitest needs a DOM environment for the render test, the Implementer confirms `happy-dom`/`jsdom` is available to the package or keeps the test in `apps/web/test` — **OQ-1**, a small Implementer call; the test must keep passing wherever it lands). Recommend MOVE if the package's vitest already has a DOM env; otherwise keep in `apps/web/test` and re-point the import to `@unbnd/ui`.

### 2. `Label` — the consistent skin primitive

`Label` lives at `packages/ui/src/components/Field.tsx` (co-located with `Field`, since they compose) + `Field.css`.

```ts
// packages/ui/src/components/Field.tsx (shape sketch)
import type { LabelHTMLAttributes, ReactNode } from "react";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;            // the explicit-association pattern (auth/sub/set forms)
  className?: string;          // ADDITIVE LAYOUT-ONLY (e.g. sub-field's inline-hint flex)
  children: ReactNode;
}
```

- Emits `<label class="u-label [className]">`; `.u-label` in `Field.css` = `font-size-12` / `weight-medium` / `color --u-ink-tint-70` (the verified-consistent skin). References only `var(--u-*)`.
- The `auth`/`sub`/`set` `<label htmlFor>` sites route through `Label`. `sub-field label`'s `display:flex; align-items:center; gap --u-space-8` (the inline-hint layout) is passed as an additive layout-only `className` (a slimmed class carrying only those three layout rules).
- **`author-edit-field` is fenced out:** its label is the wrapper itself (implicit association) with a different skin (`13`/`--u-muted`). It is NOT routed through `Label` (different skin + composition); it stays bespoke, untouched.

### 3. `Field` — layout-only composition that preserves the four wrappers

`Field` is a layout-only wrapper, NOT a skin:

```ts
export interface FieldProps {
  className?: string;          // the form's divergent wrapper class (auth-field / sub-field / set-field)
  children: ReactNode;         // a <Label> + the (bespoke) input
}
```

- Emits `<div class="u-field [className]">` where `.u-field` = `display:flex; flex-direction:column; gap --u-space-5` (the common column shared by `auth`/`sub`/`set`). The form's wrapper class is passed as additive layout-only `className` so any per-form sibling layout (`.sub-row > .sub-field { flex:1 }`) keeps matching.
- **WATCH-POINT (zero-diff):** the wrapper `gap` is `--u-space-5` for all three (`auth`/`sub`/`set` verified identical), so `.u-field` can own it; the per-form class then carries only what differs (sibling layout). If any form's wrapper `gap` actually differs, `Field` must NOT own the `gap` (it would re-skin layout) — the Implementer confirms all three are `--u-space-5` before letting `.u-field` own it; if not, the `gap` stays on the per-form class and `.u-field` owns only `flex-direction:column`. (**OQ-2**.)
- **`author-edit-field` is fenced out** (it uses `gap --u-space-4` and bakes the label skin in); it stays a bespoke `<label className="author-edit-field">` wrapper, untouched.

### 4. `Input` — ESCALATED to left-bespoke (the recorded escalation)

The four input skins are accidentally inconsistent (§Context table). Per the escalate-don't-normalize rule:
- **No `Input` primitive is built in 47b.** The raw `<input>`/`<textarea>`/`<select>` elements stay at their call sites with their per-form `*-field input` skin CSS, untouched and byte-identical.
- This is recorded as a **future deliberate visual-change story**: unify the four input skins onto one canonical input look (picking padding/font-size/focus-ring/border/background), then build a real `Input` primitive owning that one skin, updating the Story-39 baselines per ADR 0039's intentional-change path. That story is design-reviewed; 47b does not do it.
- The checkbox/switch (`ToggleSwitch`), the search box (`SearchBox`), `<select>`, `<textarea>`, and `<input type="number">` are likewise out (they share the escalated input skin or are their own controls).

### 5. Guard strategy (be honest: no new green-able guard in 47b)

**47b adds no new guard, and the ADR states why honestly.** A "no raw `<input>`" guard CANNOT be green: `Input` is escalated to left-bespoke, so dozens of legitimate raw `<input>`/`<textarea>`/`<select>` remain in `apps/web/src` by design (auth/submit/settings/author-edit forms, the search box, the switch). A guard forbidding raw `<input>` would trip on all of them. Per ADR 0038 §6 a guard must be green the moment it lands; this one cannot be, so it is NOT added. (The future input-unification story that builds a real `Input` primitive would add the no-raw-`<input>` guard then, with an allowlist naming the primitive source + any fenced controls.)

`Avatar`/`Label`/`Field` introduce no element a guard covers (no `<button>`/`<svg>`; `Avatar` renders `<img>`/`<span>`, confirmed by ADR 0046 to be `<svg>`-free). All prior guards (38–47a) stay green: the moved `Avatar.css`/`Field.css` reference only existing `var(--u-*)` tokens (the color/spacing/radius/type/motion guards hold); no `<svg>` (Story-46 guard holds); no raw `<button>` added (the Story-45 guard, already shrunk by 47a, holds); the moved Avatar CSS is now package code, outside the app-CSS guards' scan — confirm the guards' `SCAN_ROOT` already excludes `packages/ui/src` (they do, per ADR 0046).

## Consequences

- **Enables:** `Avatar` is centralized in `@unbnd/ui` (one home, the cross-package `GENRE_PALETTE` import becomes intra-package); the one genuinely-consistent label skin is a `Label` primitive; `Field` separates layout from the (divergent) input skin without a re-skin hatch.
- **Constrains / makes harder:** the forms axis lands **partial** — `Input` is not primitivized (escalated). A future input restyle still touches four per-form skins until the input-unification story lands. The `author-edit-field` label/wrapper stays bespoke (different skin + implicit-association composition).
- **New debt / follow-ups:** (1) the **input-skin unification + real `Input` primitive + no-raw-`<input>` guard** is a future deliberate, design-reviewed visual-change story (it changes pixels on the four forms, so it updates baselines per ADR 0039) — this is the one genuine escalation 47b records; (2) `author-edit-field`'s label composition could fold into `Label`/`Field` only after that unification (or with its own deliberate decision); (3) the search box and switch await their own composed primitives if ever wanted. None is introduced by 47b; the `Input` divergence is pre-existing drift, now recorded.
- **Affects existing fixtures?** No. Pure component-extraction + migration; no `apps/web/src/data/` fixture change, no DList shape.
- **New dependency?** No. `Avatar` depends only on `react` + the package's own `GENRE_PALETTE`; moving it in removes a cross-package import. No new tooling; no package-config change (React-ready since Story 45).
- **PRD section change required?** No. Touches no product surface; nowhere near PRD §11.3. Phase-2 platform hardening under Epic 0001 (ADR 0038).

## Implementation notes

Concrete anchors (Architect is read-only on source; these are targets):

- **MOVE: `apps/web/src/components/Avatar.tsx` + `Avatar.css` → `packages/ui/src/components/Avatar.tsx` + `Avatar.css`.** Carry the component verbatim (the `hash`, `initialsOf`, `BGS`/`INKS` order, the broken-image `useState` fallback, default `size = 30`). Change `import { GENRE_PALETTE } from "@unbnd/ui"` to the intra-package relative import. Add `export { Avatar } from "./components/Avatar"` (+ its prop type) to `packages/ui/src/index.ts`.
- **Re-point importers:** `RatedByRow.tsx`, `AccountMenu.tsx`, `ProfileMe.tsx`, `Profile.tsx` change `import { Avatar } from "../components/Avatar"` (or `./Avatar`) to `import { Avatar } from "@unbnd/ui"`. No JSX change (the `acct-trigger` `IconButton` child in `AccountMenu` is the fifth usage, already covered by AccountMenu's re-point).
- **MOVE the test:** `apps/web/test/components/avatar.test.tsx` → `packages/ui/test/avatar.test.tsx` (re-point its import to the package), IF the package vitest has a DOM env; else keep it in `apps/web/test` re-pointed to `@unbnd/ui` (OQ-1).
- **New: `packages/ui/src/components/Field.tsx` (+ `Field.css`).** `Label` (`.u-label` = the consistent label skin) and `Field` (`.u-field` = `flex-column + gap --u-space-5`, layout-only). Export both from `index.ts`: `export { Field, Label } from "./components/Field"; export type { FieldProps, LabelProps } from "./components/Field";`.
- **Migrate the labels (byte-identical):** the `<label htmlFor>` sites in `AuthEmailSignup.tsx` (3), `Submit.tsx` (the labeled-text fields), `Settings.tsx` (3) route through `<Label htmlFor=…>`; `sub-field label`'s inline-hint `display:flex/gap` stays as a slimmed layout-only class. Wrap the `Label`+input in `<Field className="auth-field|sub-field|set-field">`. The input stays a raw `<input>` (escalated). Delete the label *skin* rules from `AuthForm.css`/`Submit.css`/`Settings.css` (now owned by `.u-label`), keeping the per-form input skin and any sibling layout untouched.
- **Do NOT touch (escalated / fenced):** all `<input>`/`<textarea>`/`<select>` skins (`*-field input`); `ToggleSwitch`; `SearchBox`; `author-edit-field` (label + wrapper + input all stay bespoke).
- **Guard:** NO new guard (the no-raw-`<input>` guard cannot be green while `Input` is escalated — stated, not added). Confirm all prior guards (38–47a) stay green after the Avatar MOVE and the label migration.
- **Verify:** `pnpm -r typecheck`, `pnpm -r test` (the moved Avatar test + all prior guards + web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job **zero-diff with no baseline update**.

## Open questions for the gate

- **OQ-1 (`Avatar` test location).** MOVE the test to `packages/ui/test/` (if the package vitest has a DOM env for a `.tsx` render test) vs keep it in `apps/web/test/` re-pointed to `@unbnd/ui`. Either keeps it green; the Implementer confirms the package's vitest environment.
- **OQ-2 (`Field` `gap` ownership).** Confirm `auth-field`/`sub-field`/`set-field` all use `gap --u-space-5` (verified for all three) so `.u-field` can own it zero-diff; if any differs, `.u-field` owns only `flex-direction:column` and the `gap` stays per-form.
- **OQ-3 (the `Input` escalation — confirm the call).** Confirm the binding decision: `Input` is escalated to left-bespoke because the four input skins are accidentally inconsistent (the verified table), and a zero-diff `Input` owning the skin would be the `tone`-grab-bag debt ADR 0045 rejected. The input-skin unification is a future deliberate visual-change story. (If the gate instead wants the inputs normalized now, that re-classifies 47b as a Story-45-style visual-change story, which the user's re-grounding bans — so the escalation is the expected resolution.)

## Out of scope

- **Any visual change / normalization / redesign.** 47b reproduces every migrated instance's current pixels exactly. It does NOT unify the four input skins, the field wrappers, or the `author-edit-field` label.
- **`Input` (the primitive) and the input-skin unification:** escalated to a future deliberate visual-change story (the input skins are accidentally inconsistent; unifying them changes pixels).
- **The checkbox/switch (`ToggleSwitch`), the search box (`SearchBox`), `<select>`, `<textarea>`, `<input type="number">`:** fenced out; untouched.
- **`author-edit-field`** (label + wrapper + input): left bespoke; untouched.
- **`Card`** (the ~30 bespoke parchment surfaces): scoped out of all of Story 47 by user decision; stays bespoke + token-backed; any unification is a future deliberate, design-reviewed story (it would require normalization).
- **`Link`/`Pill`:** Story 47a (ADR 0047).
- **`Button`/`IconButton`/`Icon`:** shipped (Stories 45/46); not re-designed.
- **No re-skin `className` escape hatch** (ADR 0038 §2): the `className` on `Avatar` (omitted), `Label`, `Field` is additive layout-only.
- **Any token change:** the token system is complete (Stories 40–44); 47b mints none.
- **Doc re-point** (`CLAUDE.md`/`AGENTS.md`): epic story 14.
- **Behavior, copy, or IA change:** no instance gains/loses/changes a handler, label, destination, or `type`.
