# ADR 0094: Book records carry their facets as NIP-32 labels

**Status:** Accepted
**Date:** 2026-10-20
**Story:** `engineering-team/stories/105-book-record-labels.md`
**Prepares:** story 106 (search moves to Brainstorm's search relay)

## Context
Unbnd is moving its search from its own Meilisearch to Brainstorm's search relay (`wss://search.brainstorm.world`). The relay answers a NIP-50 search combined with ordinary filters, and ordinary filters match single-letter tags only. Unbnd filters search by genre (a raw tally of separate tag assertions, built into each search document by `buildBookDocument`), format and language (multi-letter tags on the record). None can be a relay filter today. NosFabrica's position is that tag consensus is the app's to compute.

## Decision
1. **NIP-32 labels on the book record.** Three namespaces, each with its `L` tag and one `l` per value:
   - `ink.unbnd.genre`: the applied genre slugs.
   - `ink.unbnd.format`: the record's `format`.
   - `ISO-639-2`: the record's `lang` (Open Library's codes are MARC codes, the ISO 639-2 bibliographic set).
   A relay filter on `#l` then narrows a search, and paging stays the relay's. Reverse-domain namespaces keep Unbnd's genre vocabulary from colliding with any other list's labels.
2. **One labelling function.** `bookLabels({ genres, format, language })` in `@unbnd/schemas` returns the tags, sorted, so equal facets give equal tags. `withBookLabels(tags, labels)` replaces the three namespaces in a tag list and keeps every other tag in place.
3. **Applied genres come from the shared builder.** `appliedTags(taxonomy, assertions)` is extracted from `buildBookDocument` into `@unbnd/search` and used by both, so the index and the labels cannot disagree.
4. **The promoter labels.** `apps/promoter` already holds the librarian key and runs every five minutes. A `labels` command (beside `reveal`, in the same image) reads the catalog (`#z` books), the `book-tags` taxonomy and the `book-tag-assertions` from Unbnd's relay; for each book whose labels differ from what it carries, it republishes the record: same content, tags through `withBookLabels`, `created_at = max(now, previous + 1)`, signed by the librarian, and published to Unbnd's relay and the hub, as promotions are. A failure on one book is counted and the pass goes on. A separate crontab line keeps a stuck pass from holding up promotions.
5. **A republish builds on the hub's current version.** The snapshot taken at the start of a pass can be minutes old by the time a book's turn comes, and a demotion, a seeder update or a year correction may have replaced the record meanwhile. So the pass reads the record again from the hub and from Unbnd's relay (`authors: [librarian]`, `#d`, `#z` books) just before signing, since a demotion whose hub publish failed lands only locally; it takes the newest version, skips it if delisted, and otherwise relabels that version. It stops before writing anything when the book list, the `book-tags` list or the assertions read empty. The tag list is read from the librarian alone (the seeder is its only writer) everywhere a tag is applied: the labels pass, the indexer, the live reindex in the API and the promoter, the API's tag routes and unfurl, and the shelves worker, so the librarian never signs a genre someone else invented and every reader agrees.
6. **First-added date.** Replacing a record needs a newer `created_at`, so every relabel moves a book to the front of a list sorted by event date, which is how "Recently added" was read (`GET /api/books`, a relay `limit` over the newest events). The pass stamps `["added", "<unix seconds>"]` from the record's own `created_at` the first time it republishes a record without one; `withBookLabels` keeps it from then on. The shelves worker computes a `recent` shelf, newest `added` first (falling back to `created_at`), caches it with the others, and `GET /api/books` without slugs serves that list, falling back to the relay read when the cache has none. A writer that rebuilds a record from scratch (the seeder on a new epoch) drops `added` and dates the book anew, as it did before this ADR; the planned Open Library import must carry `added` forward.
7. **Records the seeder writes carry format and language labels.** `toBookRecordEvent` appends `bookLabels({ genres: [], format, language })`. Genre labels are the pass's alone; a seeder republish that drops them is restored on the next pass.

## Alternatives rejected
- **Filter search results inside Unbnd.** Breaks paging: a page of twenty can hold two matches.
- **`t` tags for facets.** `t` already carries the slug, and hashtags have no namespace, so a genre slug and a language code could collide.
- **Labels as separate kind 1985 events.** The relay filters the record itself; a separate label event cannot narrow a search over records.
- **Live labelling from the API on each tag change.** The API never holds the librarian key. The cost is that a new genre tag reaches the labels within one pass, up to five minutes.

## Consequences
- The first pass republishes every record that lacks labels: about 11,300 events to the hub.
- Brainstorm's book view and any other client can read a book's genres from the record.
- After story 106, search reflects a tag change within one labels pass instead of immediately.
- "Recently added" refreshes with the shelves worker (hourly) instead of on every read.
- The pass holds the catalog, its tags and their assertions in memory: fine at 11,300 books, to be reworked into pages before the 160,000-book import.
