# Stories Queue: Unbnd — The Reader's Guide

**Slug:** `reader-guide`
**Date:** 2026-06-11
**Source PRD:** `product-team/prd/reader-guide.md` (+ `guides/reader-guide-design-guide.md`, `guides/reader-guide-wireframes.html`, `guides/reader-guide-style-guide.md` — the tic taxonomy, binding on every reader-facing sentence)
**Supersedes:** the consumed social-loop queue (all 18 briefs promoted and shipped; see `engineering-team/audits/social-loop/`; the prior queue text lives in git history).

> 10 stories across 3 ordered blocks, in dependency order. Blocks are a suggested grouping and sequence, not folders; the engineering tree stays flat. The engineering Product Owner promotes each brief via `/plan-feature` (next available number scanning `stories/` + `stories/done/`), referencing the PRD and guides. The queue order is the pickup order.
>
> **The process rule that governs every content story (3–9):** each entry is drafted, then taxonomy-edited in a separate pass with a recorded diff (its own commit), then reviewed with the reviewer independently running the mechanical checks. An entry whose edit pass produced zero changes gets read with extra suspicion, not waved through.

---

## Block 1 — Foundation

*The taxonomy becomes enforceable, the surface exists, and the landing narrative ships behind live doors. Demoable at every step; nothing half-empty is ever discoverable.*

## Story 1: The tic taxonomy lands with its mechanical check
**PRD section(s):** §5.3, §7 · **Persona(s):** (platform; every reader downstream) · **Block:** Foundation

**Description:** The tic taxonomy is ratified as the repo's binding language law, with a data-driven mechanical scan over guide content wired into CI.

**Acceptance criteria:**
- [ ] The taxonomy is established in the repository as the single source of truth for prose rules, superseding the prior ban lists for prose as its own header states.
- [ ] A mechanical scan runs over the guide's content and reports every [M]-rule hit with its location and tic id.
- [ ] The scan is data-driven: adding a word or pattern to the mechanical list makes the scan catch it with no change to scan logic (provable by a test that extends the list).
- [ ] CI fails when published guide content has a hit; the protocol-wall exception for the one marked entry is expressible without weakening the wall elsewhere.
- [ ] The scan runs clean on the (initially empty) content set, establishing the zero-hit baseline.

**Dependencies:** none.

**Notes for engineering:** The extension contract in the style guide ("Extending the taxonomy") is binding: append-only tic ids, and extensions must never require touching check logic. Where the machine-readable list lives (parsed from the style guide, or a sibling data file generated from it) is the Architect's call; drift between the document and the list is the failure mode to design against.

## Story 2: The guide surface
**PRD section(s):** §5.1, §6, §7 · **Persona(s):** all three · **Block:** Foundation

**Description:** The `/guide` landing and eight section routes exist with the document-register frame, stable anchors, and section navigation, reachable by URL but not yet linked from the product.

**Acceptance criteria:**
- [ ] `/guide` and the eight section routes render in the product's design system in the document register: reading measure, no cards around body text, the existing type scale.
- [ ] Entries render with the four-part anatomy (what it is; what it is based on; numbered how-to steps; related links) from versioned content that ships with the product and changes only through the gated story process.
- [ ] Every entry has a stable anchor; deep links land on the entry; a bad anchor lands at the section top, never an error page.
- [ ] Section pages have an entry list at the top, a quiet side rail on wide viewports that collapses on narrow ones, and next/previous section links.
- [ ] No door links to the guide yet, and nothing links to a section without published entries.

**Dependencies:** Story 1 (content lands only with the scan gating it).

**Notes for engineering:** Content pipeline is engineering's call within the PRD §7 constraints (versioned with the product; anchors stable; scannable). Anchors are forever once published; make the anchor slug an explicit authored field, never derived from a heading that might be reworded.

## Story 3: The start-here narrative and the three doors
**PRD section(s):** §5.1, §5.2 · **Persona(s):** Trusting Reader (Moment A), Founding Curator (Moment C) · **Block:** Foundation

**Description:** The landing carries the full start-here narrative, and the guide goes live behind its three doors.

