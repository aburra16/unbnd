# Story 105: Book records carry their facets as labels

**Origin:** the move of Unbnd's search to Brainstorm's search relay (operator, 2026-10-20). NosFabrica's answer: tag consensus stays with the app; the relay filters on single-letter tags and pages results.

## Problem
Unbnd's search filters by genre, format and language. Those facets are not filterable on the book record as it stands:

- **Genre** lives in separate list items (readers' tag assertions over the `book-tags` list); the indexer tallies them into each book's search entry, which only Meilisearch sees.
- **Format and language** are tags on the record (`format`, `lang`), but a relay filter matches single-letter tags only, and the search relay ignores a `language:` option in the search string (tested 2026-10-20).

So a search answered by the relay cannot be filtered, and filtering after the search would break paging. Brainstorm's own book view has no genre on a book either.

## Acceptance criteria
1. **Labels on the record.** A book record carries NIP-32 labels for its facets: `["L","ink.unbnd.genre"]` with one `["l","<genre slug>","ink.unbnd.genre"]` per applied genre; `["L","ink.unbnd.format"]` with `["l","<format>","ink.unbnd.format"]`; and, when the record has a language, `["L","ISO-639-2"]` with `["l","<code>","ISO-639-2"]`.
2. **Applied genres are today's search genres.** The same rule the index uses: raw consensus per book, net count above zero, genre-type tags only, accusatory tags never.
3. **A labels pass keeps them current.** A promoter entrypoint (`node labels.js`) reads the catalog, the tag list and the assertions, computes each book's labels, and republishes only records whose labels differ. A republish keeps every other tag and the content exactly, replaces only labels in these three namespaces, and is dated `max(now, previous + 1)`. It runs from the documented crontab and as a Staging ops task.
4. **New records are born labelled.** The seeder's record template carries format and language labels from the record's own fields; genre labels arrive on the next pass.
5. **Nothing reading a record changes.** The API, indexer and search document ignore the labels; Brainstorm's book view shows undeclared tags only where its header asks.

## Out of scope
- Switching search to the relay (story 106, waiting on how the relay pages).
- Trust-weighted genres. The index has never weighted tags by trust, and the labels keep that.
