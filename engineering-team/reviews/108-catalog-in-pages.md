# Review: Story 108 — Workers read the catalog in pages

**Reviewer:** independent reviewer (rounds 1 to 3)
**Date:** 2026-10-21

## Round 1: FAIL, two blocking
1. **Assertion reads were not paged.** Each 250-book chunk was one request, but a relay answers at most 500 events per request; genre-rich pages lost assertions and the labels pass would have published records missing genres, the same way every run. **Fixed:** each chunk is read with `queryAllPages`; a fake relay capped at 500 covers 700 assertions on one book.
2. **The indexer cleared before it read.** A relay failure mid-walk would have left search with part of the catalog until the next night. **Fixed:** the walk writes documents to a temporary file; only a complete walk clears and loads the index.

## Round 2: FAIL, one blocking
A failed write of the walk's file (a full disk) hung the close wait and the process exited 0 with nothing logged. **Fixed:** the first stream error is kept and rethrown, `drain` is raced against the stream finishing, and the close is awaited with `finished`; a test with a failing stream rejects and clears nothing. Also: a stuck walk (more than a page of records in one second) throws in the indexer and warns in the shelves worker.

## Round 3: PASS
Verified with the real function under five failure cases (a pending `drain`, no pending `drain`, the last write, `final()`, and 20,000 documents through the real file path): none hangs, none clears the index. One non-blocking item fixed after the verdict: waits on `drain` share one `finished` promise, so listeners no longer pile up.

Accepted and recorded: the assertion-chunk reads have no `stuck` signal (writers publish 4 to 50 a second, story 109 at 10); the walk file needs roughly 150 MB to 1 GB of disk at 159,000 books (138 GB free); search serves a partial index between the clear and the end of loading, as before.

## Quality gates (at HEAD)
- [x] `pnpm -r --no-bail` typecheck, build: clean. Tests: relay 24, search 39, indexer 31, shelves 36, promoter 54, api 1026 + 13 skipped, web 454, seeder 237, schemas 183, trust 68, librarian 44, ui 20, guide-lint 13.

## Verdict
**PASS.** After merge and deploy: the labels cron and the nightly indexer use the paged reads; run `show-status` for memory and disk, and `index` once to confirm the rebuild.
