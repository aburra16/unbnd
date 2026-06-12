# Redesigning the Unbnd UI

A guide for swapping the look of Unbnd without changing how it behaves.

This document is self-contained. It assumes you have never seen this codebase.
Read it top to bottom before you touch a token or a component. Every file path,
token name, primitive name, prop, and guard below was verified against the repo;
nothing here is illustrative or aspirational.

---

## 1. Purpose and audience

`@unbnd/ui` (`packages/ui`) is the Unbnd design system: the single home for
design tokens, React primitives, the icon registry, the motion layer, and the
layout primitives. It was established by ADR 0038 and built across epic 0001
(stories 38–50).

This guide exists so that one promise holds: **you can replace the look of Unbnd
and keep its behavior byte-identical.** Colors, type, spacing, radii, motion,
component skins, and icons are all swappable. Routing, data flow, component
APIs, accessibility semantics, and page structure are not affected by a skin
change, because the app never hardcodes a visual value.

Three readers can use this guide:

- A **UI/visual designer** who wants the vocabulary to design against (the token
  axes and the primitive set) without reading TypeScript.
- A **front-end engineer** who will implement a re-skin, a theme, or a full
  overhaul.
- An **AI design agent** that needs precise file paths, prop contracts, guard
  rules, and commands to act without prior context.

---

## 2. The core mental model: skin vs structure

Unbnd separates **structure** (markup, layout, behavior, accessibility) from
**skin** (the resolved visual values and the component internals).

The rule that makes this work, enforced by CI:

> App code (`apps/web/src`) references ONLY semantic tokens and the `@unbnd/ui`
> primitives. It never holds a raw color, font size, spacing value, radius,
> shadow, z-index, motion timing, `<button>`, or `<svg>` literal.

So the skin lives in exactly one package: `@unbnd/ui`. The skin is the **token
values** in `packages/ui/styles/tokens.css` plus the **internals** (markup,
classes, CSS) of the primitives in `packages/ui/src/components/`.

**A redesign changes `@unbnd/ui`. It does not change the app.** That is the whole
design.

### The two-tier token model

`packages/ui/styles/tokens.css` is a two-tier system (ADR 0040):

- **Tier 1, raw** (`--u-raw-*`): literal values, no meaning. Example:
  `--u-raw-color-amber-500: #C4763C;`, `--u-raw-font-size-16: 16px;`,
  `--u-raw-space-8: 8px;`, `--u-raw-radius-8: 8px;`,
  `--u-raw-elevation-2: 0 3px 12px var(--u-ink-tint-10);`,
  `--u-raw-z-dropdown: 40;`, `--u-raw-duration-150ms: 150ms;`,
  `--u-raw-ease-default: ease;`.
- **Tier 2, semantic** (`--u-*`, `--signal-*`, `--genre-*`, plus `--font-*`):
  aliases that point at Tier 1 and never hold a literal. Example:
  `--u-amber: var(--u-raw-color-amber-500);`,
  `--u-font-size-16: var(--u-raw-font-size-16);`,
  `--u-space-8: var(--u-raw-space-8);`, `--u-radius: var(--u-raw-radius-8);`,
  `--signal-positive: var(--u-raw-color-green-500);`,
  `--font-sans: var(--u-raw-family-sans);`.

App CSS references **only** Tier 2 (`var(--u-amber)`, `var(--u-space-8)`, …).

Why two tiers: a re-skin is a remap of semantics to new raw values. You change
Tier-1 values (or override them in a theme); Tier-2 aliases resolve through the
new raws automatically; app CSS, which only reads Tier 2, never changes. One
edit site, zero app churn.

The layout page-frame tokens `--page-max: 720px;`, `--page-pad-x: 24px;`, and
`--chrome-max: 1200px;` (ADR 0086: the nav/footer chrome row) sit at the end of
the `:root` block and are treated as page geometry, not skin (see §5 page-frame
guard).

---

## 3. Three swap scenarios

Pick the scenario that matches your goal. Each lists what changes and what does
not.

### 3a. Re-skin (new palette / type / spacing / radii / motion, same layout and components)

This is the cleanest path. You change Tier-1 raw token **values** in
`packages/ui/styles/tokens.css`.

**Steps**

