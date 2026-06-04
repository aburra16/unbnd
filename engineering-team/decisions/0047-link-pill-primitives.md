# ADR 0047: `Link` and `Pill` primitives (Story 47a) — clearing the Story-45 Pill/Link deferrals byte-identical, the link-as-button reproduction, and the shrunk button-guard `DEFERRED` set

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/47-form-surface-primitives.md`

**Accepted 2026-06-04** (auto-mode epic closeout). Scope per the user's "clean primitives only, zero-diff" decision: `Link`+`Pill` for the consistent looks, clear the four Story-45 deferrals byte-identical, leave bespoke nav/footer/byline links + signal pills as-is. Open questions are zero-diff reproduction detail / Implementer latitude. The only guard change is shrinking the Story-45 `DEFERRED` set from 5 to 1 (no new Link/Pill guard — partial coverage).

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03; §2 primitive component library + the "a `className`, if allowed at all, is additive layout-only and never a way to re-skin" rule, §6 CI guards, §7 no-build-step package + co-located CSS). Held to the gate set by **ADR 0039** (the Story-39 Playwright `visual` job, `maxDiffPixelRatio: 0`: a single-pixel drift fails the job and is investigated, not re-baselined). Builds directly on **ADR 0045** (`Button`/`IconButton`: the `@unbnd/ui` React-component + co-located-CSS pattern, the `components/` directory, the no-raw-`<button>` guard with its **`DEFERRED` countdown allowlist** this story shrinks, and the `Button.css` ownership model the link-as-button reproduction reuses) and **ADR 0046** (the `Icon` registry's **byte-identical, NOT-a-normalization** discipline this story follows). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 10). It does not relitigate 0038, 0039, 0045, or 0046.

**This is the first of two refining ADRs for Story 47.** Per the SPLIT decision (§Decision 0 below), Story 47 is split into **47a** (`Link` + `Pill`, this ADR) and **47b** (`Avatar` + `Label`/`Field`, ADR 0048). 47a is the *obligation half*: it clears the Story-45 Pill/Link `DEFERRED` entries and the link-as-button residue. 47b is the *clean-MOVE half* with no deferral obligation. `Card` is **SCOPED OUT of the whole of Story 47** (§Out of scope) by binding user decision.

**This is a zero-diff refactor, NOT a Story-45-style normalization.** Story 45 was a one-time, user-authorized normalization that updated baselines on purpose. The user has re-grounded every remaining epic story as **structural/modularity only — invisible to users, NO new features, ZERO-DIFF.** Every instance this ADR migrates renders **byte-identical**: same markup output, same classes preserved where they also carry layout, same tokens, same `aria`/`role`/focus/keyboard treatment, same default sizes, same `href`/`to`/handler. Where an instance cannot be reproduced byte-identical by a clean API it is **ESCALATED** (deferred or left bespoke), **never** normalized. No baseline is updated.

## Context

### Acceptance criteria carried by 47a (from the story)

- `@unbnd/ui` provides typed `Link` and `Pill` primitives, exported from `packages/ui/src/index.ts` mirroring the `Button`/`IconButton`/`Icon` precedent, each styled only against existing semantic tokens, minting none; state/variant on real typed props, no re-skin `className` (any `className` is additive layout-only per ADR 0038 §2).
- The Story-45 Pill/Link deferrals are cleared: `gps-pill` + `rated-by-more` render through `Pill`; `auth-linklike` ×2 + `sub-back` render through `Link`; the four corresponding entries are removed from `DEFERRED_CLASSES` in `architecture-button-literals.test.ts`, leaving only `searchbox-hit`, and the button guard stays green.
- The link-as-button affordances (`cta-btn` `<a>`, `auth-submit`/`auth-btn-secondary` `<Link>`s) render byte-identical to the `Button` primitive while remaining real anchor/route links with their current `href`/`to`.
- The existing `GenrePill` is folded into / re-exported from `Pill`.
- Every migrated instance is byte-identical; the Story-39 `visual` job is zero-diff with no baseline update. Any instance a clean API cannot reproduce byte-identical is escalated, never silently changed.
- `pnpm -r typecheck`, `pnpm -r test` (incl. the shrunk button guard + all prior guards), `pnpm --filter @unbnd/web build` all pass.

### The verified survey (read directly against `apps/web/src` on `story-47-form-surface-primitives`, 2026-06-04)

The PO survey is the grounding read. A line-accurate re-read confirms the in-scope `Link`/`Pill` subset and **sharpens two findings the API depends on**.

**The two Story-45 deferred pills are genuinely distinct looks (neither is `GenrePill`):**

- **`GenrePill`** (`apps/web/src/components/Pill.tsx` + `Pill.css`): a **non-interactive `<span>`** chip. `.pill` base (`inline-flex`, `gap --u-space-6`, `font-size-11`, `weight-medium`, `padding 3 11`, `radius-20`, `tracking-0`, `leading-140`, `white-space:nowrap`) + `.pill-genre` (`background --u-amber-tint-10`, `color --u-amber`), optional `.pill-conf` count badge, optional `.pill-community` (lighter `--u-amber-tint-05` fill + `--u-elevation-inset-hairline`). Used in `BookHeader`, `ShelfControl`, `TagControl`. An optional inline `style` carries a per-genre `${color}14` fill when a `color` prop is passed.
- **`gps-pill`** (`GenrePillSelector.tsx` + `.css`): a **selectable `<button>`** toggle. `font-size-11`, `weight-medium`, `padding 6 13`, `radius-20`, `border 1px --u-border-hover`, `background transparent`, `color --u-muted`, a 3-property `transition`; `.gps-on` (selected → `--u-amber-tint-10` fill, `--u-amber` border+text, with its own hover), `.gps-off` (`opacity .4`, `cursor:not-allowed`). `type="button"`, `aria-pressed={isOn}`, `disabled`. A Story-45 `DEFERRED` raw `<button>`.
- **`rated-by-more`** (`RatedByRow.tsx` + `.css`): a **circular "+N" overflow `<button>`** at the end of an avatar pile. `radius-pill`, `height:30px`, `min-width:30px`, `padding 0 8`, `border 1px --u-border`, `background --u-surface`, `color --u-amber`, `font-size-12`, `weight-semibold`, hover → `--u-border-hover`/`--u-amber-hover`, `margin-left --u-space-4`. `type="button"`, `aria-label`. A Story-45 `DEFERRED` raw `<button>`.

These three are a filled non-interactive chip, a bordered stateful toggle, and a circular count control: **different radii, fill models, and interactivity**. They do not collapse onto one `(variant, size, state)` axis without sprawl, but each is individually reproducible byte-identical by a closed `variant`.

**The signal pills are NOT in 47a scope and are left bespoke** (binding user decision): `book-signal` (`BookCard.css`, tone-keyed `radius-lg`), `cs-item-signal` (`CommunitySubmissions`), `tagc-reviewed` (`TagControl`). They are tone-keyed quality-signal tags with a different radius and tint model; folding them into `Pill` would either sprawl the variant axis or force normalization. Out of scope; untouched.

**The link family splits cleanly into "must migrate (47a)" and "leave bespoke":**

- **MIGRATE (the deferral + link-as-button subset, all byte-identical):**
  - `auth-linklike` ×2 (`AuthEmailSignup.tsx:61,72`): a real `<button>` styled as an inline text link (mode switch). CSS at `AuthShell.css` `.auth-card-footer .auth-linklike`: `color --u-amber`, `weight-medium`, `background:none; border:none; padding:0; font:inherit; cursor:pointer`, hover `underline` + `text-underline-offset:2px`. A Story-45 `DEFERRED` raw `<button>` that becomes a `Link`.
  - `sub-back` (`Submit.tsx:161`): a back affordance, a real `<button>`. CSS `Submit.css` `.sub-back`: `border:none; background:none; padding:0; margin-bottom --u-space-16; font-size-13; color --u-muted; cursor:pointer`, hover `color --u-ink`. A Story-45 `DEFERRED` raw `<button>` that becomes a `Link`.
  - `cta-btn` `<a>` branch (`CallToAction.tsx:21`): `<a className="cta-btn" href>`, sibling to a `<Button variant="primary" className="cta-btn">`. The `.cta-btn` class (`CallToAction.css`) carries the FULL button skin (`display:inline-block`, `font-size-13`, `weight-medium`, `padding 10 26`, `radius`, `background --u-amber`, `color --u-parchment`, `border:none`, hover `--u-amber-hover`). The `<a>` renders as a primary button today by sharing that class.
  - `auth-submit` `<Link>` (`AuthWelcome.tsx:28`): `<Link to="/curators" className="auth-submit" style={{textAlign:center, textDecoration:none}}>`. `.auth-submit` (`AuthForm.css`) carries the FULL primary-button skin (`padding 12 16`, `font-size-14`, `weight-medium`, `radius`, `border:none`, `background --u-amber`, `color --u-parchment`, `margin-top --u-space-4`, hover `--u-amber-hover`).
  - `auth-btn-secondary` `<Link>` ×3 (`AuthNostrConnect.tsx:143,164`; `AuthWelcome.tsx:33`): `.auth-btn-secondary` (`AuthForm.css`) carries the FULL secondary-button skin (`padding 12 18`, `font-size-13`, `weight-medium`, `radius`, `border 1px --u-border-hover`, `background transparent`, `color --u-ink`, hover `border-color --u-ink` + `background --u-surface`).
- **LEAVE BESPOKE (genuinely-distinct nav/footer/byline family — do NOT force into `Link`, no normalization):** `nav-link`/`nav-signin`/`nav-wordmark`, `footer-links`/`footer-domain`/`footer-tagline`, `author-badge-link`, the `*-seeall` family (`shelf-seeall`, `searchbox-seeall`, `genres-seeall`), `wtr-link`, `me-nostr-link`, `dc-exact-link`, `not-found-link`, and the unstyled `<Link>` wrappers around cards/covers (`BookCard`, `GenreGrid`, `Shelf`, `ReviewsList`). Each has its own underline/color/weight; reproducing all through one `Link` variant surface is the accidental-inconsistency tension Story 45 hit and the user has banned normalizing. They stay as-is.

### The link-as-button residue (the heart of 47a) and how `Button.css` is built

The load-bearing fact, verified in `packages/ui/src/components/Button.css`: the `Button` primitive **owns each variant's SKIN** on dedicated classes (`.u-btn--primary` = amber fill / parchment text / no border; `.u-btn--secondary` = transparent / ink text / `1px --u-border` / hover amber border; the standardized `:focus-visible` ring on `.u-btn`), while genuinely-distinct **density** residue (a call site's exact padding/font-size) stays on a slimmed additive-layout-only class at the call site. ADR 0045 §2 left the link branches of `cta-btn`/`auth-submit`/`auth-btn-secondary` as raw `<a>`/`<Link>` *still carrying the full skin class*, because `Link` did not exist; that is the residue 47a clears.

So today there is a **partial double-skin**: `<Button variant="primary" className="auth-submit">` (AuthNostrConnect/AuthEmailSignup) applies both `u-btn--primary` (Button's amber skin) AND `.auth-submit` (a second amber skin). Both resolve amber/parchment, so it is zero-diff, but `.auth-submit` is doing skin work a `className` must not (ADR 0038 §2). The link siblings render the same skin purely from `.auth-submit`/`.cta-btn`/`.auth-btn-secondary` because they are not `<Button>`. The clean resolution must (a) make the links render the *Button skin* (not a private copy), (b) strip the skin out of the three residue classes, and (c) leave only their genuine density/layout residue.

### Constraints that bind this design

- **Zero-diff, gated by Story-39** (ADR 0039, `maxDiffPixelRatio: 0`). Every migrated instance is byte-identical; no baseline moves. A diff is investigated, not re-baselined.
- **No new tooling** (`CLAUDE.md`; ADR 0038 §6/§7). The guard change is to an existing Vitest test under `pnpm -r test`. `@unbnd/ui` keeps its no-build-step source export. `@unbnd/ui` is already React-ready from Story 45 (`tsconfig` `jsx`/`DOM`, `@types/react`/`@types/react-dom` pinned dev deps), so **no package-config change is needed**.
- **No new tokens** (story out-of-scope). Every value the primitives need already exists as a `var(--u-*)`. If exact reproduction appears to need a value not in the token set, that is a signal to escalate, not to mint a token.
- **No icon library / no new icon** (`AGENTS.md` §4). `Link`/`Pill` author no SVG.
- **No AI-slop** in any doc-comment or string this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- **The `className` rule** (ADR 0038 §2): a `className`, if allowed at all, is additive layout-only and never a re-skin.
- **`react-router-dom`** is already a dependency of `apps/web`; `react-router-dom`'s `Link` is the routing element the byline/`<Link>` family already uses. `@unbnd/ui` must not take a hard dependency on `react-router-dom` (it has only `react`/`react-dom` peers, per ADR 0038 §7); the polymorphism design below keeps the router out of the package.
- In-repo prior art governs; the Tapestry branch survey does not apply (story "DList shapes touched: None").

## Decision 0 — SPLIT: two stories, two refining ADRs (47a = `Link`+`Pill` here; 47b = `Avatar`+`Label`/`Field` in ADR 0048)

**We split Story 47 into 47a and 47b, and SCOPE OUT `Card` entirely.** This ADR is 47a.

Rationale, bias toward keeping each PR cleanly zero-diff-verifiable:

- 47a carries the **deferral-clearing obligation** (the Story-45 `DEFERRED` countdown) and the hardest single reproduction (link-as-button). Landing it alone keeps the button-guard shrink and the link-as-button proof in one auditable diff, against the Story-39 screens that actually contain those affordances (auth, submit, the CTA surfaces).
- 47b is the **clean MOVE half** (`Avatar` byte-identical lift; `Label`/`Field` composition) with **no deferral obligation**, so it sequences second and its visual surface (forms, profile, account menu) is independent of 47a's.
- The two halves share no instances, so neither PR's zero-diff verification depends on the other. A single combined PR would mix the button-guard shrink, the link-as-button residue, and the forms work into one diff spanning most key screens, making a stray pixel harder to localize.
- `Card` (the ~30 bespoke parchment surfaces) is **scoped out of Story 47** by binding user decision: a `Card` primitive would require normalization (no single card class exists; the surfaces diverge in radius/padding/border/inset), and normalization is banned. The surfaces stay bespoke and token-backed; a future deliberate, design-reviewed story owns any unification.

**Alternative — one story.** Rejected. It is feasible only if every in-scope instance is zero-diff by a clean API; 47b surfaces a genuine escalation (the divergent `Input` skin, ADR 0048 §Decision) that would otherwise force the whole story partial, and combining the link-as-button residue with the forms work widens the visual review surface for no gain. The split is the realistic zero-diff path.

## Options considered (47a)

The load-bearing decisions are (1) the `Link` prop contract and how it stays a real `<a>`/`<Link>` while reproducing the Button look, (2) how the link-as-button skin is shared with `Button` without a re-skin `className` and without the package depending on `react-router-dom`, (3) the `Pill` contract that subsumes `GenrePill` + the two deferred pills byte-identical, and (4) the guard change. The options frame (1) and (2); the rest follow.

### Option A — `Link` is a polymorphic, render-agnostic primitive with a closed `variant` set; the button-styled variants reuse `Button`'s own skin classes; `Pill` is a closed-`variant` chip subsuming `GenrePill` + the two deferred pills (CHOSEN)

**`Link`** is a thin typed wrapper that renders **either** a raw `<a>` **or** a caller-supplied routing component (so the package never imports `react-router-dom`). Its `variant` selects the look; the button-styled variants **emit `Button`'s own variant classes** (`u-btn`, `u-btn--primary`/`u-btn--secondary`, `u-btn--md`) so the skin is literally `Button`'s skin, plus the link's own genuine density residue as an additive layout-only class. The plain link variants reproduce the two deferred link-styled controls (`auth-linklike`, `sub-back`) byte-identical. The nav/footer/byline family is **out of scope** and untouched.

**`Pill`** is a closed-`variant` chip: `variant="genre"` (the existing `GenrePill`, folded in / re-exported), `variant="select"` (the `gps-pill` toggle, with `on`/`off`/`disabled` state), `variant="count"` (the `rated-by-more` circular "+N"). Each variant's full skin lives in `Pill.css` value-for-value; state rides on typed props.

- Pros: the link-as-button affordances render byte-identical to `Button` **because they use Button's skin classes**, so a future primary/secondary restyle updates buttons AND button-styled links in one edit (the epic's goal); the package stays router-agnostic (no `react-router-dom` dependency, ADR 0038 §7 honored); each `Pill` variant is a verbatim transcription of one existing look, so no normalization pressure; the closed `variant` sets make a typo/wrong-look a type error; mirrors the ADR 0045 `VARIANT_CLASS`-map + typed-props shape one-to-one.
- Cons: `Link` and `Button` now share CSS class names across two components, a coupling that must be documented (a `Button` skin edit affects button-styled links — which is exactly the intent, but a maintainer must know it); the render-agnostic polymorphism (`as`/`renderAs`) is a small amount of TypeScript. Both are mitigated below.

### Option B — `Link` carries its own private copies of the button skin (duplicate the primary/secondary CSS under link-specific classes)

`Link`'s button-styled variants get their own `u-link--button-primary` CSS that *duplicates* `u-btn--primary`'s declarations.

- Pros: `Link` and `Button` are fully decoupled; no shared-class coupling to document.
- Cons: **re-introduces the exact drift the epic exists to remove** — two copies of the primary/secondary skin that can diverge on the next restyle, so a button restyle would silently leave button-styled links behind (a visible inconsistency). It is byte-identical *today* but structurally worse than the residue it replaces. Rejected: the whole point of clearing this residue is to make button-styled links track `Button`; a private copy defeats it.

### Option C — Make `Button` itself polymorphic (an `as="a"` / `to` prop on `Button`) and route the link-as-button affordances through `Button`

Give `Button` an `as`/polymorphic prop so `<Button as="a" href>` / `<Button as={RouterLink} to>` renders an anchor with the button skin.

- Pros: one component for both buttons and button-styled links; no separate `Link` button-variants.
- Cons: ADR 0045 §1 **explicitly deferred** `Button` polymorphism ("`Button` is not made polymorphic in this story … a general `as` prop would invite re-introducing link-vs-button ambiguity") to the `Link` story; the story's own scope names `Link` as the home for these affordances; it would also pull `react-router-dom` typing into `Button`'s surface and blur the no-raw-`<button>` guard (a `<Button as="a">` renders no `<button>`). It also leaves the plain link-styled controls (`auth-linklike`, `sub-back`) and the nav/footer family without a home. Rejected: the story and ADR 0045 put these in `Link`; `Link` owning both the plain and the button-styled link looks is the coherent boundary.

## Decision (47a)

We choose **Option A**. It reproduces every in-scope instance byte-identical, makes the link-as-button affordances render with `Button`'s *own* skin (so they track future button restyles rather than drifting, unlike Option B), keeps `@unbnd/ui` router-agnostic and keeps `Button` a button (unlike Option C), and lands each look as a verbatim closed-`variant` transcription with no normalization. The button-guard `DEFERRED` set shrinks from five to one. No baseline moves.

### 1. `Link` — prop contract and polymorphism

`Link` lives at `packages/ui/src/components/Link.tsx` (+ `Link.css`). It is **render-agnostic**: it renders a raw `<a>` by default, or a caller-supplied component (`react-router-dom`'s `Link`) when the caller passes it, so the package never imports the router.

```ts
// packages/ui/src/components/Link.tsx (shape sketch — Implementer writes the final)
import type { AnchorHTMLAttributes, ElementType, ReactNode } from "react";

