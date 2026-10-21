# Story 106: Search reads Brainstorm's search relay

**Origin:** the operator's call (2026-10-20) that NosFabrica carries search for the apps built on it, Unbnd first. Story 105 put each book's facets on its record.

## Problem
Unbnd runs its own Meilisearch and an indexer that copies the catalog into it. Brainstorm already indexes the same records in its search relay (`wss://search.brainstorm.world`, NIP-50), and title and author searches there rank well (tested 2026-10-20). Two things stand between Unbnd and that relay:

- **Paging.** A relay pages by date (`until` the last event's `created_at`), but search results are ranked by relevance, so a date cursor skips results: the page after "Bear Island" left out four better matches that happen to be newer (tested 2026-10-20). NosFabrica's advice is to load results ahead.
- **Shape.** The relay returns events, with no score and no total.

## Acceptance criteria
1. **A NIP-50 search provider.** `SEARCH_PROVIDER=nip50` with `SEARCH_URL=<relay>` answers the API's search from the relay: kind 39999 records under the librarian's `books` list, signed by the librarian, text-matched, in the relay's order.
2. **Load ahead, page within.** The provider asks once for the top 100 results of a query and keeps them for two minutes, so pages of the same query come from one ranked list: nothing repeats and nothing is skipped. Past 100 results the answer says so (`capped`), and the search page reads "100+ results".
3. **Scores by position.** Each hit carries a score from its rank in the list, so the trust blend in search ordering works as before.
4. **Only real books.** A delisted record, a junk record, another key's record or an older version of a record never appears; the year shown follows the print-era rule.
5. **Filters.** A genre filter is a relay filter on the record's genre label (story 105); format and language are matched on the record within the list.
6. **A failed read is a failure, not "no results".** The search route answers 503 as it does today when the provider fails.
7. **A switch with a way back.** The compose file takes `SEARCH_PROVIDER` and `SEARCH_URL` for the API from `.env`; two Staging ops tasks set them (`search-relay`, `search-meili`) and recreate the API. Meilisearch and the indexer keep running until a later story retires them.

## Out of scope
- Retiring Meilisearch, the indexer and index-on-write (a later story, after the relay has carried staging search for a while).
- Results past the first 100 of a query.
