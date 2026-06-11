# Design Guide: Unbnd — The Reader's Guide

**Slug:** `reader-guide`
**Date:** 2026-06-11

> Structure, placement, and visual rules for the guide surface. Binding during engineering review. Honors `product-team/guardrails/design.md`. Builds entirely on the existing `@unbnd/ui` system: no new visual identity, no new tokens, no new hues. The reading experience should feel like the product slowed down, never like a wiki bolted on.
>
> The content model (the folded-in domain work) lives in §"Content model" below. The language rules live separately in the style guide (`guides/reader-guide-style-guide.md`, written at PRD assembly): this document governs where the words sit; that one governs the words.

## Design principles

1. **It reads like the product.** Same type scale, same parchment background, same ink, the existing measure conventions. A reader moving from a book page to a guide entry should feel a register change (calmer, longer-form), never a site change.
2. **Entry names are the on-screen words.** Every reference entry is titled by the exact label that confused the reader: "Unbnd house view," "Taste match," "Hidden gem," "Contested," "Removal queued." Findability by recognition, not by synonym guessing.
3. **Every entry is deep-linkable.** Stable anchors per entry, because Block 3 hangs contextual links off them and recruits get sent direct links. An anchor, once published, never changes.
4. **The narrative is short; the reference is complete.** The start-here path reads in minutes and never tries to be exhaustive. The reference is exhaustive and never tries to be read in order. The two link into each other; neither apologizes for the other.
5. **Walkthroughs are steps, not screenshots.** Numbered steps in words ("Open a book page. Under the rating, choose..."), resilient to visual drift. No screenshot maintenance burden; the staying-current rule covers prose, not pixels.
6. **Calm chrome.** No floating widgets, no progress gamification, no "was this helpful?" Voting. A table of contents, the text, and quiet next/previous links.

## Placement and navigation

- **The guide is its own route: `/guide`.** A section inside About would bury an artifact this size; a top-nav tab would overweight it for the returning majority. The route gets three quiet doors:
  1. **The footer**, site-wide: a "Guide" link beside About (the persistent door, Moment B).
  2. **The About page**: a prominent cross-link near the top ("New here? The guide walks through everything." → /guide) (Moment A).
  3. **The auth/welcome surfaces**: one quiet line for the newly arrived ("Want the tour first? Read the guide.") (Moments A and C).
- Recruits (Moment C) receive `/guide` as a direct link in the ask; the landing page is written to be that link.

## Structure: the narrative-to-reference seam

A small multi-page shape (one page would scroll past usefulness at ~35 entries):

- **`/guide` — the landing.** The start-here narrative: what Unbnd is (the one honest paragraph), your first session in four short moves, why the numbers here are different, and — clearly marked, skippable — "If you curate" (the Moment C extension: what your ratings carry, what vouching is, where the curator tools live). Ends with the table of contents into the reference.
- **`/guide/<section>` — eight section pages**, one per inventory section (scope §"Features extracted"): getting-started, finding-books, ratings-you-can-trust, rating-reviewing-tagging, sharing-and-your-profile, for-authors, for-curators, your-account-is-yours.
- **Entries** live on their section page under stable anchors: `/guide/ratings-you-can-trust#taste-match`. Each entry: the on-screen name as the heading, *what it is* (a paragraph), *what it is based on* (a paragraph, plain words), *how to use it* (numbered steps), and quiet "related" links.
- **In-page navigation:** each section page opens with its own small list of entries; the landing's table of contents lists sections with their entry names beneath. On wide viewports a quiet side rail mirrors the on-page list; on narrow viewports it collapses to the top list. No search.

## Voice (the experience half of discovery Q6)

Second person, plain and warm, throughout: "you rate a book," "your view." The landing narrative is allowed one short we-voice passage (why this exists) at the top; reference entries never use we-voice and are never signed. One register everywhere, per the journeys: the reader cannot tell where one entry's author ended and another began. The full language law is the style guide's tic taxonomy; this document only fixes person and register.

## Content model (domain, folded in at epic grain)

- **Section** (8): slug, title, ordered entries.
- **Entry** (~35): anchor slug (stable forever), on-screen name, *what it is*, *what it is based on*, *how to use it* (steps), related-entry links, the source stories it documents (kept as an authoring-side note, never rendered).
- **The inventory table** (authoring-side): every entry row carries its taxonomy-edit status, so the scope metric "zero gaps, recorded edit diff per entry" is checkable at close.
- Content is versioned with the product in the same repository and shipped by the same gated story process; the staying-current rule binds future stories to their entries.

## Component patterns

### The guide page frame
- **Visual:** the standard `Container` and page frame; a reading measure around 65–70 characters; the existing type scale with section headings one step up from body. Parchment background, no cards around body text (cards are for app modules; the guide is a document).
- **Behavior:** static content routes; anchors scroll with the standard offset; next/previous section links at the foot of each section page.
- **Empty / loading / error:** content ships with the bundle; there is no loading state and no empty state. A bad anchor lands at the section top, never an error page.

### The table of contents (landing + section rail)
- **Visual:** plain `Link` lists, ink text, amber only on hover/active per the existing link convention. Section titles semibold; entry names regular.
- **Behavior:** the side rail highlights the entry in view on section pages (quiet, no animation beyond the existing standards).

### Entry anatomy
- **Visual:** heading (the on-screen name), body paragraphs, a numbered step list using the standard list styles, a "Related" line of links. Inline references to UI elements are set in the product's words without invented styling: quotation marks around on-screen labels, no code formatting, no icon reproductions.
- **Behavior:** the anchor is the heading's id; copying the heading link is the recruit-shareable unit.

### The cross-link affordances (the three doors + Block 3)
- **Visual:** plain links in the product's existing link style. Block 3's in-app "What is this?" affordances reuse the quietest existing affordance (a small muted link or the existing info treatment, decided per surface at engineering) and always open the matching anchor.
- **Behavior:** never a modal, never a tooltip essay; confusion routes to the guide entry, one click, full context.

## Wireframes
`product-team/guides/reader-guide-wireframes.html` — the landing, a section page with the side rail, and an entry's anatomy.

## What this phase deliberately does not decide
- Implementation of the content pipeline (markdown in the repo, a build step, components): engineering's call within the constraint that content ships versioned with the product and is editable through the gated story process.
- The exact copy anywhere: drafted in stories, edited against the taxonomy.