// "plain" looks reproduce the two deferred link-styled controls byte-identical.
// The "button-*" looks reuse Button's OWN skin classes (see §2) so a button
// restyle tracks them automatically.
export type LinkVariant =
  | "plain-amber"        // auth-linklike: amber, weight-medium, underline-on-hover
  | "plain-muted"        // sub-back: muted text, ink on hover, no underline
  | "button-primary"     // cta-btn <a>, auth-submit <Link> — renders Button primary skin
  | "button-secondary";  // auth-btn-secondary <Link> — renders Button secondary skin

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color"> {
  variant?: LinkVariant;       // default "plain-amber" — but every call site passes its own
  /**
   * The element/component to render as. Defaults to "a" (a raw anchor with `href`).
   * Pass react-router-dom's Link here (with `to`) to get a route link; the extra
   * props (`to`) flow through `...rest`. Keeps @unbnd/ui router-agnostic.
   */
  as?: ElementType;            // default "a"
  className?: string;          // ADDITIVE LAYOUT-ONLY (ADR 0038 §2) — never a re-skin
  children: ReactNode;
}
```

- `href` / `to`, `onClick`, `style`, `aria-*`, `target`, `rel` all flow through the intrinsic/`...rest` spread, carried verbatim by the Implementer.
- **No `<button>` semantics, ever.** The two deferred controls (`auth-linklike`, `sub-back`) are real `<button>`s today; in 47a they become real `Link`s. **This changes the rendered element from `<button>` to `<a>`/route-link — which IS a change in markup.** It is the *intended* migration (a link-styled control becomes a real link), it is what removes them from the raw-`<button>` guard, and it must be reproduced byte-identical *visually*. The Implementer carries the click behavior: `auth-linklike` toggles signup mode (an in-page action, not a navigation) and `sub-back` is a back affordance — these are `onClick` handlers, not `href` navigations. **ESCALATION-CHECK (resolved):** a link-styled control whose job is an in-page action, not navigation, is semantically a `<button>`, not an `<a>`. Converting it to an `<a href="#">` to satisfy the guard would be wrong a11y. **Resolution:** `Link` renders an `<a>` *or* (when no `href`/`to` is given and an `onClick` drives an in-page action) the Implementer keeps these two as `Button variant="ghost"` carrying the link *density* — OR `Link` exposes a `plain-*` look on a `<button>` element via `as="button"`. The cleaner, byte-identical answer is the latter: **`Link` accepts `as="button"`** so `auth-linklike`/`sub-back` render `<button class="u-link u-link--plain-amber">` (the link skin on a real button), preserving both their `<button>` semantics AND removing the bespoke `auth-linklike`/`sub-back` *classes*. **This means they remain `<button>` elements and must STAY exempt in the button guard — see §4: they migrate to the `Link` primitive but the element is still `<button>`, so the guard's allowlist keys on the new primitive marker, not on removal.** This is the one subtlety the gate must confirm (open question OQ-1).

  *(Architect's note for the gate: there are two honest readings of "clear the `auth-linklike`/`sub-back` deferral." Reading 1 — they become real `<a>`/route-links (markup changes button→anchor; they leave the guard naturally). Reading 2 — they stay `<button>` but route their skin through `Link`'s plain look (markup stays `<button>`; the guard must recognize the primitive, not the removed class). The story says "render through `Link`" and "remove the entry from `DEFERRED_CLASSES`." Reading 1 satisfies both cleanly and is the **recommended** path IF the in-page-action semantics allow an anchor; Reading 2 is the fallback if forcing an anchor harms a11y. The Implementer must check each control's handler: `sub-back` navigates (history back / a route) → anchor is fine → Reading 1; `auth-linklike` toggles in-page signup mode → it is a real button → Reading 2 or keep as `Button variant="ghost"` with the link density. This is **OQ-1**, surfaced for the gate; both readings are byte-identical visually and neither normalizes.)*

### 2. The link-as-button reproduction (THE crux) — share `Button`'s skin classes, strip the residue classes

The four button-styled affordances render the Button look by emitting **Button's own variant classes**, not a private copy:

- `Link variant="button-primary"` emits `class="u-btn u-btn--primary u-btn--md <density-residue-class?>"` (rendered on an `<a>`/route-link).
- `Link variant="button-secondary"` emits `class="u-btn u-btn--secondary u-btn--md <density-residue-class?>"`.

Because `u-btn--primary`/`u-btn--secondary` are exactly the classes `Button` uses, the skin is **identical by construction** and a future primary/secondary restyle updates both. The `:focus-visible` ring on `.u-btn` applies, matching the at-rest baselines (rings render only on focus, which the Story-39 baseline set does not capture — same as ADR 0045 JC-5).

The genuine **density residue** that differs from the `md` button cell stays as an additive layout-only class:

| Affordance | Button skin reused | Density residue (stays as layout-only class) | Resolution of the residue class |
|---|---|---|---|
| `cta-btn` `<a>` | `u-btn u-btn--primary u-btn--md` | `padding 10 26`, `font-size-13`, `display:inline-block` | `.cta-btn` keeps ONLY `padding`/`font-size`/`display:inline-block`; its `background`/`color`/`border`/`radius`/hover are **deleted** (now owned by `u-btn--primary`) |
| `auth-submit` `<Link>` | `u-btn u-btn--primary u-btn--md` | `padding 12 16`, `font-size-14`, `margin-top --u-space-4` | `.auth-submit` keeps ONLY `padding`/`font-size`/`margin-top`; its `background`/`color`/`border`/`radius`/hover are **deleted** |
| `auth-btn-secondary` `<Link>` ×3 | `u-btn u-btn--secondary u-btn--md` | `padding 12 18`, `font-size-13` | `.auth-btn-secondary` keeps ONLY `padding`/`font-size`; its `border`/`background`/`color`/hover are **deleted** (now owned by `u-btn--secondary`) |

**Zero-diff proof per affordance:**
- `cta-btn` `<a>`: today `display:inline-block; font-size-13; weight-medium; padding 10 26; radius; background --u-amber; color --u-parchment; border:none; hover --u-amber-hover`. After: `u-btn--primary` supplies amber/parchment/no-border/radius/hover/weight-medium (verified identical in `Button.css`); the residue class supplies `padding 10 26`/`font-size-13`/`inline-block`. Net pixels: identical. (Note the sibling `<Button variant="primary" className="cta-btn">` is **already** in this exact shape from ADR 0045; 47a only removes the now-redundant skin from `.cta-btn` and points the `<a>` branch at `Link variant="button-primary"`, so the two branches stay identical.)
- `auth-submit` `<Link>`: today amber/parchment/no-border/radius + `padding 12 16`/`font-size-14`/`margin-top 4`. After: `u-btn--primary` skin + residue `padding 12 16`/`font-size-14`/`margin-top 4`. Identical.
- `auth-btn-secondary` `<Link>` ×3: today transparent/`--u-ink`/`1px --u-border-hover`/radius, hover `border --u-ink` + `background --u-surface`, + `padding 12 18`/`font-size-13`. **WATCH-POINT:** `Button`'s `u-btn--secondary` resting border is `--u-border` and hover is `border-color --u-amber` (ADR 0045 normalized the secondary border collapse), but `.auth-btn-secondary`'s resting border is `--u-border-hover` and hover is `--u-ink` + `background --u-surface`. **These DIFFER.** Reusing `u-btn--secondary` verbatim would change the link's resting border (`--u-border-hover` → `--u-border`) and hover (ink/surface → amber) — a **diff**. **Resolution (zero-diff, no normalization):** the `auth-btn-secondary` look is NOT the normalized Button secondary; it is a genuinely-distinct secondary skin. So `Link variant="button-secondary"` must reproduce **the link's own** secondary skin, not `Button`'s normalized one. Two honest ways (OQ-2 for the gate):
  - **(a)** `Link` owns a `u-link--button-secondary` skin that reproduces `.auth-btn-secondary` value-for-value (`border --u-border-hover`, hover `--u-ink`+`--u-surface`). This is byte-identical but is a *second* secondary look that does not track `Button` — acceptable because it is genuinely a different look (not drift), the same way `gps-pill` is a different look from `GenrePill`.
  - **(b)** Keep `auth-btn-secondary`'s skin entirely on the (renamed, layout+identity) call-site class and have `Link variant="plain"` add only the link reset (`text-decoration`, `display`), reproducing today's look exactly. 
  - **Recommendation: (a)** — give `Link` a closed `button-secondary` look authored to the *auth* secondary values, so the skin is owned by the primitive (the epic's goal) and is byte-identical; document that it is intentionally distinct from `Button`'s normalized secondary (the auth screens predate that normalization and were not in Story 45's scope). The primary look (`button-primary`) DOES match `Button`'s primary value-for-value, so it reuses `u-btn--primary` directly. **The asymmetry is honest:** primary is identical between the two, secondary is not, so primary shares and secondary is reproduced. This must be confirmed at the gate (OQ-2).

**The `.auth-submit` shared-class resolution (called out by the story).** `.auth-submit` is currently on BOTH `<Button className="auth-submit">` (AuthNostrConnect:171, AuthEmailSignup:135) and `<Link className="auth-submit">` (AuthWelcome:28). After 47a:
- The `<Button variant="primary" className="auth-submit">` sites keep `<Button>` and keep `className="auth-submit"` **as a density-only class** (`padding 12 16`/`font-size-14`/`margin-top 4`) — the skin half of `.auth-submit` is deleted, so it stops being a re-skin and becomes the additive layout-only residue ADR 0038 §2 permits.
- The `<Link className="auth-submit">` site becomes `<Link as={RouterLink} to="/curators" variant="button-primary" className="auth-submit">` — same density class, skin from `u-btn--primary`. The `style={{textAlign:center, textDecoration:none}}` is carried verbatim (or `textDecoration:none` folds into `Link`'s base reset; the Implementer keeps it byte-identical).
- **Net:** `.auth-submit` survives as a single density class shared by the primary-button and the primary-button-link, both now skinned by `u-btn--primary`. The double-skin is gone; the residue is honest. This resolves the Story-45 "`.auth-submit` is currently shared" note cleanly.

### 3. `Pill` — prop contract (subsumes `GenrePill` + the two deferred pills)

`Pill` lives at `packages/ui/src/components/Pill.tsx` (+ `Pill.css`, the existing `apps/web/src/components/Pill.css` content MOVES here). A closed discriminated `variant`:

```ts
// packages/ui/src/components/Pill.tsx (shape sketch)
import type { ReactNode } from "react";

