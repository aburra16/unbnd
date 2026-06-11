# The Reader's Guide — Product Requirements Document

**Slug:** `reader-guide`
**Date:** 2026-06-11
**Grain:** epic (one engineering book, three blocks). Companion artifacts: `discoveries/reader-guide.md`, `journeys/reader-guide-learning.md`, `scope/reader-guide.md`, `guides/reader-guide-design-guide.md` (+ wireframes), `guides/reader-guide-style-guide.md` (the tic taxonomy, binding).

## 1. Product Vision
Unbnd's trust layer has no mainstream analog, and today nothing in the product teaches it. The Reader's Guide is the product's own voice explaining itself: every user-facing feature, in plain human language, with a walkthrough, written for a book lover arriving from Goodreads who must never need a single protocol word. It replaces the founder-as-documentation bottleneck the curator recruitment is currently paying for, and it proves, in the medium itself, that this product sounds like people.

## 2. Positioning & Competitive Context
Per the discovery brief: not a help center (nothing here deflects tickets), not protocol documentation (no insider vocabulary), and emphatically not AI-sounding help content (the tic taxonomy is a deliverable precisely because the genre's tells now read as machine output and this product's pitch is human judgment).

## 3. User Personas
Reused from Phase 3 unchanged: the Trusting Reader (primary audience), the Founding Curator (the on-ramp case driving timing), the Sovereignty-Curious User (the deep-entry case). Seen here in their learning moments.

## 4. User Journeys
`journeys/reader-guide-learning.md` — the four entry moments: A "what is this place?", B "what does THIS mean?", C the recruit's on-ramp, D the sovereignty decision. The structure exists to serve all four: a short narrative for A and C, a complete findable reference for B, one deep entry for D.

## 5. Feature Specification

### 5.1 The guide surface (`/guide` + eight section routes)
- **Purpose:** one place that teaches the whole product.
- **Structure (binding, per the design guide):** the landing (`/guide`) carries the start-here narrative: the one honest paragraph, the first session in four short moves, why the numbers are different, and the clearly marked skippable "If you curate" extension, ending in the full table of contents. Eight section pages (`/guide/<section>`) hold the reference entries under **anchors that never change once published**. Entry headings are the on-screen names verbatim.
- **Entry anatomy (binding):** what it is; what it is based on; how to use it (numbered steps, second-person imperative); related links. Steps in words, no screenshots.
- **Presentation:** the existing design system, document register (no cards around body text), ~65ch measure, side-rail contents on wide viewports. No search, no feedback widgets, no progress chrome.
- **Doors:** a "Guide" footer link site-wide; a prominent About cross-link; one quiet line on the auth/welcome surfaces. The landing is written to be the link a recruit receives.

### 5.2 The content (eight sections, the full inventory)
The scope document's inventory is the contract: sections 1–8, roughly 35 entries, combed from the shipped record and reconciled at book close against the inventory table (zero gaps). Highlights of intent rather than a re-listing:
- **"Ratings you can trust"** is the heart: the view switch, trusted versus community, taste match, the hype gap, followers. These entries justify the guide's existence.
- **"For curators"** is the recruit extension's reference depth: what a curator is, the three paths to becoming one, vouching, submitting, promotion (including automatic), removal, content flags including the pending-flag view and reveal/withdraw.
- **"Your account is yours"** carries the sovereignty deep entry (the calm, complete explanation behind the Settings card) and the single marked entry where the wider-network connection may be named.
- Each entry records its source stories as an authoring note, never rendered.

### 5.3 The language law
Every reader-facing sentence in the guide is governed by `guides/reader-guide-style-guide.md`: drafted, then **taxonomy-edited in a separate pass with a recorded diff**, then reviewed with the reviewer independently running the mechanical checks. The protocol-vocabulary wall (taxonomy §E) holds everywhere except the one marked entry. From ratification, the taxonomy governs all new user-facing prose product-wide; interface microcopy keeps the social-loop UI-copy patterns. The taxonomy is extensible under its own binding rules (style guide §"Extending the taxonomy"): append-only ids, the data-driven mechanical list as the machine seam, and extensions that flow through with the next content update rather than forcing sweeps.

### 5.4 The staying-current rule
A definition-of-done addition to the engineering process: any story that adds or changes a user-facing surface updates the matching guide entry (or adds one) within the same story, through the same draft-then-edit process. The guide's inventory table is the auditable record.

### 5.5 Contextual entry points (Block 3)
The highest-confusion surfaces link to their entries: the House/Yours switch, taste-match chips, the hype-gap line, vouch counts, contested tags, reviewed-flag rows, "Removal queued." The quietest existing affordance per surface; always a one-click route to the anchor, never a tooltip essay or modal.

## 6. Data Model
Content, not events: Section (8) → Entry (anchor slug stable forever; name = on-screen label; the four anatomy parts; related links; authoring-side source-story note). Content ships versioned with the product and changes only through gated stories. Nothing here touches the DList domain model.

## 7. Architecture Notes (constraint, not design)
Engineering owns the content pipeline (likely markdown in the repo rendered by the site; their call) within three constraints: content is versioned with the product; anchors are stable; the mechanical taxonomy checks are runnable against the content (a plain text scan suffices; CI enforcement is engineering's option and recommended).

## 8. Scope Boundaries

### 8.1 In Scope (must ship)
Blocks 1–2: the taxonomy ratified; the surface with landing + eight sections; the full inventory drafted, edited, reviewed; the three doors; the staying-current rule landed. Block 3: the contextual entry points.

### 8.2 Stretch
None. An epic stays an epic.

### 8.3 Out of Scope (each with a home)
Guide search (revisit only if the guide outgrows its contents page); support/FAQ content (a separate story when real tickets exist); interactive tours (a future phase, only if recruitment shows written isn't enough); localization (far future); the retroactive taxonomy sweep of existing app copy (a follow-up story after the guide proves the taxonomy).

## 9. Phase Roadmap (blocks)
- **Block 1 — foundation:** the taxonomy as a repo artifact + the mechanical check; the guide surface (routes, landing, section frame, doors); the start-here narrative including the curator extension.
- **Block 2 — the reference:** the ~35 entries in grouped batches (finding-books + rating basics; the trust section; sharing/authors; curators; sovereignty), each batch drafted → taxonomy-edited → reviewed; the staying-current rule lands with the final batch.
- **Block 3 — meeting confusion:** the contextual entry points.

## 10. Success Metrics
- Zero inventory gaps at book close; every entry's taxonomy-edit pass has a recorded diff.
- The mechanical scan over published guide content returns zero hits (em dashes, exclamation marks, the C-lexicons, the E-wall words outside the marked entry).
- A recruit receives `/guide` instead of a live walkthrough: observable in the recruitment effort immediately at Block 1+2 close.
- After Block 3: each listed confusion surface reaches its entry in one click.

## 11. Open Questions
None carried. The four discovery questions resolved: placement = `/guide` with three doors (design); structure = landing + eight section pages with stable anchors (design); taxonomy standing = ratified for all new prose, retroactive sweep deferred (scope); staying-current = the definition-of-done rule plus the close audit (this document, §5.4); voice = second person, one we-voice passage on the landing only (design).
