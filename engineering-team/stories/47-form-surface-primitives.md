# Story 47: Form + surface primitives in `@unbnd/ui` — `Avatar`, `Link`, `Pill`, `Input`/`Field`/`Label`, `Card` — byte-identical migration, the Story-45 Pill/Link deferrals cleared, and the guard set extended

> **47a DONE (2026-06-04).** The `Link` + `Pill` half (ADR 0047) shipped: both primitives in `@unbnd/ui`, the four Story-45 deferrals cleared (`gps-pill`/`rated-by-more` → `Pill`; `auth-linklike` ×2/`sub-back` → `Link`), the link-as-button affordances (`cta-btn`/`auth-submit`/`auth-btn-secondary`) byte-identical, the button-guard `DEFERRED_CLASSES` shrunk 5→1 (`searchbox-hit`). Reviewer verdict **PASS** — `engineering-team/reviews/47a-link-pill-primitives.md` (PR #90; visual gate green, no baseline change). **47b** (`Avatar` + `Label`/`Field`, ADR 0048) is still pending, so this shared doc is NOT yet moved to `done/`.

**Status:** Draft (47a done; 47b pending)
**Created:** 2026-06-04
**Type:** Refactor (behavior-preserving, byte-identical; no visual change — this is NOT a Story-45-style normalization)

## Background

This is epic story 10 of Epic 0001 (Overhaul-ready design system, `@unbnd/ui`), the largest remaining structural story: the form and surface primitives. ADR 0038 (Accepted, 2026-06-03) is the umbrella decision; its §2 ("Primitive component library in `@unbnd/ui`") names the target set — `Input`, `Field`/`Label`, `Card`, `Pill`, `Avatar`, `Link` — each with a "small, explicit, typed prop surface, not an open `className` escape hatch," styled against the existing semantic tokens, with the load-bearing rule: **"A `className` prop, if allowed at all, is additive layout-only and never a way to re-skin"** (§2). §6 names the guard discipline: each story "introduces or extends exactly one CI guard" with "a tightly scoped allowlist so the guard reflects reality and stays green"; the epic-story-10 line specifies "extends the literal guards to cover the migrated component CSS (allowlist shrinks)."

Foundations are merged. Story 38 stood up `@unbnd/ui` (React peers, no build step, raw `src` export consumed by `apps/web` through Vite). Story 39 stood up the Playwright visual-regression harness (`apps/web/e2e/visual/visual.spec.ts`) with committed baselines and a CI `visual` job that fails on any pixel diff — the zero-diff gate this story is held to. Stories 40 to 44 carried the two-tier-token-plus-guard pattern across color, type, spacing, shape/breakpoint, and motion, each leaving a green guard under `packages/ui/test/architecture-*.test.ts`. Story 45 added `Button`/`IconButton`, the `packages/ui/src/components/` directory, and the no-raw-`<button>` guard (`packages/ui/test/architecture-button-literals.test.ts`) with its **DEFERRED countdown allowlist**. Story 46 added the `Icon` registry and the no-raw-`<svg>` guard. The `@unbnd/ui` index already exports `GENRE_PALETTE`/`SEMANTIC_COLORS`/`breakpoints`/`Button`/`IconButton`/`Icon`; this story adds the form/surface primitives.

### The binding constraint: byte-identical, zero-diff — this is NOT a Story-45 normalization

The user has re-grounded the epic for all remaining stories: it is **structural/modularity only — invisible to users, NO new features, ZERO-DIFF.** Story 45's button normalization (it reproduced pixels but accepted a deliberate normalization path under its own ADR) was a **one-time deviation** and **must not be repeated.** Every primitive in this story reproduces its instances **byte-identical**: same markup output, same classes preserved where they also carry layout, same tokens, same `aria`/`role`/focus treatment, same default sizes. If a primitive cannot be cleanly reproduced by a clean API, that is an **ESCALATION** (defer or reproduce-exactly), **never** a normalize. The Story-39 `visual` job is the backstop: a single-pixel drift fails the job and is investigated, not re-baselined.

The epic's operating principle holds: "same pixels, better structure." House-rule anchors: `CLAUDE.md` "Brand tokens are the visual source of truth" (the primitives reference only existing semantic tokens; they mint none) and "No new lint/typecheck/build tooling without an ADR" (this story adds no tooling; the guards are Vitest tests under the existing `pnpm -r test`). `AGENTS.md` §4 design rules (amber-only accent, parchment-on-parchment elevation, no AI-slop in any authored string). Governing ADR: 0038 (§2, §6). A refining ADR is expected, as for Stories 40 to 46, because the per-primitive prop contracts, the zero-diff-vs-escalation calls, the `className`-layout rule, the Link-as-button reproduction, and the guard strategy are real design calls (see open questions).

### This story resolves the Story-45 Pill/Link deferrals

Story 45's button guard carries a **DEFERRED countdown allowlist** (`packages/ui/test/architecture-button-literals.test.ts`, `DEFERRED_CLASSES`) of five raw-`<button>` sites it could not migrate to `Button` because they belong to a primitive that did not exist yet. This story lands two of those primitives (`Pill`, `Link`) and so clears four of the five entries:

- **`gps-pill`** (`GenrePillSelector.tsx`) → `Pill` (selectable genre pill).
- **`rated-by-more`** (`RatedByRow.tsx`) → `Pill` (the "+N" overflow count pill).
- **`auth-linklike`** ×2 (`AuthEmailSignup.tsx`) → `Link` (link-styled text controls).
- **`sub-back`** (`Submit.tsx`) → `Link` (the back affordance).
- **`searchbox-hit`** (`SearchBox.tsx`) → **stays deferred** — it is a `role="option"` listbox item, not a Pill or a Link; it awaits a future listbox/Option primitive (ADR 0045 §3) and is explicitly out of scope here.

After this story the DEFERRED allowlist shrinks from five names to one (`searchbox-hit`), per the guard's own "COUNTDOWN TO EMPTY — when a deferred site migrates, delete its entry" instruction.

There is a second, related class of deferral the `Link` primitive must address: Story 45 migrated the **button branches** of several link-or-button affordances to `Button` but **left the `<a>`/`<Link>` branches re-using the button skin classes**, because the `Link` primitive did not exist. These are real `<a>`/`<Link>` elements today (so they never appeared in the raw-`<button>` guard), but they render as buttons by sharing button CSS:

- `CallToAction.tsx` — the polymorphic `cta-btn` `<a>` branch (`<a className="cta-btn">`), sibling to the `Button` branch.
- `AuthNostrConnect.tsx` — `<Link className="auth-btn-secondary">` (two sites) re-using the secondary-button skin.
- `AuthWelcome.tsx` — `<Link className="auth-submit">` (primary skin) + `<Link className="auth-btn-secondary">`.
- `AuthEmailSignup.tsx` — `<button className="auth-submit">` is a `Button`, but the welcome/connect screens use `<Link className="auth-submit">` for the same skin.

These are the hard part of `Link`: a "link-styled-as-button" affordance must render byte-identical to the `Button` primitive while remaining a real anchor/route link (correct `href`/`to`, no `<button>` semantics). The `cta-btn`, `auth-submit`, and `auth-btn-secondary` CSS classes still live in `AuthForm.css`/`CallToAction.css` precisely so both the `Button` and the link branch render identically today; the `Link` primitive's reproduction of these is an open question for the Architect (see below), and a strong candidate for the **SPLIT** rationale and a possible escalation.

## Per-primitive survey (read-only; counts + consistency assessment)

The survey is the PO's grounding read against `main` today, not the final API (that is the Architect's call). The headline finding mirrors Story 45's central tension: **two of the five primitives (`Avatar`, `Input`/`Field`/`Label`) cluster reasonably and migrate cleanly byte-identical; three (`Pill`, `Link`, `Card`) are accidentally inconsistent and are the zero-diff risk / likely escalation surface.**

