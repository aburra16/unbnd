# ADR 0097: The catalog imports Open Library's monthly dump

**Status:** Accepted
**Date:** 2026-10-21
**Story:** `engineering-team/stories/109-open-library-import.md`
**Supersedes in part:** ADR 0054 §1 (readership as a sort, not a cutoff)

## Context
ADR 0054 collects the catalog from Open Library's search API, subject by subject, sorted by readers, and says readership is "a sort, not a cutoff". In practice the top of each subject by readers is a cutoff with a moving line. The sizing pass (2026-10-20, private planning) computed the gate's inputs from Open Library's monthly dump for every work: 1.08 million pass the gate, 159,000 of them have at least 5 readers, and 11,101 of today's 11,281 books are among those 159,000. The operator chose that tier, and the NosFabrica team agreed to the load on the hub and the search relay (2026-10-21).

## Decision
1. **Membership is the gate plus at least 5 Open Library readers**, counted from the dump's reading log through one work-redirect hop. It is deterministic and reproducible from a dump; it replaces ADR 0054's "sort, not a cutoff" posture.
2. **A Node import in the seeder image** (`import.js`), no new runtime: streaming gzip line reads, a cheap key check before any JSON parse, so only candidates' lines are parsed. Memory follows the candidate count (a few hundred thousand works), not the dump.
3. **The dump's fields, computed as Open Library's search index computes them** (as validated by the sizing pass): `edition_count` (editions naming the work), `language` (the union of edition languages), `number_of_pages_median`, `publish_year` (every edition year) and `first_publish_year` (the earliest), `cover_i` (the work's first cover, else an edition's), `isbn` (all editions'), `subject` (the work's), `author_name` (the first author, through one author redirect) and the description (the work's).
4. **The seeder's rules, reused:** `gateReason`, `judgeYear` (a corrected year replaces the earliest edition year), `mapSearchDocToBookRecord`, `sanitizeDescription` and `capBlurb`, `subjectsToGenres` with the seeder's assertion template, and `fingerprint`.
5. **Ownership, re-checked at publish time.** The import writes only records whose `source` is `openlibrary` and that carry no `submitted-by`; it never republishes a delisted record. Community books and author overlays and claims (separate events) are untouched. `--apply` reads each book's record from the hub again just before writing it, because the plan can be hours old:
   - a book planned as changed whose read comes back empty is a failure, retried on the next run, never published as new;
   - a book planned as new that is on the hub by now is treated as changed: it keeps that record's identity and first-added date (§6) and is skipped when the result is the same;
   - a replacement is dated at least one second after the record it replaces, so it wins even when clocks disagree.
   The dry run refuses to plan from a read of the hub that stopped short (ADR 0096), since every book it missed would be planned as new.
6. **A changed record keeps what others added:** its `added` (or its old `created_at` as `added`), its genre labels (ADR 0094), and tags the schema does not write. Format, language and ISBN labels come with the rebuilt record.
   It also keeps its **identity**: title, author, ISBN-13, ISBN-10 and page count stay as the catalog shows them, and the dump fills them only when empty. The dry run of the 2026-09-30 dump showed why: for 9,876 of 11,282 existing books the dump would only pick another valid ISBN of the same work, and for 164 another author of the work (a ghostwriter for a pen name, Leslie McFarlane for Carolyn Keene). Page counts were mostly off by one from a changed edition set or rounding, so they are kept too. Content fields (description, cover, subjects, language, year) follow the dump. The page median of an even count is the rounded mean of the middle two, which matched the catalog's values about twice as often as truncating.
7. **Merged works.** When Open Library has merged a work already in the catalog into another work, the surviving work is not added: it would list the book twice. The report counts these under `merged`; the monthly sync story decides how a catalog record follows a merge.
8. **Pacing.** One event at a time to the hub, `IMPORT_RATE` a second (default 10, under the pager's one-second page of 500, ADR 0096; a rate that is not a positive number stops the run), each with its own `created_at`. The checkpoint (`/data/import-checkpoint`) keys each book by dump date, slug and fingerprint.
9. **Dry run by default.** `--apply` is required to publish; the report goes to stdout and `/data/import-report-<date>.json`.

## Alternatives rejected
- **The search API at scale.** Rate limits, no deletes or redirects, and no monthly diff.
- **Python and DuckDB on the droplet**, as the sizing pass used. A second runtime in the image for one job; Node streams the same files within the memory bound.
- **One `created_at` for the whole run.** The pager cannot get past more than 500 events in one second.

## Consequences
- The first run publishes about 159,000 records and their genre assertions, about 310,000 events. At 10 a second that is 9 hours of pacing alone; with two hub reads and one acknowledged publish per event, expect 20 to 40 hours. The checkpoint makes a stopped run resume. The labels pass then labels the new records.
- A changed record follows the dump's description, so a book whose description Open Library removed loses its blurb (4 in the 2026-09-30 dry run).
- The seeder's subject walk (ADR 0054) stays for now; the monthly sync story decides its retirement.
- Works merged or deleted in Open Library stay in the catalog until the sync story handles removals.
