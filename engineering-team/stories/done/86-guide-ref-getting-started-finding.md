# Story 86: Reference: getting started + finding books

**Status:** Done
**Created:** 2026-06-12
**Type:** Content (the first reference batch; inventory sections 1–2)
**Source brief:** `product-team/stories-queue.md` Story 4 · **PRD:** §5.2 · **Law:** the tic taxonomy (CI-scanned) · **Architecture:** none new; governed by ADR 0081/0082 (the content pipeline + the heading construct).

## Background
Block 1 shipped the surface and the landing; the reference is empty. This batch publishes the first two sections, ~10 entries: Getting started (what Unbnd is at reference depth, creating an account, reading without an account, your first session) and Finding books (search, browsing by genre, the homepage shelves, Hidden Gems, For You, the book page tour). Every entry runs draft → taxonomy edit (recorded diff) → review. The landing's four first-session moves gain their links (this story's AC), and the contents region grows its first two sections automatically.

Two seams agreed at promotion:
- **The sign-in entry never says the protocol word**, even though one sign-in button shows it on screen (the brief's own AC). It describes the second option by what it does and points readers who want the full story at the marked note in "Your account is yours" (#91), where the word is allowed.
- **The book-page tour's sideways links into the trust entries land with #87** (their anchors don't exist yet; dead links are banned). #87's AC picks them up.

## Acceptance criteria
From the brief:
- [ ] Every section 1–2 inventory entry is published under its stable anchor, named by the on-screen words where a screen word exists, in the four-part anatomy.
- [ ] The sign-in-with-extension entry frames it only as "if you already have a portable account," with no protocol vocabulary.
- [ ] Each entry: recorded taxonomy-edit diff; reviewer re-ran the mechanical checks; scan clean.
- [ ] The landing contents and the four first-session moves now link these entries.
- [ ] (Structural, new) A content-integrity test guards the whole guide from here on: anchors unique, every related ref resolves to a published entry, every file under a known section.

## Out of scope
Sections 3–8 (#87–#91); the sideways trust links (#87); contextual links (#92).

## Linked artifacts
- ADR: none new (ADR 0081/0082 govern); the content-integrity test is recorded here.
- Test plan: folded into this story (the integrity test + the process evidence).
- Review: `engineering-team/reviews/86-guide-ref-getting-started-finding.md` (PASS)