### `Avatar` — CLEAN. Already a component; a near-direct lift into `@unbnd/ui`.

`apps/web/src/components/Avatar.tsx` (+ `Avatar.css`) is already a single, well-factored component used at five call sites (`AccountMenu.tsx`, `RatedByRow.tsx`, `Profile.tsx`, `ProfileMe.tsx`, and the `acct-trigger` `IconButton` child). It renders a kind-0 picture or a deterministic initials circle, sized by a `size` prop (default 30), colored from `GENRE_PALETTE` (already token-sourced via Story 40). Two classes: `avatar avatar-img` / `avatar avatar-initials`. **There is one Avatar look.** This is the cleanest of the five: it is plausibly just a **MOVE** of `Avatar.tsx`/`Avatar.css` into `packages/ui/src/components/`, an `index.ts` export, and a re-point of the five import sites — byte-identical by construction. The only nuance is the existing `apps/web/test/components/avatar.test.tsx` unit test, which the Architect/Tester decide whether to move alongside it. **Assessment: zero-diff reproducible, lowest risk.**

### `Input` / `Field` / `Label` — MIXED. Text-field instances cluster reasonably; the field-WRAPPER patterns are inconsistent, and several non-text `<input>` types are NOT this primitive.

Raw `<input>`: **19 instances across 8 files** — `routes/Submit.tsx`, `routes/AuthEmailSignup.tsx`, `routes/Settings.tsx`, `components/AuthorEdit.tsx`, `components/SearchBox.tsx`, `components/ShelfControl.tsx`, `components/DuplicateCheck.tsx`, `components/ToggleSwitch.tsx`. `<textarea>`: **3** (`Submit.tsx`, `AuthorEdit.tsx`, `RatingControl.tsx`). `<select>`: **3** (`Submit.tsx`, `ShelfControl.tsx`, `TagControl.tsx`). `<label>`: **23** across 7 files.

