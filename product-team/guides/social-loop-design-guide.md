# Design Guide: Unbnd — Close the Social Loop

**Slug:** `social-loop`
**Date:** 2026-06-06

> Visual rules, design tokens, and component patterns for the Phase 3 modules. Binding during engineering review. Honors `product-team/guardrails/design.md`. Wireframes: `product-team/guides/social-loop-wireframes.html`.
>
> **Foundation.** This phase adds no new visual identity. It is built entirely on the existing `@unbnd/ui` system shipped in Phase 2 (the two-tier token system, the primitives Button / IconButton / Link / Pill / Avatar / Label / Field / Container, the `Icon` registry, and the `[data-theme]` substrate). Every new module composes those primitives and references existing tokens. The capstone reference for how to do that is `packages/ui/REDESIGN.md`.

## Design principles

1. **Build on `@unbnd/ui`, add nothing global.** New modules compose existing primitives and reference existing tokens. No bespoke buttons, no inline SVG outside the `Icon` registry, no raw hex or pixel values. A new semantic alias is allowed only when a genuinely new signal needs one, and it points at an existing raw token.
2. **Honest on a thin graph.** No trust-derived number renders unless a handful of trusted raters stand behind it. Every such module has a designed "not enough yet" state that says what will appear and how to help fill it. Emptiness is an on-ramp, never a dead end. This is the direct answer to the cold-start risk.
3. **Observer-relative signals are labeled.** Taste match and the hype-gap always state whose viewpoint they reflect. The House/Yours toggle governs the trusted side. Raw versus trusted is always labeled, carrying forward Phase 2's community-vs-trusted convention.
4. **Sovereignty is handled with calm gravity.** Plain language, deliberate confirmation, never alarmist and never casual. It uses the existing `--signal-sovereign` purple, not the amber accent, to mark it as a distinct and weighty action rather than a routine one.
5. **Trust is human, never a raw number.** Percentile tier strings and plain percentages with visible provenance ("3 curators you trust"), never a raw GrapeRank score.
6. **Value before account.** A reader arriving on a shared link sees the curator's take and the trust context fully, with no account. The account gate sits at the write action (rate, save, vouch), not at the read.
7. **Every state is designed.** Empty, loading, and error states are first-class for every new module. No bare spinners, no "something went wrong."

## Visual identity (inherited)

- **Color palette:** accent amber `#C4763C` (hover `#B06A35`) for all interactive elements. Semantic signals: positive green `#1D9E75`, negative red `#DC3545`, sovereign purple `#7845FF`. Per-genre hues from the existing genre ramp. Background parchment `#FAF6F0` / warm `#FFFBF6`; card surface white; ink text `#1A1A2E`.
- **Typography:** `--font-sans` for everything, `--font-mono` for keys and identity strings (npub). The existing type scale; no new sizes.
- **Spacing / elevation / radius:** the existing scales. No new values.

## Design tokens

New modules reference existing tokens. The only additions are thin semantic aliases that point at existing raws, so the dark theme and any future re-skin pick them up for free:

```css
:root {
  /* hype-gap reuses the existing signal hues; aliased for intent */
  --signal-hidden-gem: var(--signal-positive);   /* green: trusted > crowd */
  --signal-overhyped:  var(--signal-negative);   /* red: crowd > trusted */
  /* sovereignty uses the existing token as-is */
  --signal-sovereign:  var(--signal-sovereign);  /* purple, already defined */
  /* contested + taste-match are treatments, not new colors:
     contested = muted ink + strikethrough; taste-match = neutral surface + ink */
}
```

No new color values are introduced. Contested tags and taste-match chips are treatments over existing neutrals, not new hues, which keeps the one-accent rule intact.

## Component patterns

### Taste Match chip
- **Visual:** a small neutral Pill, ink text, the percentage semibold: "87% match · 24 books in common." Not amber, because it is informational, not interactive. Sits in the curator profile header and on rater/reviewer bylines on book detail.
- **Behavior:** observer-relative; computed from the signed-in viewer's side. Hidden entirely when signed out.
- **Empty / loading / error:** below the overlap threshold it reads "Not enough overlap yet · rate more books you've both read" rather than a hollow number. Loading is a skeleton pill. On compute error it simply does not render (a missing affinity chip is not an error worth shouting).

### Review and rater ordering
- **Visual:** the book-detail "Rated by" and reviews lists gain a small text toggle, "Sort: Most trusted · Best taste match," using the Link primitive.
- **Behavior:** signed-in viewers can order by taste match alongside the existing trust order. Default stays trust. Signed-out viewers see trust order only, no toggle.
- **Empty / loading / error:** inherits the existing ratings empty state.

### Hype-Gap indicator
- **Visual:** one line near the rating on book detail. Hidden Gem shows a green dot and "Hidden gem · your network rates this above the crowd." Overhyped shows a red dot and "Overhyped · people you trust are cooler on this than the crowd." Consensus shows nothing.
- **Behavior:** observer-relative; differs between House and Yours. Renders only when a trusted average exists (a handful of trusted raters).
- **Empty / loading / error:** below the trusted-rater threshold there is honest silence, no placeholder. Loading is a one-line skeleton.

