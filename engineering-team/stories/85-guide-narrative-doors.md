# Story 85: The start-here narrative and the three doors

**Status:** Planning
**Created:** 2026-06-11
**Type:** Feature (web + content; the writing process's proving run)
**Source brief:** `product-team/stories-queue.md` Story 3 · **PRD:** §5.1/§5.2 · **Law:** the tic taxonomy (binding; the scan is live in CI)

## Background
The surface exists (#84) but the landing is scaffolding and nothing links in. This story makes the guide real: the landing carries the start-here narrative (the one honest paragraph, the first session in four short moves, why the numbers here are different, and the clearly marked skippable "If you curate" extension), and the guide goes live behind its three doors (the site-wide footer "Guide" link, a prominent About cross-link, one quiet line on the auth surfaces). This is the first story whose deliverable is prose: the narrative is **drafted, then taxonomy-edited in a separate commit with a recorded diff, then reviewed** with the reviewer independently running the mechanical scan. The four first-session moves stand alone without links until their reference entries publish (#86 adds them, per its own AC).

## Acceptance criteria
From the brief:
- [ ] The landing reads complete: the honest paragraph, the four moves, why the numbers differ, the marked skippable curator extension.
- [ ] The landing ends in the table of contents; only sections with published entries are linked (none yet; the contents grow with Block 2).
- [ ] The narrative went through the full process: drafted, taxonomy-edited with a recorded diff, reviewed; the scan is clean; the one allowed we-voice passage appears on the landing only.
- [ ] The three doors are live: footer "Guide" site-wide; a prominent cross-link near the top of About; one quiet line on the auth surfaces.
- [ ] A reader sent `/guide` cold gets a complete, self-sufficient page.

## Out of scope
Reference entries (#86–#91); contextual links (#92); changes to the About page's own prose (one cross-link only).

## Open questions
For the Architect:
1. Where the landing narrative lives so the scan governs it (it must sit under the Appendix M glob) and how the loader recognizes it as the landing rather than an entry.
2. Whether the formatter needs a heading construct for the narrative's sections (real document structure, distinct from the A5-banned pseudo-structure).

## Linked artifacts
- ADR: `engineering-team/decisions/0082-guide-narrative-doors.md` (Accepted)
- Test plan: `engineering-team/stories/85-guide-narrative-doors.test-plan.md`
- Review: _pending_