1. Open `packages/ui/styles/tokens.css`.
2. Edit the Tier-1 raw values you want to change. For a new accent, edit
   `--u-raw-color-amber-500` (and its `-600` hover / `-300` light partners, and
   the `--u-raw-color-amber-aNN` alphas if you want tints to track the new hue).
   For a new type scale, edit the `--u-raw-font-size-*` values. For new spacing,
   edit `--u-raw-space-*`. For new corners, edit `--u-raw-radius-*`. For new
   motion, edit `--u-raw-duration-*ms` / `--u-raw-ease-default`.
3. Leave the Tier-2 aliases alone. They resolve through your new raws.
4. Handle the two surfaces the raw tier cannot reach: the JS-injected colors and
   the bespoke surfaces (see §7).

**What changes:** resolved pixels everywhere a token is read.
**What does not change:** any app CSS, any primitive prop, any markup, any
behavior. App CSS reads Tier 2; Tier 2 reads your edited Tier 1.

### 3b. Add a theme / dark mode

A theme is a scoped override of the **raw color tier** under a
`[data-theme="<name>"]` selector (ADR 0050). The Tier-2 aliases resolve through
the overridden raws, so app CSS re-themes with no edit.

The mechanism, from the bottom of `tokens.css`:

- The default light skin is the `:root` block (Tier-1 raws and Tier-2 aliases).
- A theme block is `[data-theme="<name>"] { … }` that **redefines every
  `--u-raw-color-*` token** `:root` defines.
- A theme must NOT redefine Tier-2 aliases, non-color raws,
  `--u-raw-elevation-*` (elevation re-themes for free through the ink/amber tints
  it reads), or `--page-*` (page geometry is not a skin concern). A theme MAY
  override one specific Tier-2 alias for a deliberate role-remap, but it must
  never point a Tier-2 alias at a literal.
- A theme block is **inert** until its attribute is set on an ancestor — the
  same shape as the `@media (prefers-reduced-motion: reduce)` block above it.

**A dark skeleton already exists.** `tokens.css` ships
`[data-theme="dark"] { … }` as a structural-validation skeleton: a crude
surface/ink inversion that redefines every `--u-raw-color-*`. It is explicitly
NOT a finalized palette and is NOT activated (no `data-theme` attribute is set
anywhere).

**Steps to finish and activate it**

1. Replace the placeholder values in `[data-theme="dark"]` with brand-reviewed
   dark values. Keep redefining **every** `--u-raw-color-*` (the
   completeness guard, §5, fails on any missing one).
2. Handle the JS-injected colors. `[data-theme]` overrides CSS custom
   properties; it cannot reach `GENRE_PALETTE` / `SEMANTIC_COLORS` in TypeScript
   (see §7). The genre/cover hues, the avatar fills, and the SVG stroke/fill
   defaults will keep their light values unless you make the consuming code
   theme-aware. For a first dark ship this is usually acceptable because those
   hues already read on dark; if not, the consuming JS must branch on theme.
3. Activate it: set `data-theme="dark"` on `<html>` (or any ancestor of the
   app). The cleanest activation point is the document root, set before React
   mounts or via a class/attribute toggle. Add a user-facing toggle that flips
   the attribute (and persists the choice).
4. Run the guards and the visual harness (§5, §6). Adding a dark variant means
   capturing new signed-out screens under the active theme if you want pixel
   coverage of dark.

### 3c. Full overhaul / new design language

New component looks, new icons, new animations, restyle. Here you change
primitive **internals** plus tokens plus the icon registry. App markup stays
mostly unchanged because the app calls the primitives, not raw elements.

**What you edit**

- **Tokens:** redefine the design language in Tier-1 raws (and add new raw steps
  if the language needs values not yet present — add the Tier-2 alias too, since
  app CSS can only read Tier 2).
- **Primitive internals:** the `.css` next to each primitive
  (`Button.css`, `IconButton.css`, `Link.css`, `Pill.css`, `Avatar.css`,
  `Field.css`, `Container.css`) and, if the markup must change, the primitive
  `.tsx`. The prop contracts stay stable so call sites do not change.
- **Icons:** swap the SVG render functions in the `Icon` registry
  (`packages/ui/src/components/Icon/icons.tsx`) and keep the `IconName` union
  intact (see §4).
