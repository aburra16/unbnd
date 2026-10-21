# Story 109: The catalog imports Open Library's monthly dump

**Origin:** the sizing pass (2026-10-20) and the operator's go, with the NosFabrica team's agreement on the load (2026-10-21): import the books that pass the current gate and have at least 5 Open Library readers, about 159,000.

## Problem
The catalog holds about 11,300 books, the top of 8 subjects by readers, collected through Open Library's search API. That route cannot reach 159,000 books politely, and it cannot be repeated each month. Open Library publishes its whole database monthly as dump files; the sizing pass showed the seeder's gate can be computed from them (99.6% agreement with the live catalog).

## Acceptance criteria
1. **Fetch.** `node import.js --dump <YYYY-MM-DD>` downloads the works, editions, authors, redirects and reading-log dumps from archive.org (`ol_dump_<date>`) to the seeder volume, checks each against the md5 archive.org lists, refuses to go on after a mismatch, and keeps a verified file for the next run.
2. **Extract with bounded memory.** The reading log gives each work's readers (through one redirect hop); works with at least 5 readers are the candidates. Only candidates' lines in the works and editions dumps are parsed, and only their authors in the authors dump. Each candidate becomes the fields the gate and mapper read (`OLSearchDoc`), its description, its edition years and its first author's birth year.
3. **The same rules as the seeder.** `gateReason`, story 104's `judgeYear`, `mapSearchDocToBookRecord`, the description sanitizer and cap, and `subjectsToGenres` decide and build each book, unchanged. The tier is the gate plus 5 or more readers.
4. **Compare before publishing.** The import reads the librarian's records from the hub in pages. A book is new, changed (its fingerprint differs) or unchanged. Records the import does not own are never touched: community books (`source: community` or `submitted-by`), and delisted records.
5. **A changed book keeps what others added.** It is rebuilt from the dump, and keeps the live record's first-added date (`added`, or its `created_at`), its genre labels and any tag the schema does not write.
6. **A dry run first.** Without `--apply` the import publishes nothing and writes a report: candidates; drops by gate signal; new, changed, unchanged and not owned; year corrections; and a sample of new titles.
7. **Paced, resumable publishing.** `--apply` publishes each book's record and genre assertions to the hub, librarian-signed, at `IMPORT_RATE` events a second (default 10), each with its own `created_at`, and checkpoints each book so a dropped run resumes where it stopped.
8. **Ops.** Staging ops tasks `import-dry-run` and `import-apply` take the dump date.

## Out of scope
- The monthly schedule, removals of merged or deleted works and old-slug aliases (a later story with its own ADR).
- Raising the tier past 5 readers.