**Acceptance criteria:**
- [ ] The landing reads complete: the one honest paragraph on what Unbnd is, the first session in four short moves, why the numbers here are different, and the clearly marked skippable "If you curate" extension.
- [ ] The landing ends in the table of contents; only sections with published entries are linked (the contents grow as Block 2 lands).
- [ ] The narrative went through the full process: drafted, taxonomy-edited with a recorded diff, reviewed; the mechanical scan is clean; the one allowed we-voice passage appears on the landing only.
- [ ] The three doors are live: a "Guide" footer link site-wide, a prominent cross-link near the top of About, one quiet line on the auth/welcome surfaces.
- [ ] A reader sent `/guide` cold (the recruit's link) gets a complete, self-sufficient page.

**Dependencies:** Story 2.

**Notes for engineering:** This is the first story where the writing process runs end to end; treat it as the process's proving run. The four moves each link the matching reference entry once it exists; until then they stand alone without dead links.

---

## Block 2 — The reference

*The ~35 entries, in batches a single cycle can draft, edit, and review well. Sections publish as their batch lands; the contents fill in. The inventory in `scope/reader-guide.md` is the contract; the close reconciles against it with zero gaps.*

## Story 4: Reference: getting started + finding books
**PRD section(s):** §5.2 (inventory sections 1–2) · **Persona(s):** Trusting Reader · **Block:** The reference

**Description:** The entries for creating an account, reading without one, the first session, and every way of finding books (search, genres, shelves, Hidden Gems, For You, the book page tour).

**Acceptance criteria:**
- [ ] Every section 1–2 inventory entry is published under its stable anchor, named by the on-screen words, in the four-part anatomy.
- [ ] The sign-in-with-extension entry frames it only as "if you already have a portable account" with no protocol vocabulary.
- [ ] Each entry: recorded taxonomy-edit diff; reviewer re-ran the mechanical checks; scan clean.
- [ ] The landing contents and the four first-session moves now link these entries.

**Dependencies:** Story 3.

**Notes for engineering:** The book-page tour entry is the longest in these sections; it walks the page top to bottom and links sideways into the trust entries (which land in Story 5; sideways links may land with 5 to avoid dead anchors; the two stories agree the seam at promotion).

## Story 5: Reference: ratings you can trust
**PRD section(s):** §5.2 (inventory section 3) · **Persona(s):** all three · **Block:** The reference

**Description:** The heart of the guide: the view switch, trusted versus community consensus, taste match, review sorting, the hype gap, followers and following.

**Acceptance criteria:**
- [ ] Every section 3 inventory entry is published per the anatomy, anchors stable, named by the on-screen words ("Unbnd house view," "Taste match," "Hidden gem").
- [ ] Each explains what the number is based on in plain words, and what changes when the view switches, without any protocol vocabulary and without raw scores.
- [ ] The "not enough overlap yet" and "no followers yet" honest states are each explained where their feature is.
- [ ] Each entry: recorded edit diff, independent mechanical check, scan clean.

**Dependencies:** Story 4 (the contents order; the sideways links from 4 resolve here).

**Notes for engineering:** These entries carry the heaviest concept load, and the D1 one-comparison budget will be tempting to spend everywhere. The staff-picks-shelf comparison in the style guide is the canonical example for the house view; most of the rest should need none.

## Story 6: Reference: rating, reviewing, and tagging
**PRD section(s):** §5.2 (inventory section 4) · **Persona(s):** Trusting Reader, Founding Curator · **Block:** The reference

**Description:** Rating, reviewing, updating and removing a rating, suggesting and disputing tags, the contested treatment, the reviewed content flags, and shelves.

**Acceptance criteria:**
- [ ] Every section 4 inventory entry published per the anatomy; removal explains that rating again brings a rating back; the contested entry explains what a struck-through tag is telling the reader.
- [ ] The reviewed-flags entry explains plainly what a flag like "AI generated" means, who reviewed it, and why it appears apart from normal tags, without naming internal machinery.
- [ ] Each entry: recorded edit diff, independent mechanical check, scan clean.

**Dependencies:** Story 5.

**Notes for engineering:** none beyond the standing process.

## Story 7: Reference: sharing, your profile, and for authors
**PRD section(s):** §5.2 (inventory sections 5–6) · **Persona(s):** Trusting Reader, Founding Curator (as author) · **Block:** The reference

**Description:** What sharing a link shows elsewhere, what a public profile exposes, claiming a book you wrote, and what author verification unlocks.

**Acceptance criteria:**
- [ ] Every section 5–6 inventory entry published per the anatomy; the claim entry is honest that a claim is a statement, and verification is the separately earned state that unlocks the author-provided fields.
- [ ] Each entry: recorded edit diff, independent mechanical check, scan clean.

**Dependencies:** Story 6.

**Notes for engineering:** The submit form's no-"verified" invariant (Story 31 lineage) extends here in spirit: the claim entry must not promise verification.

## Story 8: Reference: for curators
**PRD section(s):** §5.2 (inventory section 7) · **Persona(s):** Founding Curator · **Block:** The reference

**Description:** What a curator is, the three paths to becoming one, vouching, submitting books, promotion including automatic, removal from the catalog, content flags including the pending view and reveal/withdraw, and the Curate page.

**Acceptance criteria:**
- [ ] Every section 7 inventory entry published per the anatomy; the dignity test holds (a respected colleague, never a beta tester).
- [ ] The promotion entry covers both the curator action and the automatic path in plain words; the removal entry explains the queued state a curator sees.
- [ ] The flags entries separate the reader's view (what a revealed flag means) from the curator's powers (apply, see pending, reveal, withdraw).
- [ ] Each entry: recorded edit diff, independent mechanical check, scan clean.

**Dependencies:** Story 7.

**Notes for engineering:** none beyond the standing process.

## Story 9: Reference: your account is yours + the staying-current rule
**PRD section(s):** §5.2 (inventory section 8), §5.4 · **Persona(s):** Sovereignty-Curious User · **Block:** The reference

**Description:** The sovereignty deep entry and the one marked wider-network note, plus the staying-current rule landing in the engineering process; the inventory closes with zero gaps.

**Acceptance criteria:**
- [ ] The sovereignty entry is the complete calm explanation behind the Settings card: what you have now, what changes, what stays the same, what you become responsible for. "Key" is introduced as "the key to your account" with what it does before any property of it is discussed.
- [ ] The wider-network note is one clearly marked entry; the protocol wall holds everywhere else (provable by the scan).
- [ ] The staying-current rule is added to the engineering definition of done: a story changing a user-facing surface updates its guide entry in the same story, through the same draft-then-edit process.
- [ ] The inventory table shows every scope entry published with a recorded edit diff; zero gaps.

**Dependencies:** Story 8.

**Notes for engineering:** The definition-of-done change touches the engineering process docs; promote it with care so it binds future stories the way the review checklist does.

---

## Block 3 — Meeting confusion where it happens

## Story 10: Contextual entry points
**PRD section(s):** §5.5 · **Persona(s):** all three (Moment B) · **Block:** Meeting confusion

**Description:** The highest-confusion surfaces link one click into their matching guide entry.

**Acceptance criteria:**
- [ ] Each listed surface routes to its entry's anchor in one click: the House/Yours switch, taste-match chips, the hype-gap line, vouch counts, contested tags, reviewed-flag rows, the "Removal queued" state.
- [ ] Each uses the quietest existing affordance for its surface; never a modal, never a tooltip essay.
- [ ] The affordances render sensibly signed out where the surface itself does.
- [ ] No surface gained visual weight: the design system's existing treatments only.

**Dependencies:** Stories 4–9 (the anchors must exist).

**Notes for engineering:** Affordance choice is per-surface at the Architect/design level; the design guide's rule is the constraint. Anchors are already stable, so this story is wiring, not content.

---

## Handoff

On approval, the engineering Product Owner reads this queue and promotes each brief into a flat `engineering-team/stories/<n>-<slug>.md` via `/plan-feature` (next number scanning `stories/` + `stories/done/`; the next available number is **#83**), referencing `product-team/prd/reader-guide.md` and the guides. Open `engineering-team/audits/reader-guide/book.md` at intake, anchored to PRD §5, so the book-close return edge can reconcile the inventory's zero-gaps metric. Build in queue order; Story 3 is the first user-visible payoff (the recruit link works), and Stories 4–9 are sequential by content dependency, not by code risk.