- **Bespoke surfaces and JS-injected colors:** §7.

App markup changes only if you intentionally restructure a screen, which is a
behavior change and must be reflected in the visual baselines (§6).

---

## 4. The component and token reference

### Primitives

All are exported from `packages/ui/src/index.ts` and imported by the app as
`@unbnd/ui`. Each owns its skin in a co-located CSS file. The `className` prop on
every primitive is **additive layout-only** (margin, flex/grid placement,
align-self, width-context) by the ADR 0038 §2 rule — it is never a re-skin
hook. State rides on real typed props, never on a re-skinning class.

| Primitive | File | What it replaces | Key props |
|---|---|---|---|
| `Button` | `src/components/Button.tsx` + `Button.css` | every interactive `<button>` in the app | `variant: "primary" \| "secondary" \| "ink" \| "ghost" \| "danger"` (default `"primary"`); `size: "sm" \| "md" \| "lg"` (default `"md"`); `accent?: boolean` (secondary-only amber outline); `loading?` (sets `aria-busy`, no spinner, no auto-disable); `selected?` (visual state, does not force `aria-pressed`); `block?` (full width); native `type` passed through (NOT defaulted) |
| `IconButton` | `src/components/IconButton.tsx` + `IconButton.css` | icon-only buttons | `aria-label` **required**; `variant: "ghost" \| "bare"` (default `"bare"`); `size` (same `ButtonSize`); `shape: "circle" \| "square"` (default `"square"`); `selected?`; `children` is the icon node |
| `Link` | `src/components/Link.tsx` + `Link.css` | link-styled controls + link-as-button affordances (in-scope set) | `variant: "plain-amber" \| "plain-muted" \| "button-primary" \| "button-secondary"` (default `"plain-amber"`); `as?` (render-agnostic: `"a"` default, `"button"`, or a router `Link` via `as={RouterLink}` with `to`); extra props flow through from the rendered element's type. `button-primary` emits `Button`'s own classes (`u-btn u-btn--primary u-btn--md`) so it tracks any primary restyle |
| `Pill` | `src/components/Pill.tsx` + `Pill.css` | the three subsumed pill looks | discriminated on `variant`: `"genre"` (default; non-interactive `<span>` chip; `label`, optional `color`, `count`, `community`), `"select"` (toggle `<button>`; `on?`, `disabled?`, `onClick`, `aria-pressed?`), `"count"` (circular `+N` `<button>`; `aria-label` required, `onClick`) |
| `GenrePill` | `src/components/Pill.tsx` (re-export) | the former `GenrePill` chip | thin wrapper over `Pill variant="genre"`; `label`, `color?`, `count?`, `community?` |
| `Avatar` | `src/components/Avatar.tsx` + `Avatar.css` | kind-0 picture / deterministic-initials identity circle | `label`, `seed`, `picture?`, `size?` (default `30`). Colors come from `GENRE_PALETTE` (JS-injected, see §7) |
| `Label` | `src/components/Field.tsx` + `Field.css` | the one consistent label skin (`.u-label`) | `htmlFor?`; `className` additive layout-only; `children` |
| `Field` | `src/components/Field.tsx` + `Field.css` | the shared form-column layout (`.u-field`) | `className` (the form's divergent wrapper class, additive layout-only); `children`. Layout-only, owns no skin |
| `Container` | `src/components/Container.tsx` + `Container.css` | the shared page frame | `as?` (default `"div"`); `frame?: "page" \| "chrome"` (default `"page"` emits `class="page"`; `"chrome"` emits the wide centered `chrome-row` for nav/footer bars — ADR 0086); `className` additive layout-only; `children` |
| `Icon` | `src/components/Icon/Icon.tsx` + `icons.tsx` | every `<svg>` in the app | `name: "search" \| "logo" \| "check" \| "bolt" \| "star"`; per-icon extras via a discriminated union: `search`/`logo` take `size?`, `check`/`bolt` take none, `star` takes `filled?`. Passing a wrong-icon prop is a type error |

`IconName` is derived from the `ICONS` map keys with `keyof`, so a typo or an
unregistered name is a compile error. The five render functions live in
`icons.tsx`: `renderSearch`, `renderLogo`, `renderCheck`, `renderBolt`,
`renderStar`.

Also exported: `breakpoints` (and the `Breakpoint` type) from
`src/breakpoints.ts`, `GENRE_PALETTE` (and `GenreRow`) from `src/palette.ts`,
`SEMANTIC_COLORS` from `src/colors.ts`.

### Token axes

Tier-1 raw → Tier-2 semantic. App CSS reads Tier 2 only. Real names below.

| Axis | Raw tier (`--u-raw-*`) | Semantic tier | Real examples |
|---|---|---|---|
| Color | `--u-raw-color-<group>-<key>` and `…-aNN` alphas | `--u-*`, `--signal-*`, `--genre-*` | raw `--u-raw-color-amber-500: #C4763C`, `--u-raw-color-ink-900: #1A1A2E`, `--u-raw-color-ink-a08`; semantic `--u-amber`, `--u-ink`, `--u-border`, `--u-surface-card`, `--u-ink-tint-08`, `--signal-positive`, `--genre-scifi` |
| Type — size | `--u-raw-font-size-<n>` (px) and `--u-raw-font-size-<NN>rem` | `--u-font-size-<n>` / `…rem` | `--u-raw-font-size-16: 16px`, `--u-raw-font-size-95rem: 0.95rem`; `--u-font-size-16` |
| Type — weight | `--u-raw-weight-{regular,medium,semibold,bold}` | `--u-font-weight-*` | `--u-raw-weight-semibold: 600`; `--u-font-weight-semibold` |
| Type — leading | `--u-raw-leading-<NNN>` (ratio ×100) | `--u-leading-<NNN>` | `--u-raw-leading-150: 1.5`; `--u-leading-150` |
| Type — tracking | `--u-raw-tracking-<sign><digits>` (`n`/`p` sign prefix; `em` suffix) | `--u-tracking-*` | `--u-raw-tracking-n50: -0.5px`, `--u-raw-tracking-p02em: 0.02em` |
| Type — family | `--u-raw-family-{sans,mono}` | `--font-sans`, `--font-mono` | `--font-sans: var(--u-raw-family-sans)` |
| Spacing | `--u-raw-space-<n>` (px; `n8` = −8px) | `--u-space-<n>` | `--u-raw-space-8: 8px`, `--u-raw-space-n8: -8px`; `--u-space-8`. Property-agnostic (padding/margin/gap share one alias) |
| Radius | `--u-raw-radius-<n>`, `-circle` (50%), `-pill` (999px) | `--u-radius-<n>`, `--u-radius` (= raw-8), `--u-radius-lg` (= raw-12), `--u-radius-circle`, `--u-radius-pill` | `--u-radius-8`, `--u-radius: var(--u-raw-radius-8)` |
| Elevation | `--u-raw-elevation-{hairline,1a,1b,1c,2,3,4a,4b,4c,ring-NN,ring-parchment,inset-hairline}` | `--u-elevation-*` (1:1) | `--u-raw-elevation-2: 0 3px 12px var(--u-ink-tint-10)`; `--u-elevation-2` |
| Z-index | `--u-raw-z-{base,dropdown,popover}` (1 / 40 / 50) | `--u-z-{base,dropdown,popover}` | `--u-z-dropdown` |
| Motion | `--u-raw-duration-<n>ms` (120/140/150/160/180/200), `--u-raw-ease-default: ease` | `--u-duration-<n>ms`, `--u-ease-default` | `--u-duration-150ms`, `--u-ease-default` |
| Page frame | `--page-max: 720px`, `--page-pad-x: 24px`, `--chrome-max: 1200px` | (used directly, lives in `Container`) | see §5 page-frame guard. `--page-max` is the reading column; `--chrome-max` is the wide nav/footer row (ADR 0086) |
| Breakpoints | not in CSS (custom props cannot be used in `@media`) | `breakpoints` TS const | `bp480`, `bp720`, `bp880` in `src/breakpoints.ts` |

Two motion notes for accuracy:

- `@media (prefers-reduced-motion: reduce)` zeros the six semantic duration
  aliases to `0.01ms` (not `0ms`, so `transitionend` still fires). This is the
  one intentional behavior addition in the token layer; it is inert at the
  no-preference state, so the default render is unchanged.
- Easings are untouched by that block.

---

## 5. The guardrails (work with them, not around them)

The guards are the feature that keeps the system swappable. If a new UI keeps
routing through tokens and primitives, the guards stay green and the swap is
clean. If it introduces a raw literal, a raw `<button>`, or a raw `<svg>`, CI
fails. Twelve architecture guards live in `packages/ui/test/architecture-*.test.ts`
and run via the workspace `pnpm -r test`. (A thirteenth file in that directory,
`tokens.test.ts`, is a token-sheet sanity test, not one of the twelve
architecture guards.)

| Guard file | What it forbids / locks |
|---|---|
| `architecture-token-refs.test.ts` | Every `var(--…)` in app CSS and the sheet's internal references resolves to a token defined in `tokens.css`. Kills silent fallback drift |
| `architecture-color-literals.test.ts` | No raw color literal (hex, `rgb()/rgba()`, curated named colors) outside the token layer. `transparent` / `currentColor` are not literals |
| `architecture-type-literals.test.ts` | No raw `font-size` / `font-weight` / `line-height` / `letter-spacing` / font-family stack outside the token layer |
| `architecture-spacing-literals.test.ts` | No raw padding/margin/gap component outside tokens. Bare `0` and CSS keywords pass; positioning offsets are out of scope |
| `architecture-shape-literals.test.ts` | No raw `border-radius` / `box-shadow` geometry / `z-index` literal outside tokens |
| `architecture-motion-literals.test.ts` | No raw `transition` / `animation` duration or easing outside tokens; also asserts the reduced-motion block is present |
| `architecture-button-literals.test.ts` | No raw `<button>` in `apps/web/src` (use `Button` / `IconButton`). Comment-aware; also catches `createElement("button")` and `"button"` polymorphic tags |
| `architecture-svg-literals.test.ts` | No raw `<svg>` in `apps/web/src` (use `Icon`). Comment-aware; catches dynamic forms. No deferred set — app code is at zero |
| `architecture-breakpoints.test.ts` | Every `@media` pixel is a member of `breakpoints`, and every member is used; a hardcoded pixel in `matchMedia` / `innerWidth` comparisons is an offender |
| `architecture-palette-sync.test.ts` | The TS palette (`GENRE_PALETTE`, `SEMANTIC_COLORS`) and the CSS Tier-1 raws stay byte-equal, so JS-injected colors and CSS tokens cannot drift |
| `architecture-page-frame.test.ts` | `var(--page-max)` / `var(--page-pad-x)` / `var(--chrome-max)` appear only in `Container.css` and the one bespoke `RatingControl.css` `.rate` frame. Any other use is a hand-rolled page frame |
| `architecture-theme-completeness.test.ts` | Every declared `[data-theme]` redefines every `--u-raw-color-*` `:root` defines (completeness), and at least one theme proves the raw-tier swap while leaving the Tier-2 alias `--u-amber` untouched (indirection) |

### The allowlist mechanism

The literal guards (color, type, spacing, shape, motion) are filesystem scans.
They walk `apps/web/src` and `packages/ui`, read each `.css`/`.ts`/`.tsx` file,
match a literal pattern, and aggregate offenders into one
`expect(offenders).toEqual([])`. A literal is legal **only** in an allowlisted
source file. The color guard's allowlist, for example, is exactly:

```
packages/ui/styles/tokens.css   (the CSS literal home)
packages/ui/src/palette.ts      (GENRE_PALETTE)
packages/ui/src/colors.ts       (SEMANTIC_COLORS)
```

with `apps/web/src/data` (dead fixtures), `apps/web/e2e` (visual fixtures), and
`test` directories scope-excluded. The `<button>` and `<svg>` guards scan
`apps/web/src` only; the primitive homes (`packages/ui/src/components`,
`…/Icon`) are simply outside the scan root, so they need no allowlist entry.

**The takeaway for a redesigner:** put every new literal in the token sheet (or
in `palette.ts` / `colors.ts` for the JS-injected colors), build every control
from `Button`/`IconButton`, and every icon from `Icon`. Do that and the guards
are green by construction.

---

## 6. The safety net: the visual-regression harness

The harness (ADR 0039) is how you prove "no behavior or visual change." It
captures one full-page screenshot per key screen and fails on any pixel diff
against the committed baseline. Config: `apps/web/playwright.config.ts`. Docs:
`apps/web/e2e/visual/README.md`. CI job: the `visual` job in
`.github/workflows/ci.yml`, which runs inside the pinned Playwright Docker image
and uploads the report and snapshots as artifacts.

**Pins:** `@playwright/test` is `1.60.0` (exact); the capture/CI image is
`mcr.microsoft.com/playwright:v1.60.0-jammy`. Bump both together; a bump can
change rendering and may require a baseline refresh.

**Determinism:** route-mocked fixtures (`apps/web/e2e/visual/fixtures/index.ts`,
typed against `src/lib/api.ts`), animations frozen
(`toHaveScreenshot({ animations: 'disabled' })`), fixed `1280x800` viewport at
device scale factor `1`, and `maxDiffPixelRatio: 0` (true zero-diff). Baselines
are Linux-only; `snapshotPathTemplate` carries no OS suffix.

**Run it locally (to iterate, never to commit baselines):**

```bash
pnpm --filter @unbnd/web test:visual
```

This builds `apps/web` and serves it with `vite preview` on
`http://localhost:4173`, with `VITE_API_URL` unset so the mock intercepts
`/api` and `/auth`.

**The two paths**

- **Behavior-preserving refactor (the common case).** Structure changes only and
  the run must be zero-diff. Do not touch baselines. A non-zero diff means you
  changed pixels and the refactor is not behavior-preserving.
- **Intentional visual change (a re-skin or overhaul).** You deliberately change
  pixels. Regenerate the baselines and commit them in their own clearly labeled
  commit, separate from any structural change, with a message stating the
  intended visual delta and the brand-rule review.

**Update baselines (the only sanctioned way to commit them):** run from the repo
root, inside the pinned image, so the PNGs match what CI renders:

```bash
docker run --rm --network host -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.60.0-jammy \
  pnpm --filter @unbnd/web test:visual:update
```

macOS-captured screenshots differ from Linux at the pixel level, so never commit
baselines from a local `test:visual` run.

---

## 7. Known boundaries and gotchas

These are the surfaces a clean swap must handle explicitly. They are honest gaps
in the primitivization, not bugs.

### Surfaces not yet primitivized (token-backed but bespoke)

These read tokens, so a re-skin's token-value change flows through them. But they
have no primitive, so a structural or component-look change means editing their
CSS directly (or primitivizing them first).

- **Input** — the four input skins are accidentally inconsistent and were left
  bespoke (ADR 0048 fenced them out; `Input` is escalated). Skins live across
  `apps/web/src/components/AuthForm.css`, `SearchBox.css`, `DuplicateCheck.css`,
  `ShelfControl.css`, and `routes/Settings.css`. `Label` and `Field` are
  primitivized; the input element they wrap is not.
- **Card / parchment surfaces** — bespoke per surface, e.g.
  `apps/web/src/components/AuthMethodCard.css`, `BookCard.css`,
  `components/Shelf.css`, `RatedByRow.css`. No `Card` primitive exists.
- **The bespoke nav / footer / byline link family** — out of `Link`'s scope
  (ADR 0047). Lives in `apps/web/src/components/Nav.css` / `Nav.tsx`,
  `Footer.css` / `Footer.tsx`, and the byline `<a>`s rendered from
  `RatedByRow.tsx` / `ReviewsList.tsx` / `lib/view-model.ts`. Since ADR 0086 the
  nav/footer are full-bleed bars whose inner row is `Container frame="chrome"`;
  routes compose them through `PageShell` (`apps/web/src/components/PageShell.tsx`),
  never directly.
- **The signal pills** (`book-signal` / `cs-item-signal` / `tagc-reviewed`) —
  tone-keyed quality-signal tags with a different radius/tint model, not
  subsumed by `Pill` (ADR 0047). Lives in `BookCard.css` / `BookCard.tsx`,
  `TagControl.css` / `TagControl.tsx`, `routes/CommunitySubmissions.css` /
  `.tsx`.
- **`searchbox-hit`** — the search-result hit control, still bespoke in
  `apps/web/src/components/SearchBox.css` / `SearchBox.tsx`.

For each: a re-skin needs no action (tokens carry through). A component-look
overhaul edits that CSS directly, or, better, primitivizes it first so the look
is owned in one place.

### JS-injected colors (the `[data-theme]` blind spot)

Some colors are TypeScript hex constants interpolated into the DOM by JS
(inline styles and SVG attributes), not CSS custom properties. `[data-theme]`
cannot reach them.

- `GENRE_PALETTE` in `packages/ui/src/palette.ts` — the genre/cover hues, each
  row's `bg` / `ink` / `coverTo`. Consumed by `Avatar.tsx` (initials-circle
  fill) and the cover gradient (`lib/view-model.ts`) by `hash(seed) % length`.
  Order is load-bearing; reordering re-colors books and avatars.
