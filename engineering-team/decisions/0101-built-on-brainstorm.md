# ADR 0101: "Built on Brainstorm" is Brainstorm's copied element, bounded and fitted with Unbnd's tokens

**Status:** Accepted
**Date:** 2026-10-31
**Story:** `engineering-team/stories/113-built-on-brainstorm.md`

## Context
Brainstorm gives the apps built on it one credit line, the custom element `<built-on-brainstorm>`, in one file each app copies (Brainstorm-UI `client/public/built-on/built-on-brainstorm.js`, version 1; contract `docs/built-on-brainstorm.md`, both on `staging`). The element:

- draws a link to `https://brainstorm.world` (new tab, `noopener noreferrer`, labelled "Built on Brainstorm (opens in a new tab)"), Brainstorm's mark and the words, in an open shadow root;
- loads `https://brainstorm.world/built-on/v1.css` inside that root, so a restyle there reaches every app, and carries its launch look in a cascade layer that `v1.css` always wins over, for when the sheet cannot load;
- reads three properties, `--built-on-color`, `--built-on-hover-color` and `--built-on-focus-color`, and inherits its font and size.

Constraints on Unbnd's side:

- Pages compose their chrome through two shells: `PageShell` (ADR 0086) and `AuthShell`. The footer bar is a bespoke, token-backed surface (REDESIGN.md §7) whose inner rows are `Container frame="chrome"`.
- Colours, type, spacing, radii and motion come from `@unbnd/ui` tokens, enforced by the `architecture-*` guards, which scan `.css`, `.ts` and `.tsx`.
- `apps/web` is on React 18, which sets `className` on a custom element as an attribute named `className`. The element would get no class, and the hooks set through it would be lost.
- The visual harness (ADR 0039) compares every captured screen at zero pixel difference, and its content is fixed in the test layer; no request may reach a real network.
- Unbnd sends no Content Security Policy (neither `index.html` nor `deploy/Caddyfile` sets one).
- The shared sheet runs no code and reads nothing of the page, but the contract notes it can draw anywhere: it could lay the line over the whole app, still a link to brainstorm.world, with words of its own.

## Options considered

### Option A: hand-draw the line in React
Unbnd's own markup and CSS, matching the look. Every restyle would mean a change here, and the line would drift from the other apps. Rejected by the contract itself: the line is one shared item.

### Option B: load the element from brainstorm.world at run time
No copy to keep. But a remote script runs with the page's full access, on a page that holds a signer (NIP-07) and a session. Rejected.

### Option C: copy the element, fit it with the hooks, bound it
The file is copied byte for byte and pinned by its hash; a wrapper component gives it Unbnd's tokens through the hooks and sits it in a frame with `contain: paint`. Restyles still arrive through `v1.css`, inside a box that cannot spill.

## Decision
**Option C.**

1. **The copy.** `apps/web/src/components/built-on-brainstorm.js` is Brainstorm-UI's version 1 file as it is (`staging` at `9cedf9c0`, SHA-256 `c769ec4498b2beb0a1c942d58a2cdf22607fe68a84f2b0a4e38127edc0952f97`). A test pins the hash, so an edit or a formatter pass fails CI. A newer copy means a new pin, in a PR that says why.
2. **One wrapper, the one place it loads.** `BuiltOnBrainstorm.tsx` imports the file once (a side-effect import; the element also refuses to define itself twice) and is the only way the app draws the line. It declares the element in `JSX.IntrinsicElements` with `class`, and gives it `class`, never `className`.
3. **Fitted with tokens, through the hooks only.** `BuiltOnBrainstorm.css` sets `--built-on-color: var(--u-muted)`, `--built-on-hover-color: var(--u-ink)`, `--built-on-focus-color: var(--u-amber)` (Unbnd's focus ring, as on its buttons) and `font-size: var(--u-font-size-11)` (the footer's links). No `::part()` rule: that would cut Unbnd off from every restyle after.
4. **Bounded.** The element sits in a `span.built-on` with `contain: paint` and `padding: var(--u-space-4)`, the focus ring's reach (a 2px outline 2px out), so the ring shows and nothing the shared sheet draws leaves the frame. A margin of `var(--u-space-n4)`, a new negative step in the ADR 0042 §3 pattern, keeps the line on the row's edge.
5. **Where it sits.** In the footer, a second chrome row (`.footer-credit`) under the footer's row, at the row's start, under Unbnd's own mark. On the sign-in pages, centred under the card. `PageShell` and `AuthShell` each draw it once; a guard holds every route to one of the two shells.
6. **No policy to change.** A guard reads `apps/web/index.html` and `deploy/Caddyfile`: if either ever sets a Content Security Policy, its `style-src` (or `default-src`, when there is no `style-src`) must allow `https://brainstorm.world`. The element needs no script source.
7. **The visual harness refuses brainstorm.world.** `mockApi` aborts every request to it, so the line draws in the element's launch look, which is part of the pinned copy, whatever `v1.css` holds. A restyle upstream cannot fail Unbnd's CI, and no capture reaches the network.

## Consequences
- The line appears on every page, and restyles reach Unbnd within the hour after Brainstorm deploys them, with no change here.
- Until production brainstorm.world serves `/built-on/`, each page logs one failed request for `v1.css` (no CORS header) and the line keeps its own look, which is the same.
- The copy carries Brainstorm's own CSS literals inside a JavaScript string. The guards scan `.css`, `.ts` and `.tsx`, so it is outside them by extension; a guard widened to `.js` must leave this file out, as third-party code copied as it is.
- The frame bounds what the shared sheet can paint, not how big it can make the frame: a bad `v1.css` could still make the footer as tall as it likes. That would show at once, and a fixed size would break a legitimate restyle, so it is left unbounded.
- `v1.css` is loaded from another origin on every page view, with `referrerpolicy="no-referrer"` and `crossorigin="anonymous"`: brainstorm.world learns an IP address and nothing of the page.
- Every captured screen changes (the footer, or the foot of the sign-in page): all seven baselines regenerate in the pinned image, in a commit of their own.
- **Affects existing fixtures?** No. **New dependency?** No (a copied file). **PRD section change required?** No.

## Implementation notes
- `apps/web/src/components/built-on-brainstorm.js`: the copy.
- `apps/web/src/components/BuiltOnBrainstorm.tsx` / `.css`: the wrapper, `BuiltOnBrainstorm({ className })`.
- `apps/web/src/components/Footer.tsx` / `.css`: a `Container frame="chrome" className="footer-credit"` row after `.footer-row`. The `max-width: 480px` rule targets `.footer-row` (it targeted `.footer`, which has had no flex layout since ADR 0086).
- `apps/web/src/components/AuthShell.tsx` / `.css`: the line after `.auth-card`.
- `apps/web/e2e/visual/fixtures/index.ts`: `mockApi` aborts `https://brainstorm.world/**`.
- `apps/web/vitest.config.ts`: happy-dom fetches a stylesheet link it is given, so every web test file now runs with `disableCSSFileLoading` and `handleDisabledFileLoadingAsSuccess`: the sheet is skipped, quietly, and no test reaches the network. No other test uses a stylesheet link.
- `packages/ui/styles/tokens.css`: `--u-raw-space-n4` / `--u-space-n4`.
- `packages/ui/REDESIGN.md` §7: the line as a surface Unbnd fits but does not style.

## Out of scope
- A Content Security Policy for Unbnd.
- A later version of the element (`v2`): a new copy and a new pin when Brainstorm cuts one.