The **labeled-text-field pattern** (a `<label htmlFor>` + a styled text/number `<input>` or `<textarea>` inside a field wrapper) is the `Field`/`Label`/`Input` target and is reasonably consistent in shape — but the **wrapper class differs per form**: `sub-field` (Submit), `auth-field` (AuthEmailSignup), `set-field` (Settings), and `author-edit-field` (AuthorEdit). AuthorEdit is also structurally different: it wraps the `<input>`/`<textarea>` *inside* a `<label className="author-edit-field">` (implicit association) rather than the `htmlFor` pattern the other three use. So the field/label **composition** is accidentally inconsistent even though the input *skin* is close. Several `<input>`s are **NOT** this primitive and must be fenced out:

- `ToggleSwitch.tsx` `<input type="checkbox">` is a styled **switch**, not a text field (it has its own `.toggle` primitive look). OUT — it is the switch control, not `Input`.
- `SearchBox.tsx` `<input type="text">` is the search box with its own `searchbox-*` skin and adjacent controls. The Architect decides whether the bare `Input` covers it or it stays a composed search control.
- `<select>` (3) and `<input type="number">` are field variants the Architect decides whether `Input`/`Field` covers or whether `select` is a separate concern.

**Assessment: the text `Input` skin is largely zero-diff reproducible, but the four divergent field-wrapper classes and AuthorEdit's nested-label composition mean `Field`/`Label` cannot wrap all four forms with one clean composition without either (a) preserving each wrapper class as additive layout-only, or (b) escalating. The checkbox/switch and search inputs are fenced out. Medium risk; likely reproducible byte-identical by preserving the per-form wrapper classes, but the Architect must confirm none of the four wrappers forces a re-skin.**

### `Pill` — INCONSISTENT (likely escalation surface). At least four visually-distinct "pill" looks, only one of which is the existing `GenrePill`.

There is already a `Pill.tsx`/`Pill.css` exporting a `GenrePill` component (`pill pill-genre` — amber-tint fill, `radius-20`), used in `BookHeader.tsx`, `ShelfControl.tsx`, `TagControl.tsx`. But the genre/signal/count pills do **not** all share that look:

1. **`GenrePill`** (`Pill.tsx`, `.pill`/`.pill-genre`/`.pill-conf`/`.pill-community`) — amber-tint fill, `radius-20`, optional count badge, a `community` variant with an inset hairline ring. The one already-componentized pill.
2. **`gps-pill`** (`GenrePillSelector.css`) — a **selectable** genre pill: transparent background, 1px `border-hover`, muted text, with `gps-on` (amber-tint fill + amber border) and `gps-off` (disabled) states. `radius-20` like `GenrePill` but a **different fill/border model** (bordered toggle, not a filled chip). This is a Story-45 **DEFERRED** raw `<button>`.
3. **`rated-by-more`** (`RatedByRow.css`) — a "+N" overflow control at the end of an avatar pile: `radius-pill`, `surface` background, 1px `border`, amber text, fixed 30px height. A pile-overflow affordance, not a tag chip. This is a Story-45 **DEFERRED** raw `<button>`.
4. **`book-signal`** (`BookCard.css`, `.book-signal` + `-positive`/`-negative`/`-sovereign`/`-amber` tones) — a tone-keyed quality-signal tag: `radius-lg` (not `radius-20`), smaller type, four tone tints. Plus the related `cs-item-signal` (`CommunitySubmissions.tsx`) and `tagc-reviewed` (`TagControl.tsx`) signal treatments.

