# ADR 0096: Workers read the catalog in pages

**Status:** Accepted; the indexer's paged walk retired by ADR 0100
**Date:** 2026-10-21
**Story:** `engineering-team/stories/108-catalog-in-pages.md`

## Context
The labels pass (ADR 0094), the indexer (ADR 0013) and the shelves worker (ADR 0036) each read every catalog record and every tag assertion into memory before working. That was fine at 11,300 books. The Open Library import (story 109) brings about 159,000, and the droplet has no swap.

## Decision
1. **`forEachPage(fetchPage, onPage, opts)`** in `@unbnd/relay`: the same backwards walk and stop rules as `queryAllPages` (short page, no new events, page and time budgets), but it awaits `onPage(newEvents)` per page and retains only seen ids. It reports `stuck` when a full page brought nothing new, which means more than a page of events share one second; the labels pass logs it. Writers of catalog records keep well under 500 a second (the seeder publishes at 4).
2. **`forEachCatalogPage({ query, librarian, pageSize, onPage })`** in `@unbnd/search`: pages the librarian's records under `books`; for each page it reads the `book-tag-assertions` items whose `a` names one of the page's books (chunks of 250 addresses, each read paged, since a relay answers at most 500 events per request), groups them by book slug, and awaits `onPage(records, assertionsBySlug)`.
3. **Labels pass:** taxonomy first (stop if empty), then a one-event probe for any assertion (stop if none), then each catalog page. The re-read before signing (ADR 0094 §5) is unchanged.
4. **Indexer:** the walk builds each page's documents and writes them to a temporary file; only after a complete walk does it `configureIndex`, `deleteAll` and load the file in batches. A relay failure mid-walk leaves the old index as it was. Records are read from the librarian only, which also keeps a foreign record with a catalog slug out of the index.
5. **Shelves:** `readBooks` returns a summary per record (id, pubkey, kind, `created_at`, and only the `d`, `added` and `delisted` tags), built page by page from the librarian's records; genre membership reads assertions (paged) only for books with standing reviews.

## Consequences
- Peak memory follows the page size (500 records plus their assertions), not the catalog size.
- Each page adds assertion reads; a pass over 159,000 books makes about 320 page reads and as many assertion reads.
- A relay read that times out still returns what it has (the pager stops on a short page); unchanged from before and recorded on ADR 0094.