export type PillVariant = "genre" | "select" | "count";

interface PillBase { className?: string; } // additive layout-only

interface GenrePillProps extends PillBase {
  variant?: "genre";          // default; the existing non-interactive <span> chip
  label: string;
  color?: string;             // per-genre `${color}14` inline fill, as today
  count?: number;             // optional .pill-conf badge
  community?: boolean;        // .pill-community treatment
}
interface SelectPillProps extends PillBase {
  variant: "select";          // the gps-pill toggle <button>
  on?: boolean;               // .gps-on
  disabled?: boolean;         // .gps-off (opacity .4, cursor not-allowed)
  onClick?: () => void;
  "aria-pressed"?: boolean;
  children: ReactNode;
}
interface CountPillProps extends PillBase {
  variant: "count";           // the rated-by-more circular "+N" <button>
  onClick?: () => void;
  "aria-label": string;       // required (icon-like control, no readable text alone)
  children: ReactNode;        // "+N"
}
export type PillProps = GenrePillProps | SelectPillProps | CountPillProps;
```

- `variant="genre"` reproduces today's `GenrePill` byte-identical: same `<span className="pill pill-genre [pill-community]">`, same optional inline `style`, same `.pill-conf` count span. **`GenrePill` is folded in AND re-exported** (`export { GenrePill }` as a thin wrapper `(p) => <Pill variant="genre" {...p} />`, or a direct re-export) so the three current `GenrePill` call sites (`BookHeader`, `ShelfControl`, `TagControl`) need no change beyond the import source — minimizing the diff (OQ-3: fold-and-rewrite-call-sites vs keep-`GenrePill`-as-a-named-export; recommend **keep `GenrePill` as a re-exported wrapper** so those three sites stay byte-identical with only an import path change).
- `variant="select"` renders the `gps-pill` `<button type="button">` with `on`/`disabled` driving `.gps-on`/`.gps-off`, `aria-pressed` passed through. The `.gps` flex container stays on the parent in `GenrePillSelector` (layout, not the pill). Byte-identical: same classes, same states, same transition.
- `variant="count"` renders the `rated-by-more` `<button type="button">` (circular, `radius-pill`, 30px). The `margin-left --u-space-4` is **layout residue** that stays as an additive class at the `RatedByRow` call site (it positions the chip in the pile, it is not the chip skin). Byte-identical otherwise.

All three variant skins are verbatim transcriptions into `Pill.css`. No normalization; `book-signal`/`cs-item-signal`/`tagc-reviewed` are NOT subsumed (left bespoke).

### 4. Guard strategy (be honest: shrink the existing button-guard set; add NO new green-impossible guard)

**The concrete guard work is shrinking the Story-45 button-guard `DEFERRED_CLASSES`.** Today `packages/ui/test/architecture-button-literals.test.ts` exempts five classes (`auth-linklike`, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit`). 47a migrates four of them:

- `gps-pill` → `Pill variant="select"`: the raw `<button class="gps-pill">` is gone (it is now `<button>` rendered by `Pill`, in `packages/ui/src/components/Pill.tsx`, **outside** `SCAN_ROOT=apps/web/src`). **Delete `gps-pill` from `DEFERRED_CLASSES`.**
- `rated-by-more` → `Pill variant="count"`: same — the raw `<button>` moves into `Pill`. **Delete `rated-by-more`.**
- `auth-linklike` ×2, `sub-back` → `Link`: **delete both** — *provided* the migration removes the raw `<button>` from `apps/web/src`. Under Reading 1 (anchor) the element is no longer a `<button>` at all (naturally clean). Under Reading 2 (`Link as="button"`) the `<button>` is rendered *inside* `Link` (`packages/ui/src/components/Link.tsx`, outside `SCAN_ROOT`), so `apps/web/src` again has none. **Either reading lets both entries be deleted** (this is OQ-1's only guard consequence; both are honestly green).

After 47a, `DEFERRED_CLASSES = ["searchbox-hit"]` only (the `role="option"` listbox item, awaiting a future listbox/Option primitive — out of scope, untouched). The guard's "COUNTDOWN TO EMPTY" comment and the count math in its header are updated (32 → 36 migrated, 1 deferred). The guard stays GREEN.

**No new guard is added in 47a, and the ADR states why honestly.** A "no raw `<a>`-styled-as-button" or "no raw `<Link>`" guard CANNOT be green: the nav/footer/byline `<Link>`/`<a>` family is **deliberately left bespoke** (it is not migrated, by user decision), so any guard forbidding raw `<a>`/`<Link>` in `apps/web/src` would trip on dozens of legitimate, intentionally-bespoke links. A guard that cannot be green the moment it ships violates ADR 0038 §6 ("each guard is green the moment it lands"). **Decision: 47a adds no new link/pill guard.** The only honest guard work is the `DEFERRED_CLASSES` shrink above. (A future story that actually migrates the full link family could then add a no-raw-`<a>` guard; that is not this story.) This is stated plainly so the gate does not expect a green link/pill guard that coverage does not support.

All prior guards (38–46) stay green: the primitive CSS references only existing `var(--u-*)` tokens (no new color/spacing/radius/type/motion literal), so the Story-40..44 guards hold; `Link`/`Pill` author no `<svg>` (Story-46 guard holds); the migrated `gps-pill`/`rated-by-more` `<button>`s move into the package, tightening the Story-45 guard.

## Consequences

- **Enables:** the Story-45 Pill/Link `DEFERRED` countdown shrinks from five to one (only the listbox `searchbox-hit` remains, for a future Option primitive); button-styled links now render `Button`'s *own* skin, so a future primary restyle updates buttons AND button-styled links in one edit; the double-skin residue on `.auth-submit`/`.cta-btn`/`.auth-btn-secondary` is removed; `GenrePill` + the two deferred pills are centralized in one `Pill` primitive.
- **Constrains / makes harder:** `Link` and `Button` share the `u-btn--primary`/`u-btn--md` classes for the button-primary look — a documented coupling (a `Button` primary restyle is intentionally a button-styled-link restyle too). The `button-secondary` look is intentionally NOT shared (it reproduces the distinct auth secondary), an asymmetry that must be documented so a maintainer does not "unify" it (which would change pixels). The nav/footer/byline link family stays bespoke, so there is no green no-raw-`<a>` guard yet — link coverage is partial by design.
- **New debt / follow-ups:** (1) the full nav/footer/byline link unification + a no-raw-`<a>` guard is a future deliberate story (likely a visual-change story, since unifying those looks would change pixels); (2) the `searchbox-hit` listbox option awaits a future listbox/Option primitive; (3) the signal pills (`book-signal`/`cs-item-signal`/`tagc-reviewed`) await a future deliberate pill story if ever unified. None of these is introduced by 47a; they are pre-existing, now explicitly scoped.
- **Affects existing fixtures?** No. Pure component-extraction + migration; no `apps/web/src/data/` fixture change, no DList shape.
- **New dependency?** No. `@unbnd/ui` stays router-agnostic (the polymorphic `as` keeps `react-router-dom` out of the package); React + `@types/react` are already present from Story 45. No new tooling; the guard change is to an existing Vitest test.
- **PRD section change required?** No. Touches no product surface; nowhere near the PRD §11.3 out-of-scope line. Phase-2 platform hardening under Epic 0001 (ADR 0038), recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors (Architect is read-only on source; these are targets, not edits made here):

- **New: `packages/ui/src/components/Link.tsx` (+ `Link.css`).** The `LinkProps` contract (§1): `variant` (`plain-amber`/`plain-muted`/`button-primary`/`button-secondary`), `as?: ElementType` (default `"a"`, router-agnostic), additive-layout-only `className`, intrinsic anchor props + `...rest` (carries `to` for a route link, `href` for an anchor, `style`, `aria-*`). `Link.css` holds the `plain-*` skins (verbatim from `.auth-linklike` and `.sub-back`) and the `u-link--button-secondary` skin (verbatim from `.auth-btn-secondary`); `button-primary` emits `u-btn u-btn--primary u-btn--md` (reuses `Button.css`). References only `var(--u-*)`.
- **New: `packages/ui/src/components/Pill.tsx` (+ `Pill.css`).** Move the existing `apps/web/src/components/Pill.css` content into `packages/ui/src/components/Pill.css`; add the `gps-pill` (`.pill--select` / `.gps-on` / `.gps-off`) and `rated-by-more` (`.pill--count`) skins verbatim. The discriminated `PillProps` (§3). Re-export `GenrePill` as a thin `variant="genre"` wrapper so the three current call sites change only their import source.
- **Edit: `packages/ui/src/index.ts`** — add `export { Link } from "./components/Link"; export type { LinkProps, LinkVariant } from "./components/Link";` and `export { Pill, GenrePill } from "./components/Pill"; export type { PillProps, PillVariant } from "./components/Pill";` after the `Icon` exports.
- **Migrate (call sites, byte-identical):**
  - `CallToAction.tsx:21` — the `<a className="cta-btn" href>` branch → `<Link variant="button-primary" href={ctaHref} className="cta-btn">`; the `<Button variant="primary" className="cta-btn">` branch stays a `Button` (now `cta-btn` is density-only). Delete the skin half of `.cta-btn` in `CallToAction.css`, keep `padding`/`font-size`/`display:inline-block`.
  - `AuthWelcome.tsx:28,33` — `<Link className="auth-submit">` → `<Link as={RouterLink} to="/curators" variant="button-primary" className="auth-submit" style={…}>`; `<Link className="auth-btn-secondary">` → `<Link as={RouterLink} to="/" variant="button-secondary" className="auth-btn-secondary" style={…}>` (`RouterLink` = the existing `react-router-dom` `Link` import).
  - `AuthNostrConnect.tsx:143,164` — both `<Link className="auth-btn-secondary">` → `<Link as={RouterLink} … variant="button-secondary" className="auth-btn-secondary">`.
  - `AuthEmailSignup.tsx:61,72` — the two `<button className="auth-linklike">` → `Link variant="plain-amber"` per OQ-1 (anchor if navigational, `as="button"` if in-page mode toggle — the Implementer confirms each handler).
  - `Submit.tsx:161` — `<button className="sub-back">` → `Link variant="plain-muted"` per OQ-1.
  - `GenrePillSelector.tsx:?` — the `<button className="gps-pill …">` → `<Pill variant="select" on={isOn} disabled={disabled} aria-pressed={isOn} onClick={…}>`; keep the `.gps` flex container on the parent `<div>`.
  - `RatedByRow.tsx:?` — the `<button className="rated-by-more">` → `<Pill variant="count" aria-label={…} onClick={…} className="rated-by-more">` (the `margin-left` stays as the layout-only residue on `.rated-by-more`).
  - `BookHeader.tsx`/`ShelfControl.tsx`/`TagControl.tsx` — change the `GenrePill` import from `../components/Pill` to `@unbnd/ui` (no JSX change).
  - Delete `apps/web/src/components/Pill.tsx` and `Pill.css` (moved to the package); delete the now-empty bespoke skin rules from `GenrePillSelector.css`/`RatedByRow.css`/`AuthShell.css`/`Submit.css`/`AuthForm.css`/`CallToAction.css`, keeping only the genuine layout/density residue.
- **Edit: `packages/ui/test/architecture-button-literals.test.ts`** — delete `auth-linklike`, `sub-back`, `gps-pill`, `rated-by-more` from `DEFERRED_CLASSES` (leaving `searchbox-hit`); update the header comment counts and the "COUNTDOWN TO EMPTY" note. Confirm green.
- **Verify:** `pnpm -r typecheck` (the new prop types), `pnpm -r test` (the shrunk button guard + all prior guards 38–46 + the web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job **zero-diff with no baseline update**. A diff on any auth/submit/CTA screen is investigated (it should be byte-identical), never re-baselined.

## Open questions for the gate

- **OQ-1 (`auth-linklike`/`sub-back` element semantics).** Confirm per control whether it becomes a real `<a>`/route-link (Reading 1, if its handler navigates) or stays a `<button>` via `Link as="button"` (Reading 2, if its handler is an in-page action). `sub-back` likely navigates (Reading 1); `auth-linklike` likely toggles in-page signup mode (Reading 2 or keep as a ghost button with link density). Both are byte-identical visually and both let the `DEFERRED_CLASSES` entry be deleted.
- **OQ-2 (`button-secondary` skin source).** Confirm the recommendation: `button-primary` REUSES `Button`'s `u-btn--primary` (values match exactly); `button-secondary` reproduces the **auth** secondary skin (`--u-border-hover` resting, ink/surface hover) in `Link.css`, NOT `Button`'s normalized secondary (`--u-border`/amber hover), because they genuinely differ and reusing `Button`'s would change pixels. This asymmetry is intentional and must be documented so it is not "unified" later.
- **OQ-3 (`GenrePill` fold form).** Confirm keeping `GenrePill` as a re-exported `variant="genre"` wrapper (so its three call sites change only the import path) vs rewriting the three call sites to `<Pill variant="genre">`. Recommend the wrapper (smaller, equally byte-identical).

## Out of scope

- **Any visual change / normalization / redesign.** 47a reproduces every migrated instance's current pixels exactly. It does NOT make the inconsistent links/pills consistent, retune any radius/padding/fill/weight, or unify divergent looks. Story 45's normalization is NOT repeated.
- **The nav/footer/byline link family** (`nav-*`, `footer-*`, `author-badge-link`, `*-seeall`, `wtr-link`, `me-nostr-link`, `dc-exact-link`, `not-found-link`, the unstyled card/cover `<Link>` wrappers): left bespoke, untouched. No `Link` variant is forced onto them; no no-raw-`<a>` guard.
- **The signal pills** (`book-signal`, `cs-item-signal`, `tagc-reviewed`): left bespoke, untouched.
- **`searchbox-hit`** (the `role="option"` listbox item): stays in the button-guard `DEFERRED` set; awaits a future listbox/Option primitive.
- **`Card`** (the ~30 bespoke parchment surfaces): scoped out of all of Story 47 by user decision; stays bespoke + token-backed; any unification is a future deliberate, design-reviewed story (it would require normalization).
- **`Avatar`, `Input`/`Field`/`Label`:** Story 47b (ADR 0048).
- **`Button`/`IconButton`/`Icon` redesign:** shipped (Stories 45/46); not re-designed. Only the link-as-button affordances are aligned to render identically to `Button`, with no change to `Button` itself.
- **No re-skin `className` escape hatch** (ADR 0038 §2): the `className` on `Link`/`Pill` is additive layout-only.
- **Any token change:** the token system is complete (Stories 40–44); 47a mints none.
- **Doc re-point** (`CLAUDE.md`/`AGENTS.md` to cite `@unbnd/ui` primitives/guards): epic story 14.
- **Behavior, copy, or IA change:** no instance gains/loses/changes a handler, label, destination, `href`/`to`, or `type` (the `auth-linklike`/`sub-back` element-name change is the intended link-migration, reproduced byte-identical visually).