- `SEMANTIC_COLORS` in `packages/ui/src/colors.ts` — the SVG `stroke`/`fill`
  defaults and `logoFill` props (`amber`, `muted`, `signalPositive`,
  `signalSovereign`).

A re-skin or theme that wants these to change must edit those TS constants. The
`architecture-palette-sync.test.ts` guard requires each to stay byte-equal to
its `tokens.css` Tier-1 raw counterpart, so edit the TS constant and the
matching raw together. For a theme specifically, `[data-theme]` will not retint
these; the consuming code must branch on the active theme if you need them to
change per theme.

### Fixture-coverage gap (the verification limit)

The visual harness captures six screens, all signed-out: `/`,
`/book/the-fixture-novel`, `/profile/<fixture-npub>`, `/search?q=fixture`,
`/auth/welcome`, `/submit`. Logged-in variants and a second narrow viewport are
admitted by the `mockApi` helper and route map but not yet captured. So most
interactive and session-gated UI is **not** pixel-gated today.

For a full overhaul this is the biggest risk: the harness will not catch a
regression on a screen it does not capture. **Strongly recommended: expand the
fixtures (add signed-in fixtures and a narrow viewport) or build a component
gallery route before a big overhaul, so the swap is actually verified.** Build
coverage first, then change pixels.

