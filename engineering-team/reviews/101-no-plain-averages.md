# Review: Story 101 — No plain averages

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-20

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r --no-bail typecheck`, `lint`, `build`: every package clean.
- [x] `pnpm -r --no-bail test`: every package green (trust 68, shelves 30, api 1017 + 13 skipped as on main, web 452, others unchanged). Red set was 25 failing for the right reasons (`4e3f603`).
- [x] CI on the branch: typecheck/test/build, Caddyfile and visual regression all green. The two baselines that changed (`book-detail.png`, `guide-section.png`) were taken from the pinned image's own render of `14b0b50` and inspected: the book page shows "No trusted ratings for this book yet.", the house-view label and "3 ratings" with no figure; the guide section shows the rewritten entries. The other five baselines are byte-identical.

## Spec adherence (ADR 0092)
- [x] §1 `WeightedRatings.crowdAverage`/`crowdCount`: weight above zero, each counted once, starred only; tested with ranks 90/30/2/1, a no-standing trio, a words-only review, and nobody counted.
- [x] §2 both hype-gap readers use the crowd: `classifyHypeGap` via `HypeGapIndicator`, and the Hidden Gems gap. A shelves test shows 1-star keys with no standing leave the gap at zero.
- [x] §3 no `average` on any summary; `summaryWithTrust` answers read, submit and remove, so the post-write panel keeps its trusted view (tested: submit summary equals the read's).
- [x] §4 count-only block; no `.ratings-num` or stars without a trusted view.
- [x] §5 the unfurl card shows the house view's figure with "N trusted ratings", else "N ratings"; trust failure and no trust both give the count (tested at reader and route).
- [x] Guide: six entries, draft `2379021`, taxonomy edit `14b0b50` with a recorded diff. Reviewer's [M] scan: 0 errors; the F2 "appears" hits read literally. Read-aloud on each changed opening and the book-page step: clean.

## Findings
### Blocking
_None._
### Non-blocking
1. *Unbnd house view* step 3 ("The books never change; the jury does.") is the same rhetorical contrast the edit pass removed from the landing page. That entry is untouched by this story; worth a line in the next guide sweep.
2. A book whose only reviews have words and no stars still reads "No ratings yet. Be the first to rate it." above those reviews. Older than this story.

## Verdict
**PASS.** After merge and deploy, open a book with no trusted ratings on staging and confirm the count-only block, and check one unfurl card.