These four do not cluster onto one clean `(variant, size, state)` API the way Story 46's icons cleanly lifted. A genre chip (filled), a selectable genre toggle (bordered, stateful), a circular pile-overflow count, and a tone-keyed signal tag are genuinely different shapes with different radii and fill models. **A single `Pill` primitive that reproduces all four byte-identical risks either (a) a sprawling variant surface, or (b) a case where one look cannot be expressed by a clean API → escalate.** The narrow, certain win is migrating the two **deferred** pills (`gps-pill`, `rated-by-more`) plus folding the existing `GenrePill` in; whether `Pill` also subsumes `book-signal`/`cs-item-signal`/`tagc-reviewed` (the signal pills) byte-identical, or whether those are a separate later concern, is an open question and a candidate escalation. **Assessment: accidentally inconsistent. The deferral-clearing subset is reproducible; the full pill unification is a likely escalation. This drives the SPLIT recommendation.**

### `Link` — INCONSISTENT and LARGEST (likely escalation surface). Many distinct link looks plus the link-as-button affordances.

`<Link>` (react-router): **40 instances across 26 files**; raw `<a>`: **~5 more**. Distinct link looks include `nav-link`/`nav-signin`/`nav-wordmark` (Nav), `footer-links`/`footer-domain`/`footer-tagline` (Footer), `author-badge-link` (AuthorBadge ×2), `*-seeall` (`shelf-seeall`, `searchbox-seeall`, `genres-seeall` — multiple "see all" affordances), `wtr-link` (WhereToRead), `me-nostr-link` (ProfileMe), `dc-exact-link` (DuplicateCheck), `not-found-link` (NotFound), plus plain unstyled `<Link>` wrappers around cards/covers (`BookCard`, `GenreGrid`, `Shelf`, `ReviewsList`). Two sub-classes matter:

- **Text/nav/footer links** — many small bespoke looks (underline-on-hover, color, weight vary per site). Reproducing all of them byte-identical through one `Link` primitive with a clean variant surface is the same accidental-inconsistency tension as the buttons.
- **Link-styled-as-button affordances** (the hard part, see Background) — `cta-btn` `<a>`, `auth-submit` `<Link>`, `auth-btn-secondary` `<Link>` (×3). These re-use the **button skin** and must render byte-identical to the `Button` primitive while staying real links. The `auth-linklike` ×2 and `sub-back` **DEFERRED** raw `<button>`s also land here (link-styled controls that are `<button>` today and become `Link`).

`Link` is the largest and most heterogeneous surface. A clean `Link` that reproduces 40+ sites byte-identical — including the button-skin-sharing affordances — is the riskiest reproduction in the story. **Assessment: accidentally inconsistent and large. The deferral-clearing subset (`auth-linklike` ×2, `sub-back`) plus the link-as-button affordances are the certain, scoped win; a full nav/footer/byline link unification is a likely escalation or a deliberate later story. This is the strongest driver of the SPLIT recommendation.**

### `Card` — INCONSISTENT and LARGE. No single "card" class; ~30 hand-rolled parchment surfaces.

There is **no shared card class**. The parchment-on-parchment surface (`background: var(--u-surface-card)` + a radius + a border/inset elevation) is hand-rolled in **~30 selectors across ~25 component/route CSS files** — `BookCard` (`.book-card`), `AuthMethodCard`, `auth-card`, `ratings-panel`, `ProfileStats`, `SovereigntyNote`, `WhereToRead`, `DuplicateCheck`, `Hero`, `Nav`, `AccountMenu`, the form panels in `Submit`/`Settings`, and more — each with its own radius, padding, border, and inset-elevation combination. `BookCard` is the big one (it is also wrapped in a `<Link>`, intersecting the `Link` primitive). The looks are **not** one card; they are a family of related-but-divergent surfaces. **Assessment: accidentally inconsistent and the largest surface by file count. A single `Card` primitive that reproduces ~30 distinct surfaces byte-identical is a major undertaking and a likely escalation (some surfaces will not reduce to a clean `(variant, padding, elevation)` API without a re-skin). The Architect must decide which surfaces are genuinely the same `Card` vs which stay bespoke; any surface that cannot be reproduced zero-diff by a clean API is an escalation, not a normalize.**

### Survey summary

