# Review: Story 109 — The catalog imports Open Library's monthly dump

**Reviewer:** independent reviewer (rounds 1 and 2)
**Date:** 2026-10-21

## Round 1: FAIL, two blocking
1. **`--apply` trusted the dry run's label over the hub.** A read that times out returns nothing, so a changed book could be republished as new: no `added`, no genre labels, no carried tags, and checkpointed, so the loss would be permanent. The same empty read skipped the ownership check. The reverse case, a new book already on the hub, lost the kept identity (ADR 0097 §6). **Fixed:** a changed book whose re-read is empty fails and is retried on the next run; a new book found on the hub takes that record's identity and first-added date and is skipped when nothing differs. Tests cover both.
2. **Stray duplicate files** (" 2" copies of sources, tests and docs) were committed and compiled. **Fixed:** removed.

Non-blocking, fixed in the same round:
- Works that absorbed a book already in the catalog would list it twice. They are skipped and counted as `merged`.
- `IMPORT_RATE` is validated (a rate that is not a positive number stops the run) and set on the droplet, with `LIBRARIAN_PUBKEY`, so the dry run needs no secret key.
- The dry run refuses a read of the hub that stopped short (`stuck` or `capped`).
- The workflow passes the dump date as data and checks it for every import task; the report task's fallback message prints.
- A replacement is dated at least one second after the record it replaces, as the labels pass does.
- A malformed redirect line is skipped instead of ending the run.
- The runtime estimate is 20 to 40 hours (two hub reads and an acknowledged publish per event), and the ADR notes that 4 changed books lose their blurb because Open Library removed their descriptions.

Accepted and recorded: downloads do not resume and old dumps are not pruned (about 17.5 GB a month against 138 GB free; the sync story); one redirect hop finds all but 59 of 400,128 candidates; a kept ISBN-13 can sit beside another edition's ISBN-10; the import does not take the labels lock (a replacement dated after the current record wins either way).

## Dry run, 2026-09-30 dump against the live hub (read-only)
Candidates with at least 5 readers: 400,128. Planned: 147,772 new, 1,269 changed, 9,799 unchanged, 0 not owned. Dropped: editions 145,545, language 43,312, cover 36,399, pages 10,757, author 4,187, denylist 229, merged 59, year 21. Year corrections: 908. About 5.5 minutes at 1.0 GB resident with a 1.5 GB heap cap.

## Quality gates (at HEAD)
- [x] typecheck, build and tests clean: seeder 278, api 1026 + 13 skipped, web 454, schemas 183, trust 68, relay 24, search 39, librarian 44, shelves 36, indexer 31, promoter 54, ui 20, guide-lint 13.

## Verdict
Round 2 pending.
