# Story 113: Built on Brainstorm at the foot of every page

**Status:** Approved
**Created:** 2026-10-31
**Type:** Feature

## Background
Unbnd is built on Brainstorm and Tapestry. Brainstorm gives the apps built on it one shared credit line, "Built on Brainstorm": Brainstorm's mark and the words, the whole of it one link to brainstorm.world. It is a framework-free custom element, `<built-on-brainstorm>`, that each app copies once from Brainstorm-UI (`client/public/built-on/built-on-brainstorm.js` on `staging`). The element draws itself in an open shadow root and takes its look from `https://brainstorm.world/built-on/v1.css`, loaded inside that root, so a restyle there reaches every app with no change in any of them. When that stylesheet cannot load, the element keeps the look it launched with. Its contract is Brainstorm-UI's `docs/built-on-brainstorm.md`.

Unbnd's pages have two shells: `PageShell` (nav bar, reading column, footer bar; ADR 0086) for every standard page, and `AuthShell` for the four sign-in pages, which have no footer.

Found while checking the foot on a phone: the footer's `max-width: 480px` rule still targets `.footer`, which has had no flex layout since ADR 0086 moved it to `.footer-row`. On a 375px phone the row runs to 418px, the page scrolls sideways and "Sign in" sits off screen. The line goes in this footer, so it is fixed here, in its own commit.

## User-facing description
As a reader, at the foot of every page I see that Unbnd is built on Brainstorm, and can follow the line to Brainstorm's site.

## Acceptance criteria
1. **Every page.** The standard pages carry the line in their footer bar, on a row of its own under the footer's row; the sign-in pages carry it under the card. One line per page. Every route composes `PageShell` or `AuthShell`, held by a guard so a new route cannot ship without the line.
2. **Brainstorm's element, as Brainstorm gives it.** `built-on-brainstorm.js` is a byte-for-byte copy of Brainstorm-UI's version 1 file, pinned by its SHA-256, and loaded once. The link (brainstorm.world, a new tab, `noopener noreferrer`), the words, the accessible name "Built on Brainstorm (opens in a new tab)" and the mark are the element's own, checked through its shadow root.
3. **Fitted with Unbnd's tokens.** At rest the footer's muted colour, the ink when pointed at or focused, Unbnd's amber focus ring, the footer's 11px type. The app sets these through the element's three properties and its font size, and never restyles its parts. React 18 sets `className` on a custom element as an attribute of that name, so the element gets `class`.
4. **Bounded.** The line sits in a frame of its own with `contain: paint` and padding equal to the focus ring's reach, so whatever the shared stylesheet draws stays inside that frame.
5. **Content Security Policy.** Unbnd sends none today, so nothing changes. A guard fails if a policy is added to the app's page or its Caddy site that does not let `https://brainstorm.world` in as a style source.
6. **Visual baselines stay deterministic.** The visual harness refuses every request to brainstorm.world, so the line draws in the element's own look whatever the shared stylesheet holds. The seven baselines are regenerated in the pinned image, in a commit of their own.
7. **The foot holds on a phone.** At 480px and below, the footer's row stacks (the rule targets `.footer-row` again), with no sideways scroll, and the line is in view.
8. **Checked in a browser** on Unbnd's light ground, on the dark skin (`data-theme="dark"`, inert in the product, the only dark ground the foot has), and on a 375px phone. Until production brainstorm.world serves `/built-on/`, the console shows one failed request for `v1.css` and the line keeps its own look. That is expected.

## DList shapes touched
None.

## Out of scope
- A Content Security Policy for Unbnd as a whole.
- Any restyle of the line. That is a change to Brainstorm-UI's `v1.css`.
- Mentioning Brainstorm anywhere else in the product or the guide.

## Open questions
None.

## Linked artifacts
- ADR: `engineering-team/decisions/0101-built-on-brainstorm.md`
- Test plan: `engineering-team/stories/113-built-on-brainstorm.test-plan.md`
- Review: `engineering-team/reviews/113-built-on-brainstorm.md`