| Primitive | Instances | Clustering | Risk |
|---|---|---|---|
| `Avatar` | 1 component, 5 call sites | **Clean** — one look | Low — a MOVE + re-point |
| `Input`/`Field`/`Label` | 19 `<input>` / 3 `<textarea>` / 3 `<select>` / 23 `<label>`, 8 files | **Mixed** — input skin close, 4 wrapper classes + nested-label composition diverge; checkbox/switch + search fenced out | Medium |
| `Pill` | 4+ distinct looks (existing `GenrePill`, `gps-pill`, `rated-by-more`, `book-signal`/`cs-item-signal`/`tagc-reviewed`) | **Inconsistent** | High — deferral subset clean; full unification likely escalation |
| `Link` | 40+ `<Link>`/`<a>`, 26 files; many bespoke looks + link-as-button affordances | **Inconsistent + largest** | High — deferral + link-as-button subset clean; full unification likely escalation |
| `Card` | ~30 hand-rolled parchment surfaces, ~25 files | **Inconsistent + large** | High — likely partial; some surfaces likely escalation |

## SCOPE / SPLIT recommendation

**Recommend SPLIT into two stories (47a then 47b), and flag that even 47b may need to land partial with escalations.** Rationale:

- Story 45 already proved that forcing accidentally-inconsistent instances through one clean primitive in one story creates exactly the zero-diff-vs-normalize crisis the user has now banned. `Pill`, `Link`, and `Card` here are at least as inconsistent as the buttons were, and `Card` and `Link` are each larger than the entire button surface. Five primitives + the deferral migration in one story is too large and carries three independent escalation risks.
- The clean wins and the deferral-clearing obligation cluster naturally apart from the large unification risk:

  - **Story 47a — `Link` + `Pill` (clears the Story-45 deferrals; scoped to the deferral + link-as-button + existing-GenrePill subset).** This is the obligation half: build `Link` and `Pill`, migrate the four DEFERRED sites (`gps-pill`, `rated-by-more` → `Pill`; `auth-linklike` ×2, `sub-back` → `Link`), migrate the link-as-button affordances (`cta-btn` `<a>`, `auth-submit`/`auth-btn-secondary` `<Link>`s) so they render byte-identical to `Button`, and fold the existing `GenrePill` into the `Pill` primitive. The button-guard DEFERRED allowlist shrinks from five to one (`searchbox-hit`). The **scope question the Architect must answer** is exactly how wide `Pill`/`Link` go: the deferral + link-as-button + existing-GenrePill subset is the certain zero-diff win; pulling in the signal pills (`book-signal` et al.) and the full nav/footer/byline link family is where escalation risk lives, and may be fenced to 47b or a later deliberate story.

  - **Story 47b — `Input`/`Field`/`Label` + `Card` + `Avatar`.** The form/surface half. `Avatar` is the clean MOVE; `Input`/`Field`/`Label` is the medium-risk forms (preserve the four wrapper classes as additive layout-only, fence out the checkbox/switch and search); `Card` is the large, likely-partial parchment-surface unification. This half carries no deferral obligation, so it can be sequenced second and can land `Card` partial (stating which surfaces convert now and which stay bespoke) the way the epic anticipates the layout axis landing partial.

- If the user prefers **one story**, it is feasible only if the Architect first confirms (in the Architecture phase) that every in-scope instance is zero-diff reproducible by a clean API; the moment any primitive forces a re-skin, that primitive is escalated and likely split out anyway. The PO's read is that `Pill`, `Link`, and `Card` will each surface at least one non-reproducible instance, so the SPLIT is the realistic path.

**Default remains zero-diff.** Where zero-diff forces an ugly or sprawling API, the Architect FLAGS it (defer or reproduce-exactly) rather than silently normalizing. No primitive in this story is licensed to change a pixel.

## In scope

