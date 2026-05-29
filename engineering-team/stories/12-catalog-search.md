# Story 12: Catalog search (provider-agnostic)

**Status:** Approved
**Created:** 2026-05-29
**Type:** Feature

## Background

The catalog is browsable by genre but not searchable — the hero/nav search box is inert. Meilisearch is already deployed (`search` service, `http://search:7700`) and there's a clean seam from cycle 2: a `SearchProvider` interface, a `resolveProvider(config)` factory keyed on `SEARCH_PROVIDER`, a `MeiliProvider` (health-only so far), and a throwing `vespa` stub. This story makes search work **on that seam**.

**Operator constraint (load-bearing):** brainstorm.world is migrating Meili → **Vespa** soon. Search must be built so swapping providers is a near-trivial, low-blast-radius change: implement one adapter, flip one env var. **No Meili specifics may leak outside the Meili adapter.** This is a first-class acceptance criterion, not a nice-to-have.

## User-facing description

As a reader, I want to search the catalog by title and author (and subjects) from the search box and get a ranked list of matching books I can open — so I can find a specific book without browsing genres.

## Acceptance criteria

- [ ] AC-1: `GET /api/search?q=…&limit=&offset=` returns ranked book matches (title/author/subjects) as provider-neutral, PublicBook-shaped hits. Public, read-only. Empty/short `q` returns an empty result honestly (no error).
- [ ] AC-2: The web search box performs a search and shows results (a search view/route), each linking to the book; loading, empty-query, and no-results states read honestly. No fabricated results.
- [ ] AC-3 — **provider-agnostic (headline):** all search code outside the adapter depends ONLY on a provider-neutral interface (`SearchProvider`) and neutral domain types (`SearchDocument`, `SearchQuery`, `SearchResult`). **No Meili SDK/type/field/HTTP detail appears anywhere except `apps/api/src/search/meili.ts`.** Adding a Vespa provider = implement the interface + set `SEARCH_PROVIDER=vespa`; **zero changes** to routes, the indexer, or the web. Enforced by an automated architecture check (no `meili` imports/strings outside the adapter) + the `resolveProvider` factory.
- [ ] AC-4: An **indexer** maps catalog books → `SearchDocument` and loads them through `provider.index()`. Idempotent and re-runnable (re-indexing is stable, no dupes). Runs on the droplet (one-shot/cron), reading books from the local relay (the same source the read paths use).
- [ ] AC-5: Index settings (searchable fields, ranking, filterable attributes) are applied **through the provider interface** (a `configureIndex`/settings method), not ad-hoc provider calls scattered in app code — so the equivalent setup for Vespa is one adapter method.
- [ ] AC-6: No new hard dependency on a provider SDK in shared/business code. If the adapter uses a client lib it stays inside the adapter; raw HTTP (as the current `MeiliProvider.health()` does) is preferred to keep the swap mechanical and deps minimal.
- [ ] AC-7: Verified live on staging: index the seeded catalog, then a query (e.g. an author or title) returns the expected books through `/api/search` and in the UI.

## Out of scope / carry-forward

- **GrapeRank / trust-weighted ranking** — later; ranking is provider-default relevance for now.
- Faceted/filtered search UI (genre/format filters) — basic; richer filtering later.
- Searching users/curators; semantic/vector search.
- Index-on-write (live incremental indexing) — batch re-index for now; incremental later.
- The actual **Vespa adapter** — this story proves the seam with Meili; Vespa is a future drop-in.

## Open questions (for the ADR)

1. **Index source + trigger.** Batch indexer job (one-shot/cron, like the seeder) reading the local relay (recommended — consistent with reads, re-runnable) vs index-on-write vs Neo4j as source.
2. **Where the indexer lives.** Extend `apps/seeder`, a new `apps/indexer`, or an API admin route — and how it runs in compose (a `profiles:` job like `seed`).
3. **Document shape + field roles.** Which fields are searchable (title, authorName, subjects, blurb?) vs filterable (genre/format) vs displayed.
4. **Endpoint + result shape.** `q/limit/offset`, optional genre filter; hits as `PublicBook` (+ score?).
5. **Adapter transport.** Raw HTTP (matches existing `MeiliProvider`, fewest deps) vs the Meili JS SDK (confined to the adapter regardless).

## Linked artifacts

- ADR: `engineering-team/decisions/0013-catalog-search.md`
- Builds on: ADR 0002 (search provider seam), cycle-2 `SearchProvider`/`resolveProvider`/`MeiliProvider`.