---

## 8. Recommended end-to-end sequence for a full overhaul

1. **Expand visual coverage.** Add signed-in fixtures and a narrow viewport to
   `apps/web/e2e/visual/`, or add a component-gallery route that exercises every
   primitive variant, and capture baselines so the overhaul is verifiable.
2. **Define the new design language in tokens.** Set the new Tier-1 raw values
   in `tokens.css`; add new raw steps and their Tier-2 aliases if the language
   needs values not yet present.
3. **Add it as a `[data-theme]` or replace the `:root` values.** A theme if it
   coexists with the current look; a `:root` replacement if it is the new
   default.
4. **Restyle the primitive internals.** Edit the co-located CSS
   (`Button.css`, `IconButton.css`, `Link.css`, `Pill.css`, `Avatar.css`,
   `Field.css`, `Container.css`), keeping prop contracts stable.
5. **Swap the icon set.** Replace the render functions in
   `packages/ui/src/components/Icon/icons.tsx`, keeping the `IconName` union and
   the registry keys intact (or add keys and the matching `IconPropsByName`
   entries).
6. **Handle the bespoke surfaces and JS-injected colors.** Edit Input / Card /
   nav-footer-byline / signal-pill / `searchbox-hit` CSS, and the
   `GENRE_PALETTE` / `SEMANTIC_COLORS` TS constants (with their matching raws),
   per §7.