- Build the in-scope form/surface primitives in `@unbnd/ui` (`packages/ui/src/components/`), exported from `packages/ui/src/index.ts` mirroring the `Button`/`IconButton`/`Icon` precedent: `Avatar`, `Link`, `Pill`, and `Input`/`Field`/`Label`, plus `Card` — or the subset per the SPLIT (47a = `Link` + `Pill`; 47b = `Input`/`Field`/`Label` + `Card` + `Avatar`). Each is token-backed (references only existing semantic tokens; mints none), with a typed `(variant/size/state)` prop contract and no re-skin `className` (any `className` is additive layout-only per ADR 0038 §2).
- Migrate each in-scope primitive's instances **byte-identical**: same rendered markup/classes (preserving classes that also carry layout), same tokens, same `aria`/`role`/focus/keyboard treatment, same default sizes. Primitive CSS co-located in `@unbnd/ui` and imported by the primitive (ADR 0038 §7), referencing only existing semantic tokens.
- **Clear the Story-45 Pill/Link deferrals:** migrate `gps-pill` + `rated-by-more` → `Pill`; `auth-linklike` ×2 + `sub-back` → `Link`. Delete those four entries from `DEFERRED_CLASSES` in `packages/ui/test/architecture-button-literals.test.ts` so the button guard tightens automatically; the guard stays green with only `searchbox-hit` remaining.
- Migrate the **link-as-button affordances** (`cta-btn` `<a>`, `auth-submit` `<Link>`, `auth-btn-secondary` `<Link>` ×3) onto `Link` such that they render byte-identical to the `Button` primitive while remaining real anchor/route links — resolving the Story-45 "link branch stays a raw `<a>` until the Link primitive" deferral noted in `CallToAction.tsx`.
- Fold the existing `apps/web/src/components/Pill.tsx` `GenrePill` into the `Pill` primitive (or re-export it), and MOVE `apps/web/src/components/Avatar.tsx`/`Avatar.css` into `@unbnd/ui`, re-pointing the five Avatar import sites and the unit test as the Architect/Tester direct.
- Extend the guard set per ADR 0038 §6 / epic story 10 ("extends the literal guards to cover the migrated component CSS; allowlist shrinks"): the button-guard DEFERRED allowlist shrinks; the Architect decides whether new no-raw-`<input>` / no-raw-`<a>`-link / no-raw surface guards are warranted now or staged, with allowlists naming only the primitive source files. All prior guards (38–46) stay green.

## Out of scope

The fence is the in-scope form/surface primitives and their byte-identical migration only. It is a behavior-preserving, byte-identical refactor, NOT a redesign.

- **Any visual change / normalization / redesign.** This story reproduces every instance's current pixels exactly. It does NOT make the inconsistent pills, links, cards, or field wrappers consistent, retune any radius/padding/fill/weight, or unify divergent looks. Each such change alters pixels, fails the Story-39 gate, and is a separate, deliberate, design-reviewed visual-change story. **This is the central constraint; Story 45's normalization is NOT repeated** (binding user directive).
- **No re-skin `className` escape hatch.** Per ADR 0038 §2 the prop surface is `variant`/`size`/state; any `className` is additive layout-only and can never restyle the primitive.
- **The `searchbox-hit` listbox option.** It stays in the button-guard DEFERRED set; it is a `role="option"` item awaiting a future listbox/Option primitive, not a Pill or Link. Untouched.
- **The `ToggleSwitch` checkbox/switch control.** It is a switch, not a text `Input`; it keeps its `.toggle` look and is not migrated to `Input` here.
- **Token / motion / layout-primitive / theming work.** Stories 40–44 (tokens), 11 (motion util), 12 (layout primitives — `Stack`/`Grid`/`Container`), 13 (theming/dark-mode) own those. This story mints no tokens and builds no layout/motion/theme primitive. If exact reproduction appears to need a value not in the token set, that is a signal to escalate, not a license to add a token.
- **`Button`/`IconButton`/`Icon` redesign.** Shipped (Stories 45/46); not re-designed. Only the link-as-button affordances are aligned to render identically to `Button`, with no change to `Button` itself.
- **Doc re-point.** Updating `CLAUDE.md`/`AGENTS.md` to point the "brand tokens / primitives are the source of truth" rule at `@unbnd/ui` and cite the new guards is epic story 14 (repo Story TBD). This story leaves the docs as they are.
- **Behavior, copy, or information-architecture change.** No instance gains, loses, or changes a handler, label, destination, `href`/`to`, or `type`. The render must be byte-identical, proven zero-diff against the Story-39 harness with no baseline update.
- **Any surface that cannot be reproduced zero-diff by a clean API.** Such a surface is ESCALATED (defer or reproduce-exactly), never normalized. `Card` in particular may land partial, stating which surfaces convert now and which stay bespoke.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, bounty marketplace, social feed, reading progress, federation, or notifications). It is behavior-preserving Phase-2 platform-hardening infrastructure and does not approach the §11.3 line.

## Acceptance criteria

Testable from the outside. (Stated for the full five-primitive scope; if SPLIT is approved, 47a carries the `Link`/`Pill`/deferral ACs and 47b carries the `Input`/`Field`/`Card`/`Avatar` ACs.)

