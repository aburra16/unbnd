# ADR 0095: A NIP-50 search provider, loading results ahead

**Status:** Accepted; §6 superseded by ADR 0100 (Meilisearch retired)
**Date:** 2026-10-20
**Story:** `engineering-team/stories/106-search-relay.md`
**Builds on:** ADR 0013 (the provider seam), ADR 0035 (trust-weighted search), ADR 0094 (labels on records)

## Context
ADR 0013 kept every backend detail behind `SearchProvider` so a backend swap is one adapter and a setting. The backend now is Brainstorm's search relay, a NIP-50 relay over Vespa. Tested on 2026-10-20: it ranks title and author matches well; it combines a text search with tag filters (`#z`, `#l`); a `REQ` without `include:spam` or `observer:<hex>` in its search string is closed as auth-required; an `offset` field, `offset:` and `page:` options are ignored; and paging by `until` skips results, because the order is relevance and not date. Results with equal rank can also come back in a different order from one request to the next.

## Decision
1. **`Nip50Provider` in `packages/search/src/nip50.ts`**, the only file that knows NIP-50 search strings. It takes the relay query as an injected function (the API passes its checked relay read, so a failed read throws rather than looking empty) and the librarian's key, which names the list it searches.
2. **One ranked window per query.** `search` asks for `{ kinds: [39999], authors: [librarian], "#z": [books], search: "<q> include:spam", limit: 100 }` plus `"#l": [genre]` when a genre filter is set, and keeps the resulting list for two minutes under the query and filters (at most 500 queries kept). Each page is a slice of that list, so the pages of one search agree. `total` is the list's length, and `capped` is true when the list is full.
3. **What counts as a hit.** The librarian's newest version per slug, not delisted, not junk, parsed by the schema; format and language filters match the record within the list. The year is `credibleYear` (ADR 0091).
4. **Scores from rank.** The hit at position `i` of `n` scores `(n − i) / n`, so the trust blend keeps its meaning.
5. **Writes do nothing.** `index`, `delete`, `deleteAll` and `configureIndex` resolve without effect: the relay indexes the records on the hub itself.
6. **The switch is configuration.** The API's `SEARCH_PROVIDER` and `SEARCH_URL` come from `.env`; Staging ops `search-relay` sets them to `nip50` and `wss://search.brainstorm.world`, and `search-meili` sets them back. The promoter and the indexer are pinned to Meilisearch in the compose file (they read the same `.env`, and would otherwise follow the API and fail without the relay read). While the relay serves search, the API's index-on-write goes to the relay provider and does nothing, so tag changes reach Meilisearch only on the nightly rebuild; `search-meili` therefore rebuilds Meilisearch as it switches back.
7. **ISBN as a NIP-73 identifier.** The relay does not match ISBN text, and `isbn` is a multi-letter tag no relay filters on. So the record carries `["i","isbn:<13 digits>"]` (NIP-73, the standard book identifier), written by `bookLabels` (record template and labels pass, ADR 0094), and `isbn13Of` turns an ISBN-13 or ISBN-10 query into an exact `#i` lookup with `search: "include:spam"`.
8. **Answers from someone else's relay are checked.** The adapter takes a `verify` function and drops any event whose signature fails (the API passes nostr-tools `verifyEvent`); the API's checked read treats `CLOSED` as a failed read instead of waiting out the timeout; identical searches in flight share one read and a failed read is not kept; `key:value` options typed by a reader are removed, and the text is capped at 200 characters.

## Alternatives rejected
- **Paging by `until`.** It skips better matches that are newer.
- **A fresh window for every page.** Equal-rank results can reorder between requests, so pages could repeat or skip books.
- **A query to the relay per page with a growing `limit`.** Same reordering problem, and more traffic.

## Consequences
- A search shows at most its top 100 results.
- A book's search entry follows the hub: a label, year or delisting reaches search once the relay has the new record.
- The provider holds up to 500 recent result lists in the API's memory, about 100 short hits each.
- A page loaded more than two minutes after the previous one comes from a new list, which can differ where results share a rank; a delisting can show in search for up to two minutes.
- The first labels pass after deploy adds the ISBN identifier to every record that has an ISBN, another republish of most of the catalog.
