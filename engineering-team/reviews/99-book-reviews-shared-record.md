# Review: Story 99 — Book reviews move to the shared record

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-20

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · full workspace green: schemas 159, trust 60, api 1004 + 13 skipped, web 449, shelves 29, seeder 144, librarian 39 · web build ok · guide scan 0 errors, 5 standing flags.
- [x] The contract's checks are tests, by letter (`packages/trust/test/reviews.test.ts`: A, C, D, E, F, G, H, J, K plus the author-only, future-removal, catalog and tie rules), against the same `starsOf` rule Brainstorm uses (`client/src/lib/thing.ts`, read at `staging`), with the books contract's one difference (a rating of 0 is no stars).
- [x] Live facts the design rests on, checked 2026-10-20: the index answers `#m` and `#k` filters under `include:spam`; dcosl refuses reviews; another app already writes `m book` reviews with `d` `book:<address>` (kind 30040 publications), which the fold correctly skips as outside the catalog.
- [x] **Unbnd's relay accepts kind 34259:** the data image (Tapestry `concept-graph` @ `6a9391fd`) copies strfry's stock `strfry.conf` (`docker/entrypoint.sh`), whose write-policy plugin is empty. The Brainstorm template with the `brainstorm.js` kind whitelist is not used here. CI has no strfry, so the integration test (updated to kind 34259) still runs only where `STRFRY_TEST_URL` is set.

## Spec adherence (ADR 0089, books actions contract)
- [x] Record (§3): d `book:<address>`, `a` + hub hint, `m book`, `rating` fraction, `s`, `alt`, words ≤ 1,200; Unbnd's composer requires stars.
- [x] Which reviews stand (§4, §6): one function (`standingReviews`); every read in the API and the shelves worker folds through it. Four hand-written "newest per book" loops are gone; the summary module shrank from 263 lines to 95.
- [x] Edit (§6): built on the standing review, carries every unknown tag in order except `client`/`nonce`, keeps carried photo addresses after the words, dated `max(now, previous + 1)`; after a removal, dated past it.
- [x] Removal (§6): kind 5 with `e`, `a`, `k`, dated no earlier than the review; a sovereign removal must name the caller's current review exactly.
- [x] Publishing (§5): local first, then the writer's kind 10002 write relays (cached an hour) and the review set, never the hub (guarded, tested). Custodial accounts have no relay list and use the review set, which includes the index, as the contract's §5 allowance says.
- [x] Sync: pulls reviews and removals from the review set (index under `include:spam`), keeps signature-checked events about catalog books, plus id-only removals of reviews Unbnd holds by their author; re-sends Unbnd's last two days to the index. Unref'd, fault-isolated, overlapping watermark.
- [x] Rank-5 line on every counted value: the book view, For You, search rerank, submission signals, and the Trending shelf.
- [x] Retired: the 39999 rating schema and its tests, the retraction idiom, the `book-ratings` concept, its dcosl up-sync filter and its sync-health count.
- [x] Guide (staying-current rule): both entries updated through the two-pass process (draft + recorded edit commits).

## Findings
### Blocking
_None._

### Non-blocking, recorded
1. **15-minute clock on Unbnd's relay.** Stock strfry rejects events dated more than 900 s ahead; the contract tolerates a day. An edit built on another app's review dated far ahead would be dated past it and refused locally (a 502 to the user), and such a review pulled by the sync waits until it is within 15 minutes. Rare; a fix means changing the data image's relay config, which belongs with the Tapestry image, not this story.
2. **The re-send window** pushes every local review and removal of the last two days to the index each cycle. Idempotent and cheap at today's volume (17 ratings); worth a per-event marker if volume grows.
3. **The droplet's installed up-sync cron** (`/etc/cron.d/unbnd-upsync`, if installed by hand from the old file) still names `book-ratings`; it now matches nothing and is harmless. The repo copy is updated.
4. **The plain averages** (no-trusted fallback, Hidden Gems' "crowd") are untouched here by design: story 101.
5. **Legacy ratings** (17 on dcosl) are not read any more until story 100 moves them.

## Verdict
**PASS.** Unbnd writes and reads the same review record as the places contract, under the books contract's rules, in every path.