- [ ] Given `@unbnd/ui`, when its exports are inspected, then it provides the in-scope typed primitives (`Avatar`, `Link`, `Pill`, `Input`/`Field`/`Label`, `Card` — or the approved subset), exported from `packages/ui/src/index.ts` mirroring the `Button`/`IconButton`/`Icon` precedent, each styled only against existing semantic tokens with no new tokens minted.
- [ ] Given each primitive's prop API, when inspected, then state/variant/size ride on real typed props per ADR 0038 §2, and there is no `className` prop that can re-skin the primitive; any permitted `className` is additive layout-only.
- [ ] Given each in-scope primitive's instances, when each is rendered, then it is **byte-identical** to its pre-migration output: same markup/classes (classes that also carry layout preserved), same tokens, same `aria`/`role`/focus/keyboard treatment, same default size, same destination/handler/`type`/`href`/`to`.
- [ ] Given the Story-45 Pill/Link deferrals, when migrated, then `gps-pill` + `rated-by-more` render through `Pill`, `auth-linklike` ×2 + `sub-back` render through `Link`, and the four corresponding entries are removed from `DEFERRED_CLASSES` in `architecture-button-literals.test.ts`, leaving only `searchbox-hit`; the button guard stays green.
- [ ] Given the link-as-button affordances (`cta-btn` `<a>`, `auth-submit`/`auth-btn-secondary` `<Link>`s), when migrated to `Link`, then each renders byte-identical to the `Button` primitive while remaining a real anchor/route link with its current `href`/`to`.
- [ ] Given the existing `GenrePill` and `Avatar`, when migrated, then `GenrePill` is folded into / re-exported from `Pill` and `Avatar` is moved into `@unbnd/ui` with all five call sites re-pointed, each rendering byte-identical.
- [ ] Given the guard set, when `pnpm -r test` runs, then the button-guard DEFERRED allowlist has shrunk accordingly, any new guard added in this story lands green with an allowlist naming only primitive source files, and all prior guards (38–46) stay green (this story weakens none).
- [ ] Given the workspace, when `pnpm -r typecheck` runs, then it passes (the new primitive prop types included).
- [ ] Given the workspace, when `pnpm -r test` runs, then it passes, including the migrated unit tests and all guards.
- [ ] Given the workspace, when the `apps/web` build runs (`pnpm --filter @unbnd/web build`), then it succeeds.
- [ ] Given the Story-39 `visual` job, when it runs against this story's change, then it is **zero-diff** against the committed baselines and **no baseline is updated**. If any instance genuinely cannot be reproduced byte-identical by a clean API, that is **escalated** for an Architect decision (defer or reproduce-exactly) and never silently changed; a diff is investigated, not papered over by re-baselining.

## DList shapes touched

None. This is a front-end primitive-extraction and migration refactor, not a DList-shaped change. ADR 0038 records that the Tapestry branch survey does not apply to this design-system work; the governing prior art is in-repo: `packages/trust/test/architecture.test.ts` and the Stories 40–46 guards under `packages/ui/test/` for the guard pattern; the existing `packages/ui/src/components/` directory and `index.ts` exports for the `@unbnd/ui` primitive precedent; the existing `Avatar.tsx`/`Pill.tsx` and the bespoke instance CSS as the byte-identical source of truth. No data fixture changes.

## Open questions

For the Architect to resolve in the Architecture phase. The PO does not pick prop names, the variant map, the CSS/file layout, or the guard internals.

