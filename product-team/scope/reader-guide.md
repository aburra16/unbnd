# Scope: The Reader's Guide

**Slug:** reader-guide
**Date:** 2026-06-11
**Manager phase:** Scope & Prioritization (Phase 3)
**Grain:** epic — "phases" below are ordered story blocks inside one book, not product phases.

## Features extracted

### The guide's content inventory
What "comprehensive" enumerates to. Combed from the shipped record (82 stories in `engineering-team/stories/done/`, reconciled against the phase-2 and social-loop audits), grouped the way a reader thinks, named by the words on screen. Every entry gets: what it is, what it is based on, and a short how-to walkthrough.

**1. Getting started**
- What Unbnd is (the one honest paragraph: people you trust, instead of a crowd average)
- Creating an account with an email; signing in with a nostr extension, framed only as "if you already have a portable account, you can use it" with no protocol vocabulary
- Reading without an account: everything you can see signed out, and the one prompt you meet at a write action
- Your first session: rate a few books, save to a shelf, follow someone

**2. Finding books**
- Search
- Browsing by genre (the 16 genres)
- The homepage shelves: what each one is, and that they change with your view
- Hidden Gems: what makes a book a hidden gem here
- For You: where those recommendations come from, and why rating more books improves them
- The book page, top to bottom: cover, details, ratings, reviews, tags, shelves, where to read

**3. Ratings you can trust (the heart of the guide)**
- The view switch (Unbnd house view / your view): what each view means, why the numbers change when you switch
- "Trusted ratings" versus "community consensus": who counts in each, in plain words
- Taste match: what the percentage means, when it shows "not enough overlap yet," where it appears (profiles, review bylines)
- Sorting reviews by most trusted or best taste match
- The hype gap: Hidden gem, Overhyped, and why a book might show neither
- Followers and following: following someone, and how the followers number is counted

**4. Rating, reviewing, and tagging**
- Rating a book; writing a review; updating your rating; removing your rating (and that rating again brings it back)
- Suggesting a genre or style tag; disputing one; what the little numbers on tags mean
- The "contested" treatment: what a struck-through tag is telling you
- Reviewed content flags: what a flag like "AI generated" means, who reviewed it, why it is shown apart from normal tags
- Shelves: saving books, making your own shelves, what others see

**5. Sharing and your public presence**
- Sharing a book or profile link, and what the card looks like on other platforms
- Your public profile: what is visible to others, your stats, your shelves

**6. For authors**
- Claiming a book you wrote; what the claimed badge means
- Becoming a verified author (vouched by trusted curators), and what verification unlocks: providing your own blurb, cover, and where-to-buy link ("From the author")

**7. For curators**
- What a curator is here, and the three ways someone becomes one (invited at the start, vouched by trusted people, or recognized by their standing)
- Vouching for someone, and what your vouch does
- Submitting a book the catalog is missing; what happens after you submit
- How a submission gets into the catalog: a curator promotes it, or enough trusted ratings promote it automatically
- Taking a wrongly added book back out of the catalog
- Content flags: applying one, seeing one that is pending, revealing or withdrawing one (curators only)
- The Curate page

**8. Your account is yours**
- What "your words are yours" means in practice: your ratings, reviews, and shelves are published under your own name, and the product cannot quietly rewrite them
- Taking ownership of your account: the full calm explanation behind the Settings card. What you have now, what changes, what stays the same, what you become responsible for
- For readers who arrived from the wider nostr world: the short version of how Unbnd fits, kept in one clearly marked entry so nobody else ever needs it

