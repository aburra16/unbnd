# Story 84: The guide surface

**Status:** Planning
**Created:** 2026-06-11
**Type:** Feature (web)
**Source brief:** `product-team/stories-queue.md` Story 2 · **PRD:** `product-team/prd/reader-guide.md` §5.1/§6/§7 · **Design:** `guides/reader-guide-design-guide.md` (+ wireframes)

## Background
The guide's routes and frame must exist before the narrative (#85) and the entries (#86–#91) have anywhere to live. The PRD binds the structure: a `/guide` landing plus eight section routes, entries rendered in the four-part anatomy (what it is; what it is based on; numbered steps; related links) from content that ships versioned with the product, under **anchors that never change once published** (Block 3's contextual links and recruit-shareable links hang off them). The design guide binds the register: the document look (reading measure, no cards around body text, the existing type scale and tokens), an entry list atop each section page, a quiet side rail on wide viewports, next/previous section links. The #83 scan already gates the content location (`apps/web/src/guide/content/**/*.md`, the Appendix M contract), so whatever pipeline this story builds must author entries as markdown files there.

Two honesty constraints from the brief: nothing links to the guide yet (the doors are #85's), and nothing ever links to a section without published entries.

## User-facing description
As a reader with the URL, the guide pages exist, read like the product slowed down, and every entry is deep-linkable at an address that will never change; as the authors of #85+, there is a content pipeline to write into.

## Acceptance criteria
From the brief:
- [ ] `/guide` and the eight section routes render in the product's design system in the document register: reading measure, no cards around body text, the existing type scale.
- [ ] Entries render with the four-part anatomy from versioned content that ships with the product and changes only through the gated story process.
- [ ] Every entry has a stable anchor; deep links land on the entry; a bad anchor lands at the section top, never an error page.
- [ ] Section pages have an entry list at the top, a quiet side rail on wide viewports that collapses on narrow ones, and next/previous section links.
- [ ] No door links to the guide yet, and nothing links to a section without published entries.

## Out of scope
The landing narrative and the doors (#85); all entry content (#86–#91); contextual links (#92); guide search.

## Open questions
For the Architect:
1. **The content pipeline without a new dependency.** Markdown files are fixed (the Appendix M glob); rendering needs either a markdown library (a new dependency for a tiny constrained format) or a deliberately small subset formatter for exactly the anatomy's constructs. Decide, and pin the authored-anchor mechanism (the design guide: an explicit authored field, never derived from a heading).
2. **Empty-section and unknown-route behavior** ("never an error page" for anchors; what a section with zero entries or an unknown section slug does while Block 2 fills in).
3. **The loader seam** so component tests inject fixture content without touching the real (empty) content directory.

## Linked artifacts
- ADR: `engineering-team/decisions/0081-guide-surface.md` (Accepted)
- Test plan: `engineering-team/stories/84-guide-surface.test-plan.md`
- Review: _pending_
