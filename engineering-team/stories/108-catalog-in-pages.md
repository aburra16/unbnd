# Story 108: Workers read the catalog in pages

**Origin:** the Open Library import (2026-10-21, team-approved) takes the catalog from about 11,300 books to about 159,000. The staging droplet has 7.9 GB of memory, about 5.9 GB free, and no swap (`show-status`, 2026-10-21).

## Problem
Three workers load the whole catalog into memory before they start:
- the labels pass (every record, every tag assertion);
- the nightly indexer (the same, to rebuild Meilisearch);
- the shelves worker (every record and every assertion, though it uses a record's slug and dates and only rated books' genres).

At 159,000 records of about 3.6 KB each, plus their assertions, a worker holds well over a gigabyte of parsed events, near Node's default heap limit, on a box with no swap shared with the relay, the database and the API.

## Acceptance criteria
1. **A pager that does not keep pages.** `forEachPage` in `@unbnd/relay` walks a filter backwards by `created_at` like `queryAllPages`, hands each page's new events to a callback and keeps only the ids it has seen.
2. **Catalog pages with their assertions.** `forEachCatalogPage` in `@unbnd/search` walks the librarian's book records in pages and, for each page, reads only the tag assertions naming those books (`#a`, in chunks), grouped by book.
3. **The labels pass works page by page.** Same results as today (story 105 tests hold); it stops before writing when the tag list is empty or when no assertion exists at all.
4. **The indexer indexes page by page.** Same index as today: clear, then upsert each page's documents.
5. **The shelves worker keeps a summary per book** (slug, `created_at`, `added`, delisted) and reads assertions only for books that have reviews. Same shelves as today.
6. **`show-status` reports memory and disk.**

## Out of scope
The import itself (story 109).
