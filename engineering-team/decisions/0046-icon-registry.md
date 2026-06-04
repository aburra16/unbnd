# ADR 0046: `Icon` registry — a typed `<Icon name>` over hand-authored SVGs, the inline-`<svg>` migration, and the no-raw-`<svg>` guard

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/done/46-icon-registry.md`

**Accepted 2026-06-04** (auto-mode epic closeout; no escalation). All 5 icons reproduce byte-identical via the discriminated-union prop surface; no normalization. Open questions are Implementer latitude (guard via `SCAN_ROOT` exclusion; one `icons.tsx` vs per-icon files). Zero-diff binding.

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03; §3 "Icon abstraction" sets the target — one `<Icon name="search" />` backed by a typed `name → SVG` registry in `@unbnd/ui`, `name` a string-literal union so a typo is a type error, inline-SVG delivery, themeable via `currentColor`/token `fill`; §6 "CI architecture guards" names the no-raw-`<svg>` guard with "allowlist names the registry/primitive files only"; §7 the no-build-step package shape). Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job: `maxDiffPixelRatio: 0`). Builds directly on **ADR 0045** (`Button`/`IconButton`: the `@unbnd/ui` React-component + co-located-CSS pattern, the `components/` directory, the no-raw-`<button>` guard this one mirrors, and the `IconButton` doc-comment promise that "when the icon registry lands (epic story 9) `children` becomes `<Icon name=…>` with no contract change") and on **ADR 0040** (the `SEMANTIC_COLORS` source export from `packages/ui/src/*`, re-exported from `index.ts`). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 9). It does not relitigate 0038, 0039, or 0045.

**This is a zero-diff refactor, NOT a Story-45-style normalization.** Story 45 deliberately normalized accidentally-inconsistent buttons and updated baselines on purpose. This story does the opposite: every icon must render **byte-identical** — same `viewBox`, same child elements and `d`/`points`/`cx`/`cy`/`r`, same `fill`/`stroke`/`strokeWidth`/`strokeLinecap`/`strokeLinejoin`, same default size, same per-element opacity, same `aria` treatment — so the Story-39 `visual` job stays zero-diff and **no baseline is updated**. The whole change is invisible to users; its only product is better structure (one swap point, a typed `name`, a CI guard). If any icon could not be reproduced exactly by a clean registry API, that would be an **escalation** for a recorded decision, never a silent normalization. **Investigation finding: all five reproduce exactly. No escalation is needed.** (See §"Zero-diff verification" and the per-icon proofs in §Decision.)

## Context

### Acceptance criteria (quoted from the story)

- `@unbnd/ui` provides a typed `Icon` React component (exported from `packages/ui/src/index.ts`, mirroring the `Button`/`IconButton`/`SEMANTIC_COLORS` export precedent) backed by a registry of hand-authored inline-SVG components, one per icon, themeable via `currentColor`/token `fill`.
- `Icon`'s `name` prop is a string-literal union of the registered names (`search`, `logo`, `check`, `bolt`, `star`), so passing an unregistered name is a TypeScript error (`pnpm -r typecheck` fails on a typo'd `name`).
- No raw `<svg>` remains in `apps/web/src` outside the registry; every icon renders through `<Icon name=…>`. The five inline `<svg>` sites are migrated and the two one-off icon components (`SearchIcon`, `LogoMark`) are removed (or reduced to a re-export), with call sites updated.
- Each of the 5 migrated icons renders **byte-identical** to its pre-migration output.
- Each current call site's props reproduce exactly: `search`'s `size`/`stroke`; `logo`'s `size`/`fill`/`opacityScheme`/`title` across all four call sites; `check`'s `className="follow-check"`; `bolt` (defaults); `star`'s filled/empty `fill` toggle across its five `IconButton` children.
- `RatingControl.tsx`'s `IconButton` star children become `<Icon name="star" …>` with `IconButton` otherwise unchanged (ADR 0045 / doc comment "with no contract change").
- A no-raw-`<svg>` guard scans `apps/web/src` (including `createElement("svg")` and polymorphic forms), finds none, passes; its allowlist names only the registry source files in `@unbnd/ui`.
- Prior guards stay green; `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` all pass.
- The Story-39 `visual` job is **zero-diff**; **no baseline is updated**. Any icon that genuinely cannot be reproduced byte-identical is escalated, never silently changed.

### The verified survey — 5 raw `<svg>` sites → 5 distinct icons (read directly against `apps/web/src` on `story-46-icon-registry`, 2026-06-04)

A `grep -rln "<svg"` over `apps/web/src` returns **exactly five files**, one `<svg>` each, confirming the story's count:

`components/SearchIcon.tsx`, `components/LogoMark.tsx`, `components/FollowButton.tsx`, `components/AuthMethodCard.tsx`, `components/RatingControl.tsx`.

Two are standalone one-off components (`SearchIcon`, `LogoMark`); three are SVGs authored inside a larger component (`CheckGlyph` and `Star` are local functions; `NostrBolt` is an exported sibling of `AuthMethodCard`). The exact markup of each (this is the byte-identical source of truth — the registry must emit these characters, attributes, and source-order):

**1. `search` — `SearchIcon.tsx`** (standalone one-off; props `size = 16`, `stroke = SEMANTIC_COLORS.muted`):
```tsx
<svg width={size} height={size} viewBox="0 0 24 24" fill="none"
     stroke={stroke} strokeWidth={2} strokeLinecap="round" aria-hidden="true">
  <circle cx="11" cy="11" r="7" />
  <path d="M21 21l-4.35-4.35" />
</svg>
```
One call site: `SearchBox.tsx:90` renders `<SearchIcon />` (all defaults: `size=16`, `stroke=muted`) inside a `<span className="searchbox-icon" aria-hidden="true">`.

**2. `logo` — `LogoMark.tsx`** (standalone one-off; props `size = 26`, `fill = SEMANTIC_COLORS.amber`, `opacityScheme = "solid"`, `title = "Unbnd"`). `opacityScheme` derives `cornerOpacity` (solid→1, soft→0.85) and `circleOpacity` (solid→1, soft→0.7), applied per element. This is the only icon that is **not** `aria-hidden` — it is `role="img"` + `aria-label={title}`:
```tsx
<svg width={size} height={size} viewBox="0 0 100 100" fill="none"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title}>
  <path d="M4 46 Q4 4 46 4 L46 46 Z" fill={fill} fillOpacity={cornerOpacity} />
  <circle cx="72" cy="26" r="18" fill={fill} fillOpacity={circleOpacity} />
  <circle cx="26" cy="72" r="18" fill={fill} fillOpacity={circleOpacity} />
  <path d="M54 54 L54 96 Q96 96 96 54 Z" fill={fill} fillOpacity={cornerOpacity} />
</svg>
```
Four call sites, four distinct prop combinations:
| Call site | `size` | `fill` | `opacityScheme` | `title` |
|---|---|---|---|---|
| `Nav.tsx:14` | 26 | (default amber) | (default "solid") | (default "Unbnd") |
| `Hero.tsx:9` | 48 | (default amber) | "soft" | (default "Unbnd") |
| `Footer.tsx:12` | 16 | `SEMANTIC_COLORS.muted` | "soft" | (default "Unbnd") |
| `AuthShell.tsx:29` | 40 | `{logoFill}` | "soft" | (default "Unbnd") |

**Subtle, load-bearing:** `AuthShell` passes `fill={logoFill}` where `logoFill?: string` is `undefined` for two of its callers (`AuthMethodSelect`, `AuthEmailSignup`) and `SEMANTIC_COLORS.signalSovereign` / `signalPositive` for the other two (`AuthNostrConnect`, `AuthWelcome`). When `logoFill` is `undefined`, `LogoMark`'s **default-parameter fallback** to `SEMANTIC_COLORS.amber` fires. The migrated `Icon name="logo"` must preserve this default-fallback-on-undefined semantics exactly, or those two auth screens render a transparent/none-filled logo instead of amber — a visible diff. This is the single trickiest reproduction point and is addressed explicitly in the prop plan.

**3. `check` — `FollowButton.tsx`**, local `CheckGlyph()` (inline SVG, not exported). `currentColor`, `className="follow-check"`, fixed 14×14, `aria-hidden`:
```tsx
<svg className="follow-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
  <polyline points="3.5,8.5 6.5,11.5 12.5,4.5" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
</svg>
```
One call site: inside the `Following` state of `FollowButton` (`<CheckGlyph />`, inside a `<Button variant="secondary" className="follow-btn follow-following">`). The `.follow-check` class is targeted by CSS as `.follow-following .follow-check` (`FollowButton.css:55`) — a **descendant** selector, so it matches the `<svg class="follow-check">` wherever it sits inside the following button. The class must land on the rendered `<svg>` element.

**4. `bolt` — `AuthMethodCard.tsx`**, exported `NostrBolt()`. `currentColor`, fixed 16×16, `aria-hidden`:
```tsx
<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
</svg>
```
One call site: `AuthMethodSelect.tsx:37` passes `<NostrBolt />` as the `icon` prop of an `AuthMethodCard`, which drops it into a `<span className="amc-icon" aria-hidden="true">` whose `color` is set inline from `iconInk`. So `bolt`'s `fill="currentColor"` resolves to that span's color. Defaults only — no per-call variation.

**5. `star` — `RatingControl.tsx`**, local `Star({ filled })` (inline SVG, not exported). `currentColor` stroke; the `fill` toggles `"currentColor"` (filled) vs `"none"` (empty) on the `filled` prop; fixed 22×22, `aria-hidden`:
```tsx
<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
  <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9 6.2 20.9l1.1-6.47-4.7-4.58 6.5-.95z"
        fill={filled ? "currentColor" : "none"} stroke="currentColor"
        strokeWidth="1.4" strokeLinejoin="round" />
</svg>
```
Five call sites, all inside `RatingControl`'s star row, each as the `children` of an `IconButton`: `<IconButton variant="bare" shape="square" className="rate-star" …><Star filled={n <= score} /></IconButton>` for `n` in `[1,2,3,4,5]`. The filled/empty toggle is the one per-usage value variation. (Note `strokeLinecap` is absent here — the registry must **not** add one.)

### Confirmed exclusions (NOT icons)

- **`Avatar`.** Verified `grep -n "svg\|createElement" apps/web/src/components/Avatar.tsx` returns nothing — `Avatar` renders an `<img>` or an initials gradient with no `<svg>` at all. It is not an icon and is not flagged by the guard. No allowlist entry, no scope. (Its `acct-trigger` `IconButton` child is an `Avatar`, not an icon, and is untouched — a separate `IconButton` child site from the `star` one this story migrates.)
- **The typographic glyphs.** `EmailGlyph` (`@`), `GLetter` (`G`), `AppleLetter` (`A`) in `AuthMethodCard.tsx` are `<span>` text glyphs, not SVGs. Out of scope; left exactly as they are. Only `NostrBolt`, the one actual `<svg>` among the `AuthMethodCard` exports, migrates.

### Constraints that bind this design

- **Zero-diff, gated by Story-39** (ADR 0039, `maxDiffPixelRatio: 0`). The prime directive: every migrated icon is byte-identical and no baseline moves. The `visual` job is the backstop on every key screen.
- **No icon library, no new icon** (`AGENTS.md` §4; ADR 0038 §3). The registry holds OUR hand-authored SVGs; the indirection is the entire point. No `@iconify`, no `lucide`, no SVGR pipeline, no sprite tooling.
- **No new tooling** (`CLAUDE.md`; ADR 0038 §6/§7). The guard is a Vitest test under the existing `pnpm -r test`. `@unbnd/ui` keeps its no-build-step source export.
- **No new tokens** (story out-of-scope). The icons reference `currentColor` and the existing `SEMANTIC_COLORS` (amber, muted, signalSovereign, signalPositive) exactly as today. No hex literal outside `tokens.css`.
- **No AI-slop** in any doc-comment or string this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- The `@unbnd/ui` package is already React-ready from Story 45: `packages/ui/tsconfig.json` has `lib: ["ES2022","DOM","DOM.Iterable"]` and `jsx: "react-jsx"`; `@types/react@18.3.29` + `@types/react-dom@18.3.7` are pinned dev deps; `react`/`react-dom` are peers; no build step. So **no package-config change is needed** — the registry `.tsx` files typecheck and bundle exactly as `Button.tsx`/`IconButton.tsx` do.
- In-repo prior art governs; the Tapestry branch survey does not apply (story "DList shapes touched: None").

## Options considered

The load-bearing decisions: (1) the registry shape and how the `name` union is derived; (2) the prop surface that reproduces every site byte-identical (the zero-diff crux); (3) the `IconButton` integration; (4) one-off-component removal; (5) the guard's detection + allowlist. The options are framed around (1) and (2); the rest follow from the chosen shape.

### Option A — One `<Icon name>` dispatcher over a typed `name → render-function` map; uniform base props + a typed per-icon discriminated extra; `name` union via `keyof` (CHOSEN)

A single directory `packages/ui/src/components/Icon/` holds:
- one file per icon defining a pure render function `(props) => ReactElement` that emits that icon's exact SVG (the byte-identical markup above), reading only the props it actually uses;
- a registry object `ICONS` mapping each literal key to its render function;
- `Icon.tsx`: the public component. `export type IconName = keyof typeof ICONS` derives the union **from the map keys**, so the union cannot drift from the registered set. `Icon` dispatches `ICONS[name](rest)`.

Props are a **small uniform base** (`size?`, `className?`, plus the SVG passes `currentColor`/`fill`/`stroke` through where each icon already used them) augmented by **typed per-icon props modeled as a discriminated union on `name`**, so `logo`'s `fill`/`opacityScheme`/`title` and `star`'s `filled` are only accepted (and only required-typed) on their own icon, and a typo or a wrong-icon prop is a type error.

- Pros: single typed entry point (`<Icon name>`); the union is `keyof` the map so it is impossible to register an icon without adding it to the union or vice-versa; per-icon render functions reproduce each SVG verbatim with zero shared-abstraction pressure (no icon is forced to grow an attribute another needs); the discriminated-union props give `logo`/`star` exactly the surface they need without polluting the others; mirrors the `Button` `VARIANT_CLASS`-map + typed-props pattern from ADR 0045 one-to-one; no build step, no new dep.
- Cons: a small amount of TypeScript machinery for the discriminated-union props (a per-icon props map keyed by `IconName`); marginally more types than a "one prop bag for all" approach. Mitigated: the machinery is ~15 lines and is the thing that makes a wrong-icon prop a compile error, which is the point.

### Option B — A `name → React component` map, each entry a full component, `Icon` just looks it up and spreads a single shared prop bag

`ICONS: Record<IconName, FC<IconProps>>` where every icon component takes one shared `IconProps` (a superset: `size?`, `fill?`, `stroke?`, `opacityScheme?`, `filled?`, `title?`, `className?`), and each icon ignores the props it doesn't use.

- Pros: very flat; `Icon` is a one-liner (`const C = ICONS[name]; return <C {...rest} />`).
- Cons: the prop bag is a **grab-bag superset** — every icon's type accepts `opacityScheme` and `filled` even though only `logo`/`star` honor them, so passing `filled` to `search` is silently a no-op instead of a type error. That is the exact "encode accidental surface as if it were intentional" debt ADR 0045 fought (its rejected `tone` grab-bag). It also makes the zero-diff reproduction *less* safe: a shared component signature invites a future edit that "helpfully" applies a shared prop to an icon that shouldn't have it, drifting pixels. Rejected for the same reason 0045 rejected its grab-bag.

### Option C — Sprite sheet (`<svg><use href="#icon-…">`) delivered from `@unbnd/ui`

Author the five SVGs as `<symbol>`s in one sprite, render `<Icon>` as `<svg><use>`.

- Pros: ADR 0038 §3 explicitly allows a sprite as an internal alternative the primitive could switch to later.
- Cons: changes the **rendered DOM** from inline `<svg>` with child paths to `<svg><use href>`, which is not byte-identical (different element tree, `<use>` shadow vs inline children) and would diff the Story-39 job; it complicates per-element opacity (`logo`) and the `filled` fill-toggle (`star`) because a `<symbol>` is shared geometry, not per-instance attributes; and it introduces a sprite build/inlining concern. Story out-of-scope explicitly defers sprite delivery. Rejected: it breaks zero-diff and adds the one pipeline the story forbids. (Left as the documented future internal swap 0038 §3 permits, behind the same `Icon` API.)

## Decision

We choose **Option A**. It is the only option that gives a single typed `<Icon name>` entry point, derives the `name` union from the registered set so it cannot drift, reproduces all five SVGs byte-identical via per-icon render functions, and types `logo`'s/`star`'s extra props so a wrong-icon prop is a compile error — without the grab-bag prop bag (Option B) or the DOM-changing sprite (Option C). It mirrors ADR 0045's map-plus-typed-props shape exactly.

### 1. The registry shape and the `name` union

Directory: **`packages/ui/src/components/Icon/`** (a sub-directory under the existing `components/`, alongside `Button.tsx`/`IconButton.tsx`, keeping the five icon sources grouped and giving the guard one allowlist prefix to name). Layout:

```
packages/ui/src/components/Icon/
  Icon.tsx        # public <Icon> component + IconName union + ICONS map + props types
  icons.tsx       # the five per-icon render functions (the byte-identical SVGs)
```
(Two files is enough; the five render functions are tiny. The Implementer may instead split `icons.tsx` into `icons/search.tsx` … per-icon files if preferred — the allowlist names the `Icon/` directory either way. No CSS file: every icon styles via `currentColor`/passed `fill`/`stroke`, so there is no co-located `Icon.css`.)

The union is derived from the map, never hand-listed:

```ts
// packages/ui/src/components/Icon/Icon.tsx (shape sketch — Implementer writes the final)
const ICONS = {
  search: renderSearch,
  logo: renderLogo,
  check: renderCheck,
  bolt: renderBolt,
  star: renderStar,
} as const;

export type IconName = keyof typeof ICONS; // "search" | "logo" | "check" | "bolt" | "star"
```

`Icon` is exported from `packages/ui/src/index.ts` next to `Button`/`IconButton`:
```ts
export { Icon } from "./components/Icon/Icon";
export type { IconName, IconProps } from "./components/Icon/Icon";
```

### 2. The prop surface — proving zero-diff per icon (the crux)

`Icon`'s props are a **discriminated union on `name`**: a small shared base (`size?`, `className?`) plus a per-icon extras map, so each icon accepts exactly the props it honors and nothing else.

```ts
// shape sketch
type BaseIconProps = { size?: number; className?: string };

type IconPropsByName = {
  search: { stroke?: string };                                  // search stroke
  logo:   { fill?: string; opacityScheme?: "solid" | "soft"; title?: string };
  check:  {};                                                   // currentColor only
  bolt:   {};                                                   // currentColor only
  star:   { filled?: boolean };                                 // fill toggle
};

export type IconProps = {
  [K in IconName]: { name: K } & BaseIconProps & IconPropsByName[K];
}[IconName];

export function Icon(props: IconProps) {
  // dispatch to ICONS[props.name], passing the narrowed props
}
```

Passing `filled` to `<Icon name="search">` is a **type error** (it is not in `search`'s extras); a typo'd `name` is a type error (not in the union). This satisfies the AC's "typo'd `name` fails `pnpm -r typecheck`" both for the name and for cross-icon prop misuse.

The **per-icon defaults live in the render functions** (mirroring the source one-offs exactly), so each call site reproduces byte-identical:

| Icon | Default `size` | Color prop + default | Other defaults | aria | Per-call variation reproduced |
|---|---|---|---|---|---|
| `search` | **16** | `stroke` default `SEMANTIC_COLORS.muted` | `fill="none"`, `strokeWidth={2}`, `strokeLinecap="round"` fixed | `aria-hidden="true"` | `SearchBox` uses all defaults → identical |
| `logo` | **26** | `fill` default `SEMANTIC_COLORS.amber` | `opacityScheme` default `"solid"`, `title` default `"Unbnd"`; `cornerOpacity`/`circleOpacity` derived per element; `xmlns` + `fill="none"` on root | **`role="img"` + `aria-label={title}`** (NOT `aria-hidden`) | Nav (26/solid), Hero (48/soft), Footer (16/muted/soft), AuthShell (40/`logoFill`/soft) — all four exact, including the undefined-`fill`→amber fallback (below) |
| `check` | n/a — fixed `width="14" height="14"` | `currentColor` (stroke), fixed | `viewBox="0 0 16 16"`, `fill="none"`, `strokeWidth="1.8"`, `strokeLinecap`/`strokeLinejoin` `"round"` fixed | `aria-hidden="true"` | `className="follow-check"` passthrough onto the `<svg>` |
| `bolt` | n/a — fixed `width="16" height="16"` | `currentColor` (fill), fixed | `viewBox="0 0 24 24"` fixed | `aria-hidden="true"` | defaults only → identical |
| `star` | n/a — fixed `width="22" height="22"` | `currentColor` (stroke), fixed | `viewBox="0 0 24 24"`, `strokeWidth="1.4"`, `strokeLinejoin="round"` fixed; **no `strokeLinecap`** | `aria-hidden="true"` | `filled` boolean → `fill={filled ? "currentColor" : "none"}` |

**Three reproduction subtleties the Implementer MUST honor for byte-identity:**

1. **`logo`'s undefined-`fill`→amber fallback.** `AuthShell` passes `fill={logoFill}` and `logoFill` is `undefined` for two callers. `renderLogo` MUST use a **default-parameter / `??`** fallback to `SEMANTIC_COLORS.amber` so `fill === undefined` resolves to amber, exactly as `LogoMark`'s `fill = SEMANTIC_COLORS.amber` default does. (A naive `fill={props.fill}` would emit `fill={undefined}` → React drops the attribute → SVG `fill` falls back to `none`/inherited, a visible diff on those two auth screens.) Same applies to `size`, `opacityScheme`, `title` defaults — model them as default parameters in the render function, not as required props.

2. **`logo`'s per-element opacity.** `opacityScheme` derives `cornerOpacity` (solid 1 / soft 0.85) on the two `<path>`s and `circleOpacity` (solid 1 / soft 0.7) on the two `<circle>`s, via `fillOpacity`. `renderLogo` reproduces both derivations and applies them per element exactly as the source.

3. **Attribute presence/source-order and `size` typing.** React renders SVG attributes in JSX source order and omits `undefined` ones; the render functions emit attributes in the **same source order** as the originals and emit `size` as `width={size} height={size}` for `search`/`logo` (numeric, matching `size?: number`) and as the **string literals** `width="14"`/`"16"`/`"22"` and `height=…` for `check`/`bolt`/`star` (which had no `size` prop — these icons take **no `size` prop at all**, so their fixed dimensions cannot drift). `search`/`logo` keep `size` as the sole numeric dimension prop. `star` must NOT gain a `strokeLinecap` (the source has none).

This is the zero-diff guarantee: each render function is a verbatim transcription of its source `<svg>`, parameterized by exactly the props that source already varied.

### 3. `IconButton` integration — confirmed, no contract change

`RatingControl.tsx`'s five star buttons keep their `IconButton` wrappers exactly as today; only the **child** changes from the local `<Star filled={n <= score} />` to `<Icon name="star" filled={n <= score} />`. `IconButton`'s contract (ADR 0045 §1) is untouched: it still takes the icon node as `children: ReactNode`, and `<Icon>` returns a `ReactElement`, so it slots in with **no change to `IconButton.tsx`** — fulfilling the doc-comment promise "when the icon registry lands … `children` becomes `<Icon name=…>` with no contract change." The `Star` local function is then deleted from `RatingControl.tsx` (its `<svg>` was the only one in the file → file goes clean). The `rate-star` CSS (`.rate-star`, `.rate-star:hover` color) is on the `IconButton` element, not the SVG, so it is unaffected; the star's `currentColor` continues to inherit from `.rate-stars` as before. (The `acct-trigger` `IconButton` whose child is an `Avatar` is NOT touched — `Avatar` is not an icon.)

### 4. Removing the one-off components

- **`SearchIcon.tsx` and `LogoMark.tsx` are deleted.** Their two consumers update their imports to `import { Icon } from "@unbnd/ui"` and their JSX to `<Icon name="search" />` / `<Icon name="logo" size=… fill=… opacityScheme=… />`. We do **not** keep a re-export shim: a re-export would be a second public surface for the same icon (two ways to render search), which dilutes the "one swap point" gain and gives the guard a raw-`<svg>`-free file to no purpose. The five call sites (`SearchBox`, `Nav`, `Hero`, `Footer`, `AuthShell`) repoint to `<Icon>`. (Decision: **delete, do not re-export.**)
- **`CheckGlyph` (local), `Star` (local) are deleted**; their inline SVG moves into the registry and their single call sites become `<Icon name="check" className="follow-check" />` / `<Icon name="star" filled=… />`.
- **`NostrBolt` is deleted from `AuthMethodCard.tsx`**; `AuthMethodSelect.tsx:37` changes `icon={<NostrBolt />}` → `icon={<Icon name="bolt" />}` and drops the `NostrBolt` import. The sibling typographic glyph exports (`EmailGlyph`, `GLetter`, `AppleLetter`) stay exactly as they are (they are `<span>`s, not SVGs, not icons).

After this, `apps/web/src` has **zero** `<svg>` elements; all five render through `<Icon>`.

### 5. The guard

A new Vitest guard `packages/ui/test/architecture-svg-literals.test.ts`, structurally mirroring `architecture-button-literals.test.ts` (same `REPO`/`SCAN_ROOT = apps/web/src`/`SKIP_DIRS`, same `stripComments` + `walk` + brace/string-aware opening-tag scan, same single aggregated `expect(offenders).toEqual([])`). Differences from the button guard:

- **Detection patterns:**
  - Raw `<svg` JSX opening tags: `/<svg(?=[\s/>])/g` (word-boundary lookahead so a hypothetical `<svgFoo>`/`<Svg>` is not matched; lowercase only — `<Icon>` is not a raw svg).
  - `createElement("svg")` / `createElement('svg')`: `/\bcreateElement\(\s*(["'])svg\1/g`.
  - Polymorphic `"svg"`/`'svg'` tag literal used as a component tag (mirroring the button guard's `POLYMORPHIC_BUTTON`): `/(["'])svg\1/g`. **No `type`-attribute carve-out is needed** here — unlike `"button"`, the string `"svg"` has no HTML-attribute-value role to exclude. (The Implementer keeps the comment-strip + string-aware scan so an `"svg"` inside a comment or an unrelated string is whitespaced/handled; in practice `apps/web/src` has no incidental `"svg"` literal, so this pattern is a future-proofing tripwire, not an active matcher.)
- **Allowlist = registry source files ONLY, and NO deferred countdown set.** Unlike the button guard (which carried five deferred-by-class exemptions counting down to zero as `Link`/`Pill`/listbox land), **every** one of the five `<svg>` sites migrates in *this* story, so `apps/web/src` reaches **zero** offenders with the allowlist naming only `@unbnd/ui` registry source. Two honest ways to express "registry source is exempt", pick one (recommend the first):
  1. **Scope exclusion** (matches the button guard's stance that the primitive home is simply not scanned): `SCAN_ROOT` is `apps/web/src`, and the registry lives in `packages/ui/src/components/Icon/`, which is **outside** `SCAN_ROOT`. So the registry is never scanned and needs no allowlist entry at all — exactly as the button guard does not scan `packages/ui/src/components`. This is the cleanest: the guard's job is "no raw `<svg>` in **app** code," and the registry is package code. **Recommended.**
  2. If the gate wants an explicit in-guard allowlist constant for documentation, add `const ALLOWLIST: string[] = []` (empty, with a comment "the registry lives in @unbnd/ui, outside SCAN_ROOT; there is no deferred set — every app-code <svg> migrates in story 46") so the *absence* of a countdown is recorded in the guard itself.

  Either way, the guard's comment header states explicitly: **no `<svg>` is deferred; this guard reaches zero in `apps/web/src` the moment the migration lands, and stays zero forever after.** `Avatar` uses no `<svg>` (verified), so it is not flagged and needs no exemption.

- **Expected state:** RED before the Implementer (5 raw `<svg>` in `apps/web/src`), GREEN after (0). Guard fails on any new raw `<svg>` / `createElement("svg")` / `"svg"` polymorphic tag added to app code thereafter.

### Zero-diff verification (no escalation)

Walking the story's escalation trigger ("any icon that cannot be reproduced byte-identical by a clean registry API → escalate"): each of the five is a self-contained SVG whose only variability is captured by a typed prop the render function already honors (`search`: `size`/`stroke`; `logo`: `size`/`fill`/`opacityScheme`/`title` incl. the undefined→amber fallback; `check`: `className`; `bolt`: none; `star`: `filled`). None needs normalization, a new token, a merged attribute set, or an aria change. The two non-trivial surfaces (`logo`'s per-element opacity + `role="img"`/`aria-label`, and `star`'s fill toggle) are reproduced by parameterized render functions, not flattened. **No escalation is required.** The Story-39 `visual` job is the backstop; if implementation surfaces any drift, it is investigated, not re-baselined.

## Consequences

- **Enables:** an icon-set swap is one directory instead of N import sites; a typo'd or wrong-icon `name`/prop is a compile error; the no-raw-`<svg>` gain is held by CI, not review vigilance; `apps/web/src` is `<svg>`-free; the `IconButton`-children promise from ADR 0045 is fulfilled.
- **Constrains / makes harder:** a new icon now must be added in two coordinated spots (a render function + the `ICONS` map entry) — but the `keyof` union means forgetting either is a type error, so the coupling is enforced, not fragile. The discriminated-union props add a little TypeScript surface; the payoff is wrong-icon-prop type safety. Direct rendering of a bespoke one-off `<svg>` in app code is now forbidden (by design); a genuinely one-off illustration that is not a reusable icon would either join the registry or live in `@unbnd/ui` outside `SCAN_ROOT`.
- **New debt / follow-ups:** none introduced. The sprite-sheet internal swap remains available behind the same `Icon` API (ADR 0038 §3) as a future option, not a debt. Re-pointing the `CLAUDE.md`/`AGENTS.md` "no icon libraries" doc rule to cite this guard is epic story 14, out of scope here.
- **Affects existing fixtures?** No. This is a pure component-extraction refactor; no `apps/web/src/data/` fixture changes, no DList shapes.
- **New dependency?** No. No icon library, no SVGR, no sprite tooling. `@unbnd/ui` already has React + `@types/react` from Story 45.
- **PRD section change required?** No. Touches no product surface; nowhere near the PRD §11.3 out-of-scope line.

## Implementation notes

Concrete anchors for the Implementer:

- **New: `packages/ui/src/components/Icon/icons.tsx`** — five pure render functions, each a verbatim transcription of its source `<svg>` (markup in §Context), parameterized only by that icon's props with the same defaults:
  - `renderSearch({ size = 16, stroke = SEMANTIC_COLORS.muted, className })` — circle + path, `fill="none"`, `strokeWidth={2}`, `strokeLinecap="round"`, `aria-hidden="true"`.
  - `renderLogo({ size = 26, fill = SEMANTIC_COLORS.amber, opacityScheme = "solid", title = "Unbnd", className })` — derive `cornerOpacity`/`circleOpacity`; `role="img"`, `aria-label={title}`, `xmlns`, two paths + two circles with per-element `fillOpacity`. **Default-parameter fallbacks are load-bearing** (the `AuthShell` undefined-`fill`→amber case).
  - `renderCheck({ className })` — fixed 14×14, `viewBox="0 0 16 16"`, the polyline, `currentColor`, `aria-hidden="true"`; apply `className` onto the `<svg>` (the `follow-check` case).
  - `renderBolt({ className })` — fixed 16×16, `viewBox="0 0 24 24"`, `fill="currentColor"`, the bolt path, `aria-hidden="true"`.
  - `renderStar({ filled = false, className })` — fixed 22×22, `viewBox="0 0 24 24"`, the star path with `fill={filled ? "currentColor" : "none"}`, `stroke="currentColor"`, `strokeWidth="1.4"`, `strokeLinejoin="round"` (NO `strokeLinecap`), `aria-hidden="true"`.
  - Emit attributes in the **same source order** as the originals; pass `className` through onto the root `<svg>` for every icon (so `follow-check` works and future layout classes can ride along).
- **New: `packages/ui/src/components/Icon/Icon.tsx`** — the `ICONS` map (`as const`), `export type IconName = keyof typeof ICONS`, the `IconProps` discriminated union (`{ name } & BaseIconProps & IconPropsByName[name]`), and `export function Icon(props)` dispatching `ICONS[props.name](props)`. No CSS import.
- **Edit: `packages/ui/src/index.ts`** — add `export { Icon } from "./components/Icon/Icon"` and `export type { IconName, IconProps } from "./components/Icon/Icon"` after the `IconButton` exports.
- **New: `packages/ui/test/architecture-svg-literals.test.ts`** — the guard (§5). Copy `architecture-button-literals.test.ts`'s scaffolding; swap the three patterns for the `<svg>` forms; drop the `DEFERRED_CLASSES` allowlist and `isDeferred` (no deferred set); keep `SCAN_ROOT = apps/web/src` so the registry under `packages/ui` is out of scope and needs no allowlist; header-comment that this reaches and holds zero.
- **Migrate (delete the one-offs, repoint call sites):**
  - Delete `apps/web/src/components/SearchIcon.tsx`; `SearchBox.tsx:6,90` → import `{ Icon }` from `@unbnd/ui`, render `<Icon name="search" />`.
  - Delete `apps/web/src/components/LogoMark.tsx`; `Nav.tsx` → `<Icon name="logo" size={26} />`; `Hero.tsx` → `<Icon name="logo" size={48} opacityScheme="soft" />`; `Footer.tsx` → `<Icon name="logo" size={16} fill={SEMANTIC_COLORS.muted} opacityScheme="soft" />`; `AuthShell.tsx` → `<Icon name="logo" size={40} fill={logoFill} opacityScheme="soft" />` (keep passing `logoFill` — the undefined→amber fallback lives in `renderLogo`).
  - `FollowButton.tsx` → delete `CheckGlyph`; the `Following` branch renders `<Icon name="check" className="follow-check" />`; add `Icon` to the existing `@unbnd/ui` import.
  - `AuthMethodCard.tsx` → delete `NostrBolt`; `AuthMethodSelect.tsx:6,37` → drop the `NostrBolt` import, render `icon={<Icon name="bolt" />}`, import `{ Icon }` from `@unbnd/ui`.
  - `RatingControl.tsx` → delete `Star`; the five `IconButton` children become `<Icon name="star" filled={n <= score} />`; add `Icon` to the existing `@unbnd/ui` import.
- **Verify:** `pnpm -r typecheck` (the `name` union + discriminated props), `pnpm -r test` (the new guard GREEN, all prior guards GREEN, web unit suite), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job **zero-diff with no baseline update**.

## Out of scope

- **Any visual change.** No icon is redesigned, retuned, resized, recolored, re-aria'd, normalized toward another, or added. Byte-identical only; a diff is investigated, not re-baselined.
- **`Avatar`** (renders `<img>`/initials, no `<svg>`; not an icon; untouched; epic story 10).
- **The typographic glyphs** `EmailGlyph`/`GLetter`/`AppleLetter` (`<span>` text, not SVGs; left as-is).
- **Any other primitive** (`Input`, `Field`/`Label`, `Card`, `Pill`, `Link` are epic story 10). `Button`/`IconButton` (Story 45) are not re-designed; `IconButton` only has its star `children` repointed, with no contract change.
- **Any token change.** No new color/size token; icons reference `currentColor` + existing `SEMANTIC_COLORS` exactly.
- **A sprite-sheet delivery / pipeline** (ADR 0038 §3 allows it as a future internal swap behind the same `Icon` API; this story ships inline-SVG components and does not introduce a sprite build).
- **Re-pointing the `CLAUDE.md`/`AGENTS.md` "no icon libraries" doc rule or citing the new guard in the docs** (epic story 14).
- **Behavior, copy, or IA change.** No icon gains/loses/changes a handler, label, destination, or meaning.