7. **Run typecheck, test, build.** `pnpm -r typecheck`, `pnpm -r test` (runs the
   twelve guards), `pnpm --filter @unbnd/web build`.
8. **Update baselines deliberately.** Run the Docker `test:visual:update`
   command and commit the PNGs in a clearly labeled, separate commit.
9. **Activate.** For a theme, set `data-theme` on `<html>` and ship the toggle.
   For a `:root` replacement, the new look is already live.

---

## 9. Worked examples

### 9a. Change the accent from amber to teal

Goal: the amber accent becomes teal everywhere, same layout and components.

1. In `tokens.css`, edit the amber raws:
   `--u-raw-color-amber-500` to your teal, `--u-raw-color-amber-600` to the teal
   hover, `--u-raw-color-amber-300` to the teal light.
2. Re-base the amber alpha raws (`--u-raw-color-amber-a04` … `-a30`) onto the
   teal RGB so amber tints (focus rings, fills) follow the new hue.
3. Leave Tier 2 alone: `--u-amber`, `--u-amber-hover`, `--u-amber-light`,
   `--u-amber-tint-*` resolve through the edited raws. App CSS, which reads only
   those aliases, does not change.
4. The amber focus ring tracks automatically: `--u-raw-elevation-ring-*` read
   the amber tints, and elevation re-themes for free.