- **HEADLINE — SPLIT or one story?** The PO recommends SPLIT (47a `Link` + `Pill` to clear the deferrals + link-as-button subset; 47b `Input`/`Field` + `Card` + `Avatar`). The Architect confirms the split (and whether `Card` lands partial), or, if keeping one story, first confirms in the Architecture phase that every in-scope instance is zero-diff reproducible by a clean API.
- **HEADLINE — which instances are zero-diff reproducible vs accidentally-inconsistent escalations.** Per primitive, the Architect produces the authoritative map from each instance to a `(variant, size, state)` tuple and flags any instance a clean API cannot reproduce byte-identical. Specifically: the four pill looks (does `Pill` subsume `book-signal`/`cs-item-signal`/`tagc-reviewed` byte-identical, or are signal pills a later concern?); the 40+ link looks (which nav/footer/byline links a clean `Link` reproduces vs which escalate or defer); the ~30 `Card` surfaces (which are genuinely one `Card` vs which stay bespoke). **Any non-reproducible instance is escalated (defer or reproduce-exactly), never normalized.**
- **HEADLINE — how `Link` reproduces the link-as-button affordances byte-identical.** `cta-btn` `<a>`, `auth-submit`/`auth-btn-secondary` `<Link>`s share the **button** skin classes today. The Architect decides how `Link` (e.g. a `variant` that maps to the button skin, or a shared internal between `Button` and `Link`) renders these identically to `Button` without re-skinning and without converting a link into a `<button>`, and what happens to the shared `cta-btn`/`auth-submit`/`auth-btn-secondary` CSS classes after migration.
- **The per-primitive prop contracts.** ADR 0038 §2 fixes `variant: primary|secondary|ghost|danger` and `size: sm|md|lg` for the button family; the Architect designs the full typed surface for each form/surface primitive: how `Input` extends the intrinsic `<input>` props (covering text/number; whether `select`/`<textarea>` are variants or siblings); how `Field`/`Label` compose (preserving the four divergent wrapper classes — `sub-field`/`auth-field`/`set-field`/`author-edit-field` — and AuthorEdit's nested-label composition as additive layout-only); `Pill`'s variant/state surface (the selectable `gps-pill` `on`/`off` states, the count badge, the `community` treatment); `Link`'s variant surface (plain/nav/footer/byline/link-as-button) and `react-router` `<Link>` vs `<a>` polymorphism; `Card`'s padding/elevation/radius surface; and `Avatar`'s near-unchanged `size`/`picture`/`seed`/`label` contract.
- **The `className`-layout rule.** Where a call site uses its class for both skin and layout (e.g. a field wrapper that both styles and positions), the Architect decides how the layout half is preserved without a skin escape hatch.
- **Guard strategy.** The button-guard DEFERRED allowlist shrinks (four entries deleted). The Architect decides whether to add new guards now (no-raw-`<input>`, no-raw link-styled `<a>`, no-raw parchment surface) and how — each mirroring the Story-45/46 guard structure (`readFileSync` walk over `apps/web/src`, `SKIP_DIRS`, comment-strip, allowlist of primitive source files only) — or to stage some to 47b / a later story given the inconsistency means some instances stay bespoke (which a strict guard would trip on). A guard must land green the moment it ships.
- **`Avatar` placement and its unit test.** Confirm `Avatar.tsx`/`Avatar.css` MOVE into `packages/ui/src/components/` (vs a re-export shim), and whether `apps/web/test/components/avatar.test.tsx` moves alongside it into `packages/ui/test/`.
- **Whether a refining ADR is warranted.** The PO's read is yes, as for Stories 40–46: the per-primitive prop contracts, the zero-diff-vs-escalation map, the link-as-button reproduction, the SPLIT decision, and the guard strategy are design choices worth recording on top of umbrella ADR 0038 §2/§6. The Architect confirms and writes it (likely one refining ADR per split story).

## Dependencies

- Repo Stories 38–46 (epic stories 1–9) — **all merged** (`done/38-…` through `done/46-…`). Story 38's `@unbnd/ui` package (raw `src` export, React peer, no build step) is where the primitives and guards land; Story 39's `visual` CI job and committed baselines are the zero-diff gate; Stories 40–44's token guards and the `SEMANTIC_COLORS`/`GENRE_PALETTE` exports are the styling foundation the primitives reference; Story 45's `components/` directory, the `Button` primitive (which the link-as-button affordances must match), and the button-literals guard with its DEFERRED countdown are the structural and deferral precedent this story clears; Story 46's `Icon` registry confirms the byte-identical-not-normalize discipline this story follows. All prior guards must stay green.
- Per epic story 10, depends on stories 3, 4, 5, 8, 9 (color/type/spacing tokens + `Button`/`IconButton` + `Icon`) — all merged.
- Requires the Architecture phase next. The SPLIT decision, the per-primitive prop contracts, the zero-diff-vs-escalation map, the link-as-button reproduction, and the guard strategy need an Architect decision and are expected to produce a refining ADR (likely one per split story) before implementation. **This is Phase-2 platform hardening under Epic 0001** (ADR 0038; to be recorded in the post-Phase-2 PRD addendum).

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella; §2 primitive component library + the `className` rule, §6 CI guards, §7 package and CSS delivery). A refining ADR on the form/surface-primitive contracts and the migration is expected from the Architecture phase (likely one per split story).
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 10).
- Precedents: `engineering-team/stories/done/45-button-iconbutton-primitives.md` (the structural-primitive precedent + the DEFERRED Pill/Link list this story clears) and `done/46-icon-registry.md` (the byte-identical, no-normalization discipline).
- Test plan: (filled in after Test Design phase, if the gate keeps one; the guards are themselves locking tests.)
- Review: (filled in after Review phase.)
