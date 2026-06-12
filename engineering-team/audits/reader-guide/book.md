# Book of Work: The Reader's Guide

**Slug:** reader-guide
**Status:** Open
**Opened:** 2026-06-11
**Closed:** —

## Intent anchor
**PRD-backed.** Anchor: `product-team/prd/reader-guide.md` (§5, all). Companion guides: `guides/reader-guide-design-guide.md` (+ wireframes), `guides/reader-guide-style-guide.md` (the tic taxonomy, binding; Appendix M is the machine seam). Queue: `product-team/stories-queue.md` (reader-guide, 10 briefs, 3 blocks). Completion is computed: every story below Done, and the scope inventory reconciles with zero gaps.

## Stories in this book
**Block 1 — Foundation**
- #83 `tic-taxonomy-check` — the taxonomy + mechanical check ✅ MERGED (ADR 0080, review PASS)
- #84 `guide-surface` — routes, anchors, the document frame (unlinked) ✅ MERGED (ADR 0081, review PASS)
- #85 `guide-narrative-doors` — the start-here narrative + the three doors

**Block 2 — The reference**
- #86 `guide-ref-getting-started-finding` — sections 1–2
- #87 `guide-ref-trust` — section 3 (the heart)
- #88 `guide-ref-rating-tagging` — section 4
- #89 `guide-ref-sharing-authors` — sections 5–6
- #90 `guide-ref-curators` — section 7
- #91 `guide-ref-sovereignty` — section 8 + the staying-current DoD rule + zero-gaps inventory

**Block 3 — Meeting confusion**
- #92 `guide-contextual-links` — the contextual entry points

## Deploy / ops notes
- None yet. The guide ships with the web bundle; no new services, env, or workers.

## Carry-forward
- Review #83: A4 (heading case) is edit-pass-enforced, not scanned; "NIP" as a case-insensitive word rule could match the noun "nip" (fix = an appendix edit, no code).

## Provenance
- **Mode:** PRD-backed.
- **Confidence at close:** to be set at book-close.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/reader-guide/audit.md`
- Product feedback: `engineering-team/audits/reader-guide/prd-addendum.md`