5. Handle the JS-injected amber: in `packages/ui/src/colors.ts`, change
   `SEMANTIC_COLORS.amber` (the `LogoMark` default fill) to the same teal, and
   change the matching `--u-raw-color-amber-500` you already edited so the
   `palette-sync` guard stays green (the two must be byte-equal).
6. Verify: `pnpm -r typecheck && pnpm -r test` (token-refs, color-literals, and
   palette-sync stay green). This is an intentional visual change, so regenerate
   baselines with the Docker `test:visual:update` command and commit them in a
   labeled commit.

### 9b. Ship a polished dark mode

Goal: a real dark theme, toggleable, light remains the default.

1. In `tokens.css`, fill the existing `[data-theme="dark"]` skeleton with
   brand-reviewed values. Keep redefining **every** `--u-raw-color-*` (the
   completeness guard fails on any omission). Override only raws; leave Tier-2
   aliases, non-color raws, elevation raws, and `--page-*` untouched (the
   indirection assertion checks that `--u-amber`'s definition is unchanged in the
   theme).
2. The JS-color caveat: `[data-theme="dark"]` will not retint the
   `GENRE_PALETTE` hues, the avatar/cover colors, or the `SEMANTIC_COLORS` SVG
   defaults, because those are TS hex read by JS. Decide per case — leave them
   (they already read on dark) or make `Avatar.tsx` / `view-model.ts` / the SVG
   components branch on the active theme.
