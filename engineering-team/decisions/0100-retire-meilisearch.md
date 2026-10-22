# ADR 0100: Meilisearch is retired; Brainstorm's search relay is the only search backend

**Status:** Accepted
**Date:** 2026-10-22
**Story:** `engineering-team/stories/112-retire-meilisearch.md`
**Supersedes:** ADR 0013 (Meilisearch first; the provider switch), ADR 0059 (index-on-write), ADR 0095 §6 (Meilisearch stays the default, workers pinned to it)
**Supersedes in part:** ADR 0002 (the `search` service), ADR 0035 (the text score as Meilisearch's ranking score), ADR 0055 and ADR 0078 (removal from the search index), ADR 0096 (the indexer's paged walk)

## Context
ADR 0095 moved reader search to Brainstorm's search relay (NIP-50) and kept Meilisearch as the default and the fallback, with the nightly indexer, index-on-write and the promoter keeping it current. The relay has served staging since 2026-10-21, including the Open Library import's 159,000 books, which the relay indexes from the hub as they arrive. Meilisearch now costs 1.1 GB on the droplet and a nightly rebuild for a fallback no reader uses, and keeps a required secret and a provider switch in every configuration.

## Decision
1. **The relay is the search backend.** The API builds the relay provider directly from `SEARCH_URL` (default `wss://search.brainstorm.world`) and the librarian key. `SEARCH_PROVIDER` and `SEARCH_API_KEY` are no longer read.
2. **The provider seam stays, narrowed.** `SearchProvider` is `health` and `search`; the write methods (`configureIndex`, `index`, `delete`, `deleteAll`) go, since the relay indexes the hub itself. The text score in the trust blend (ADR 0035) is the relay's rank, `(n − i) / n`, as it has been since ADR 0095.
3. **No index writes.** The indexer app, index-on-write in the API (ADR 0059) and the promoter's reindex on promotion and the delete on demotion are removed. A promoted, demoted or relabelled book reaches search when its record changes on the hub and the relay indexes it; delisting (ADR 0078) already hides a book at read time.
4. **`@unbnd/search` keeps** the relay provider, the search types, `appliedTags` (the labels pass's applied-tag rule) and `forEachCatalogPage` (paged catalog reads, ADR 0096).
5. **Ops.** The `search` and `indexer` services leave compose; `docker compose up -d` does not remove a container whose service is gone, so a Staging ops task `retire-meilisearch` stops and removes `unbnd-search`. The `search` data volume is left for the operator to remove (DEPLOY.md). `install-cron` drops the 04:20 indexer line; it is run once after deploy so the crontab no longer calls a service that does not exist.

## Alternatives rejected
- **Keep Meilisearch as a cold fallback.** A fallback nobody exercises drifts: it was never filled with the imported catalog beyond the nightly rebuild, and switching to it would need a full reindex first. If the relay fails, the API's search degrades to an error state the web already shows.
- **Keep the switch for a future provider.** One adapter behind an interface is enough to add another later; a switch with one option is configuration without a choice.

## Consequences
- About 1.1 GB of memory and a nightly job freed on the droplet; one fewer secret.
- Search freshness follows the hub and the relay's indexing, not an immediate write.
- Search depends on NosFabrica's relay; there is no local fallback.