### The epic's other deliverables
- **The tic taxonomy** (a guide artifact): the comprehensive LLM-tell catalog and the editing rules. Bans include: em dashes; rhetorical contrast ("not x; it's y"); declarative negative lists ("not x, not y, not z"); anaphora; minimal triadic structures; hedged openers; purple prose; the existing ban list absorbed. With positive guidance, since a ban list alone produces stilted text: short declarative sentences, concrete verbs, the reader addressed plainly.
- **The drafting process**: every entry is drafted, then edited against the taxonomy as a separate pass, then reviewed. The edit pass is a required step with its own record, never folded into drafting.
- **The site surface**: the guide presented cleanly on the site, reachable from About and from the footer; structure per the experience phase (one narrative start-here path plus the per-feature reference; entry names matching on-screen labels).

## MVP boundary

### In scope (must ship — Block 1 and 2)
- [ ] The tic taxonomy artifact, ratified as the editing gate for all guide text
- [ ] The guide surface on the site, with the start-here narrative and the full per-feature reference (inventory sections 1–8)
- [ ] The curator extension written as part of the same narrative (Moment C = Moment A plus the marked curator section)
- [ ] The sovereignty deep entry (Moment D)
- [ ] Every entry drafted, taxonomy-edited, and reviewed; zero protocol vocabulary in reader-facing text
- [ ] The staying-current rule: a definition-of-done addition so any future story that changes a user-facing surface updates its guide entry in the same story

### In scope (Block 3, after the guide exists)
- [ ] Contextual entry points: small "what is this?" affordances on the highest-confusion surfaces (the view switch, taste-match chips, the hype-gap line, vouch counts, contested tags, the reviewed-flag rows, "Removal queued") linking to the matching guide entry

### Out of scope (deferred, each with a home)
- Guide search → revisit if the guide outgrows a table of contents (post-epic; it should not at this size)
- Support/FAQ content (password reset, account recovery, contact) → a separate small support story when real users generate real tickets
- Interactive product tours and onboarding overlays → a future phase if recruitment shows the written guide is not enough
- Localization → far future
- Applying the taxonomy retroactively to all existing in-app copy → a follow-up sweep story after the taxonomy is ratified (the guide proves the taxonomy first)

## Phase roadmap (blocks within the epic)
- **Block 1 — the foundation:** the tic taxonomy; the guide's site surface and structure; the start-here narrative.
- **Block 2 — the reference:** the per-feature entries for inventory sections 2–8, drafted and taxonomy-edited in grouped batches; the staying-current rule lands with the last batch.
- **Block 3 — meeting confusion where it happens:** the contextual entry points.

## Success metrics
- Every feature in the inventory above has a published, taxonomy-edited entry; the inventory table in the guide book shows zero gaps at close.
- A founding-curator recruit can be sent one link instead of given a live walkthrough; the founder stops being the documentation (observable directly in the recruitment effort already underway).
- The taxonomy edit pass produces a recorded diff on every entry (proof the two-pass process ran, not a rubber stamp).
- Zero protocol vocabulary in the published guide (relay, event, key signing, nostr outside the one marked entry in section 8) — checkable by a plain text search.
- After Block 3: every listed confusion surface reaches its guide entry in one click.

## Tradeoffs
- **Standalone guide before contextual links.** The guide must exist before surfaces can link into it, and a standalone Block 1+2 ships value to the recruitment effort weeks earlier. The cost: until Block 3, a confused reader must find the guide themselves.
- **No guide search.** A table of contents with on-screen-matching names covers Moment B at this size; search is complexity the content volume does not yet justify.
- **No support content.** The guide teaches the product; it does not answer tickets. Mixing the two would bury the concept-teaching under password-reset noise, which is the structural Goodreads-help-center failure the discovery named.
- **Taxonomy proves itself on the guide first.** Ratifying it for all future copy immediately, but sweeping existing app copy retroactively is deferred, so the epic stays an epic.

## Open decisions carried to the experience phase
1. Exact placement and naming: a "Guide" tab beside About, a section within About, or its own top-level page (the journeys argue for first-visit discoverability; the designer decides the nav weight).
2. The narrative-to-reference seam: one page with anchors, or a small multi-page structure.
3. Voice: the discovery's question 6 (founder-warm versus neutral product voice) lands with the style work in the experience and PRD phases.
