# Review: Story 105 — Book records carry their facets as labels

**Reviewer:** independent reviewer (rounds 1 and 2), round 3 fixes checked by the implementer
**Date:** 2026-10-20

## Round 1: FAIL, two blocking
1. **A republish undid newer writes.** The pass signed each record from a snapshot taken at its start; a delisting, seeder update or year correction landing mid-pass was overwritten for good. **Fixed:** the pass re-reads the record just before signing and builds on that version, skipping one delisted meanwhile.
2. **Relabels bumped books into "Recently added"**, which sorted by event date, so tagging any old book moved it onto the homepage. **Fixed:** an `added` tag keeps a record's first date; the shelves worker computes a `recent` shelf by it; `GET /api/books` without slugs serves that shelf, falling back to the relay.

Non-blocking, fixed: the pass stops on an empty book or tag list; the tag list is read from the librarian alone; a hub-accepted record whose local publish throws counts as relabelled; the manual ops run takes the cron's lock; DEPLOY.md notes `install-cron`. Left for the import story: the pass holds the catalog in memory, and a dropped hub connection fails the rest of a pass (the next pass resumes).

Found in passing and fixed: Hidden Gems (story 71) were computed but never written to the shelves cache or read back, so the homepage shelf was always empty. It appears after this deploy.

## Round 2: PASS, three recommended closures
1. A delisting that reached only Unbnd's relay (a demotion whose hub publish failed) could still be undone, since the re-read used the hub alone. **Fixed:** the re-read takes the newest version from the hub and Unbnd's relay (tested).
2. An empty assertions read would strip every genre. **Fixed:** the pass stops on it too (tested).
3. The live per-book reindex in the API and the promoter still read the tag list from every author, so it could disagree with the nightly rebuild. **Fixed:** every tag-applying read takes the librarian's tag list only: labels pass, indexer, both live reindex readers, the API's tag routes and unfurl, and the shelves worker. The sync-health count is left as a count.
4. ADR 0094 §3 named the old function. **Fixed.**

Accepted: a write landing in the round trip between the re-read and the hub publish.

## Quality gates (round 3, at HEAD)
- [x] `pnpm -r --no-bail typecheck` and `build`: every package clean. No package defines `lint`.
- [x] `pnpm -r --no-bail test`: schemas 176, search 18, promoter 51, shelves 34, api 1021 + 13 skipped as on main, web 452, indexer 28, librarian 44, seeder 145, trust 68, relay 22, ui 20, guide-lint 13.
- [x] Live checks: the search relay filters by `#l` and combines a label filter with a text search (2026-10-20).

## Verdict
**PASS.** After merge and deploy: run `install-cron`, run the `labels` task (the first pass labels the whole catalog and may take more than one run), then the `shelves` task, and check that a book's record carries its labels, "Recently added" holds its order, and Hidden Gems shows on the homepage when it has books.