3. Activate: set `data-theme="dark"` on `<html>`. Add a toggle that flips the
   attribute and persists the choice (localStorage or a session preference);
   apply it before first paint to avoid a flash.
4. Verify: `pnpm -r test` runs `architecture-theme-completeness.test.ts`, which
   confirms the dark theme is complete and swaps through the raw tier. Add dark
   captures to the harness if you want pixel coverage of the dark screens, then
   update baselines via Docker.

---

## 10. Definition of done for a UI swap

- [ ] `pnpm -r typecheck` is green.
- [ ] `pnpm -r test` is green (all twelve `architecture-*` guards pass).
- [ ] `pnpm --filter @unbnd/web build` succeeds.
- [ ] The visual harness is reconciled: zero-diff for a structure-only refactor,
      or deliberate, labeled baselines committed separately for an intentional
      visual change.
- [ ] Bespoke surfaces handled: Input, Card, nav/footer/byline links, signal
      pills, `searchbox-hit` — edited where the look changed, or left untouched
      where only tokens changed.
- [ ] JS-injected colors handled: `GENRE_PALETTE` (`palette.ts`) and
      `SEMANTIC_COLORS` (`colors.ts`) edited where needed, each kept byte-equal
      to its `tokens.css` raw (palette-sync green).
- [ ] No raw literals introduced: no hardcoded color, type, spacing, radius,
      shadow, z-index, or motion value, and no raw `<button>` or `<svg>`, in
      `apps/web/src`.
- [ ] If a theme: every `[data-theme]` redefines every `--u-raw-color-*`, the
      theme is activated, and the toggle works.

---

## References

- ADR 0038 — design-system architecture (the umbrella):
  `engineering-team/decisions/0038-design-system-architecture.md`
- ADR 0040 — two-tier color tokens:
  `engineering-team/decisions/0040-color-tokens.md`
- ADR 0045 — Button / IconButton primitives:
  `engineering-team/decisions/0045-button-iconbutton-primitives.md`
- ADR 0046 — Icon registry:
  `engineering-team/decisions/0046-icon-registry.md`
- ADR 0049 — Container layout primitive:
  `engineering-team/decisions/0049-layout-container.md`
- ADR 0050 — theming structure:
  `engineering-team/decisions/0050-theming-structure.md`
- Package overview: `packages/ui/README.md`
- Visual harness: `apps/web/e2e/visual/README.md`