### Hidden Gems shelf
- **Visual:** a homepage shelf row of existing BookCards. Titled "Hidden gems for you" on Yours, "Hidden gems in your house" on House.
- **Behavior:** surfaces books with the highest positive hype-gap from the active viewpoint. Exists on both views; different gems surface under each.
- **Empty / loading / error:** the on-ramp empty state: "As people you trust rate more books, the ones they love that the crowd missed show up here. Follow a few curators to start." Loading is BookCard skeletons.

### Curator vouch control
- **Visual:** on a profile, for eligible trusted viewers, an amber Button "Vouch as curator" (interactive, so amber). A count line nearby: "3 trusted people vouched." A "Curator" tier badge appears once the gate is met.
- **Behavior:** vouching records a curator-role assertion. Already vouched flips the button to "Vouched · withdraw." Viewers not eligible to vouch see no control at all, rather than a disabled tease.
- **Empty / loading / error:** before any vouches, no count line. Pending shows a loading button state. On failure: "Couldn't record your vouch. Try again."

### Curator badge and Curate surface
- **Visual:** a "Curator" badge (the existing Label/Pill treatment, not a new icon) on qualifying profiles. A "Curate" nav entry, prominent for curators and absent for everyone else.
- **Behavior:** surfaces the existing submissions and promotion tools to curators. Status derives from the curator gate (seed allowlist or vouch count-gate).

### Sovereignty upgrade flow
- **Visual:** entry lives in Settings → Nostr identity (the home Story 29 established). A card marked with `--signal-sovereign` purple: "Take ownership of your account." The flow is a deliberate, multi-step sequence, not a single button.
- **Behavior:** step 1 explains in plain language ("Right now we hold your key so signing in is easy. You can take your key and use this identity in any nostr app, or keep it as a backup. Once you have it, keeping it safe is up to you."). Step 2 a single explicit confirmation. Step 3 reveals the key once, with a copy action and an acknowledgement before it can be dismissed. Step 4 a calm done state ("You own your key. Your account still works here as normal."). Never forced, always dismissible.
- **Empty / loading / error:** if a key was already exported, the card reflects that rather than offering it again. Copy failure says "Couldn't copy. Select and copy it manually." The reveal never reappears after dismissal.

### Contested tag chip
- **Visual:** a tag the trusted graph net-disputes renders muted with a strikethrough and a small "contested" label, distinct from a normal chip. Muted ink, no new color.
- **Behavior:** reuses the existing `trustedApplies` / `trustedDisputes` counts. Surfaced in the trusted view to make the dispute side of trust-weighting legible.

### Followers count
- **Visual:** a profile stat, "N followers," beside the existing following count.
- **Behavior:** derived via NIP-85.
- **Empty:** "No followers yet."

### Shared-link landing and the unfurl card
- **Visual:** a reader arriving on a book via an external link sees the full book page, the curator's take, and the trust context, with no account. A single prompt appears at the write action: "Create a free account to rate or save this." The unfurl card rendered on other platforms shows cover, title, author, the raw community rating, and top tags.
- **Behavior:** the card uses the **raw** community rating, not the observer-weighted one, because a shared card is viewer-independent and a per-viewer number would mislead out of context. The in-app page still shows the observer-weighted view. (Resolves discovery open question 3.)

## Screen inventory

| Screen | Phase 3 additions | Block | Wireframe |
|---|---|---|---|
| Public / curator profile `/profile/:npub` | taste-match chip, vouch control, curator badge, real followers count | 1 (vouch, taste), 2 (followers) | `social-loop-wireframes.html#profile` |
| Book detail `/book/:slug` | taste-match on bylines, review/rater sort, hype-gap indicator, contested tags | 1 (taste, sort), 2 (hype gap, contested) | `social-loop-wireframes.html#book` |
| Homepage `/` | Hidden Gems shelf | 2 | `social-loop-wireframes.html#home` |
| Settings → Nostr identity `/settings` | sovereignty upgrade flow | 2 | `social-loop-wireframes.html#sovereignty` |
| Shared-link landing (book via external link) | value-before-account, unfurl card | 2 | `social-loop-wireframes.html#shared` |
| Browse `/browse` | expanded genre grid (8→14+) | 2 | (existing grid, more tiles) |

Block 1 modules (taste match, vouching, honest empty states) are specified to build-ready depth, since they are the first demoable block. Block 2 and 3 modules are specified at pattern depth for continuity.

## Responsive behavior

- **Mobile (< 640px):** the taste-match chip wraps under the profile name. The hype-gap line sits under the rating. The Hidden Gems shelf becomes a horizontal scroller. The sovereignty flow is full-screen step pages rather than a card. Touch targets at least 44px.
- **Tablet (640–1024px):** profile and book detail keep their two-column shape; shelves show fewer cards per row.
- **Desktop (> 1024px):** the established layouts, unchanged.

## Accessibility baseline

- Contrast meets WCAG AA. The amber accent on parchment and white is already AA for interactive text and controls; the green and red signals are paired with text labels, never color alone (so the hype-gap and contested states are legible without color perception).
- Touch targets at least 44px; the vouch button and sort toggle included.
- Full keyboard navigation: the sovereignty flow is keyboard-completable, the copy action focusable, and the acknowledgement reachable without a pointer.
- The reveal-once key is announced to screen readers with its sensitivity ("This is your private key. Save it now; it will not be shown again.").
