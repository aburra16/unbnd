# Story 112: Retire Meilisearch

**Origin:** search has read Brainstorm's search relay since story 106 (live on staging since 2026-10-21); the operator asked to retire Meilisearch (2026-10-22).

## Problem
Reader search no longer touches Meilisearch, but the droplet still runs it (1.1 GB of memory), and three paths still keep it current: the nightly indexer, the API's index-on-write after tag writes (which under the relay provider makes three relay reads per write for nothing), and the promoter's index updates on promotion and demotion. `SEARCH_API_KEY` is still a required setting, and the docs still describe Meilisearch as the search backend. The fallback it offers (`search-meili`) would serve an index the import never filled past what the nightly run rebuilt.

## Acceptance criteria
1. **One search provider.** `@unbnd/search` keeps the relay provider, the search types, `appliedTags` and `forEachCatalogPage`. The Meilisearch adapter, the document builder, index-on-write and the provider switch are gone; the provider interface is health and search.
2. **No index writes anywhere.** Tag writes in the API and promotions, demotions and reveals in the promoter no longer reindex. The indexer app, its image and its nightly cron line are gone.
3. **Settings.** `SEARCH_API_KEY` and `SEARCH_PROVIDER` are no longer read. `SEARCH_URL` is the search relay, defaulting to `wss://search.brainstorm.world`.
4. **Compose and ops.** The `search` and `indexer` services and the search volume leave both compose files. The Staging ops tasks `index`, `search-relay` and `search-meili` are gone; `install-cron` no longer installs the indexer line; a new task `retire-meilisearch` stops and removes the running Meilisearch container. Removing its data volume is a separate command the operator runs.
5. **Docs.** ADR 0100 records the retirement and which parts of earlier ADRs it supersedes; DEPLOY.md, the data-layer doc, the sync runbook, README, AGENTS.md and CLAUDE.md describe the relay as the search backend.

## Out of scope
- What the relay search cannot do yet (a total past 100, format and language filters across the whole catalog, matching community tag names, search freshness): unchanged by this story, since readers already use the relay.
