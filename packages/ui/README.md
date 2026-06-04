# @unbnd/ui

The Unbnd design system. The single source of truth for tokens, primitives, the icon registry, the motion layer, and layout primitives. Established by ADR 0038 and built across epic 0001 (stories 38–50).

UI work in `apps/web` goes through this package. The CI guards in `test/architecture-*.test.ts` make that mandatory, not advisory: a raw color, type, spacing, motion, `<button>`, or `<svg>` literal in app code fails CI.

## What ships from here

### Tokens

`styles/tokens.css` is a two-tier token system:

- **Raw tier** (`--u-raw-*`): literal values, no semantics.
- **Semantic tier** (`--u-*` / `--signal-*` / `--genre-*`): aliases the raw tier and never holds a literal.

App CSS references only the semantic tier. `apps/web` imports the sheet once via the package export:

```ts
import "@unbnd/ui/styles/tokens.css";
```

Amber `#C4763C` is the only accent. Green for positive signals, red for negative, purple for sovereign / Nostr identity.

### Primitives

`Button`, `IconButton`, `Link`, `Pill` (and `GenrePill`), `Avatar`, `Label`, `Field`, `Container`. Each exposes a typed prop contract; the internals (markup, classes, CSS) are swappable without changing callers.

### Icon registry

`<Icon name="…" />`, a typed map of our own hand-authored SVGs (no icon library). The `IconName` union is derived from the registry keys, so a typo is a type error.

### Breakpoints

`breakpoints`, the typed constant of the in-use `@media` pixel values (CSS custom properties cannot be used inside `@media`, so the canonical values live here for JS-driven responsive logic and for the breakpoint guard).

## Theming

Theming is `[data-theme]`-scoped: the default light skin is defined under `:root`; a skin overrides semantic or raw tokens under `[data-theme="<name>"]`. A redesign is a token-tier swap with no app-code churn. A dark skeleton exists in `styles/tokens.css` for structural validation; it is inert and not activated.

## Architecture guards

`test/architecture-*.test.ts`, run by the workspace `pnpm -r test`:

| Guard | What it locks |
|---|---|
| `architecture-token-refs.test.ts` | Every `var(--u-…)` resolves to a defined token |
| `architecture-color-literals.test.ts` | No raw color literals outside the token layer |
| `architecture-type-literals.test.ts` | No raw `font-size` / `font-weight` / `line-height` |
| `architecture-spacing-literals.test.ts` | No raw spacing outside the token layer and layout primitives |
| `architecture-shape-literals.test.ts` | No raw radius / box-shadow geometry / z-index |
| `architecture-motion-literals.test.ts` | No raw transition / animation durations or easings |
| `architecture-button-literals.test.ts` | No raw `<button>` in `apps/web/src` (use `Button` / `IconButton`) |
| `architecture-svg-literals.test.ts` | No raw `<svg>` in `apps/web/src` (use `Icon`) |
| `architecture-breakpoints.test.ts` | Every `@media` pixel is a canonical `breakpoints` member |
| `architecture-palette-sync.test.ts` | TS palette and CSS raws stay in sync |
| `architecture-page-frame.test.ts` | The page-frame tokens stay in `Container` |
| `architecture-theme-completeness.test.ts` | Every declared theme is complete and swaps via the raw tier |

## Package shape

Matches the `@unbnd/trust` precedent: `"private": true`, `"type": "module"`, raw `./src/index.ts` export, no build step, consumed by source through Vite's bundler resolution. `react` / `react-dom` are peer deps. Scripts: `test` (`vitest run`) and `typecheck` (`tsc --noEmit`).
