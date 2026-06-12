# Book of Work: The Reader's Guide

**Slug:** reader-guide
**Status:** Open
**Opened:** 2026-06-11
**Closed:** —

## Intent anchor
**PRD-backed.** Anchor: `product-team/prd/reader-guide.md` (§5, all). Companion guides: `guides/reader-guide-design-guide.md` (+ wireframes), `guides/reader-guide-style-guide.md` (the tic taxonomy, binding; Appendix M is the machine seam). Queue: `product-team/stories-queue.md` (reader-guide, 10 briefs, 3 blocks). Completion is computed: every story below Done, and the scope inventory reconciles with zero gaps.

## Stories in this book
**Block 1 — Foundation: COMPLETE (2026-06-11)**
- #83 `tic-taxonomy-check` — the taxonomy + mechanical check ✅ MERGED (ADR 0080, review PASS)
- #84 `guide-surface` — routes, anchors, the document frame (unlinked) ✅ MERGED (ADR 0081, review PASS)
- #85 `guide-narrative-doors` — the start-here narrative + the three doors ✅ MERGED (ADR 0082, review PASS; the two-pass writing process proved out: draft + recorded edit-pass commits)

**Block 2 — The reference**
- #86 `guide-ref-getting-started-finding` — sections 1–2 ✅ MERGED (review PASS; 10 entries; the staleness rule named for future batches)
- #87 `guide-ref-trust` — section 3 (the heart) ✅ MERGED (review PASS; 6 entries; all #86 seams closed)
- #88 `guide-ref-rating-tagging` — section 4 ✅ MERGED (review PASS; 6 entries; 'catalog steward' naming carried to #90)
- #89 `guide-ref-sharing-authors` — sections 5–6 ✅ MERGED (review PASS; 4 entries)
- #90 `guide-ref-curators` — section 7 ✅ MERGED (review PASS; 7 entries)
- #91 `guide-ref-sovereignty` — section 8 + the staying-current DoD rule + zero-gaps inventory ✅ MERGED (review PASS; Block 2 COMPLETE: 36/36 entries, the exemption proven E-only)

**Block 3 — Meeting confusion**
- #92 `guide-contextual-links` — the contextual entry points

## The inventory reconciliation (Story 91; the zero-gaps record)
Scope (`product-team/scope/reader-guide.md` §"Features extracted") against published entries. Every entry below carries a recorded taxonomy-edit diff in its batch's `edit(NN)` commit.

| Section | Scope items | Published entries | Gaps |
|---|---|---|---|
| 1 getting-started | what Unbnd is · accounts · reading without one · first session | 4 (#86) | 0 |
| 2 finding-books | search · genres · shelves · Hidden Gems · For You · book page | 6 (#86) | 0 |
| 3 ratings-you-can-trust | view switch · trusted/community · taste match · sorting · hype gap · followers | 6 (#87) | 0 |
| 4 rating-reviewing-tagging | rate/review/update · remove · suggest/dispute · contested · reviewed flags · shelves | 6 (#88) | 0 |
| 5 sharing-and-your-profile | sharing a link · public profile | 2 (#89) | 0 |
| 6 for-authors | claiming · verified authors | 2 (#89) | 0 |
| 7 for-curators | role+paths · vouching · submit · promotion (both paths) · removal · flags · Curate | 7 (#90) | 0 |
| 8 your-account-is-yours | your words · take ownership · the marked network note | 3 (#91) | 0 |
| **Total** | | **36** | **0** |

## Deploy / ops notes
- None yet. The guide ships with the web bundle; no new services, env, or workers.

## Carry-forward
- Review #83: A4 (heading case) is edit-pass-enforced, not scanned; "NIP" as a case-insensitive word rule could match the noun "nip" (fix = an appendix edit, no code).
- **Supertest transport flake RECURRED (2026-06-11, #84 post-merge gate):** "Parse Error: Expected HTTP/" now seen twice under full-suite load, in different untouched files each time (shelves-enriched at #79; profile-stats-following-count at #84). Isolation always green; CI unaffected (Linux). The social-loop watch item's threshold is met: promote a small fix chore (likely the api vitest pool/concurrency config on macOS, or supertest agent reuse) rather than keep watching. RESOLVED 2026-06-11: the api suite moved to the forks pool (chore, merged); 4 consecutive full runs clean.

## Provenance
- **Mode:** PRD-backed.
- **Confidence at close:** to be set at book-close.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/reader-guide/audit.md`
- Product feedback: `engineering-team/audits/reader-guide/prd-addendum.md`
