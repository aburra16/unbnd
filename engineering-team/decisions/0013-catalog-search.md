# ADR 0013: Catalog search (provider-agnostic, Meili first)

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/12-catalog-search.md`

## Context

Make the catalog searchable on the existing cycle-2 seam (`SearchProvider` interface, `resolveProvider(config)` factory, `MeiliProvider` health-only, throwing `vespa` stub). **Hard constraint:** Meili → Vespa migration is coming; swapping providers must be "implement one adapter + flip `SEARCH_PROVIDER`," with **no Meili specifics outside the adapter** and **zero changes** to routes/indexer/web. Enforced by an architecture test.

## Decision

### Provider-neutral domain types (`apps/api/src/search/types.ts`)
- `SearchDocument` — the indexed book, neutral: `id (=slug), title, authorName, isbn13?, subjects[], tags[] (applied non-accusatory tag NAMES), blurb?, genreSlugs[], format, language?, publishYear?, coverUrl?, openLibraryId?`.
- `SearchQuery` — `{ q, limit, offset, filters?: { genre?, format?, language? } }`.
- `SearchResult` — `{ hits: SearchHit[], total, offset, limit }`; `SearchHit` = PublicBook-shaped (+ optional `score`). No provider fields.

### Extended `SearchProvider` interface (neutral)
```
health(): ProviderHealth
configureIndex(): Promise<void>      // searchable order + weights, filterable attrs, typo tolerance
index(docs: SearchDocument[]): Promise<void>   // upsert by id; idempotent
deleteAll(): Promise<void>           // for a clean re-index (optional)
search(q: SearchQuery): Promise<SearchResult>
```
All field roles/ranking/transport live **inside** the adapter.

### `MeiliProvider` (`search/meili.ts`, the ONLY Meili-aware file)
- Raw HTTP (no SDK — matches existing `health()`, keeps the swap mechanical, zero deps to remove later).
- `configureIndex`: searchable attributes **in importance order** `title, authorName, subjects, tags, blurb`; `isbn13` searchable (exact); filterable `genreSlugs, format, language, publishYear`; typo-tolerance default-on; (synonyms: a small starter map, easy to extend — follow-up).
- `index`: POST documents (Meili upserts by primary key `id`) — idempotent re-index, no dupes.
- `search`: POST `/indexes/books/search` with `q`, `limit`, `offset`, `filter`; map Meili hits → neutral `SearchResult` (PublicBook-shaped).

### Architecture guard (AC-3)
A test asserts no file under `apps/api/src` **except `search/meili.ts`** references `meili`/`getmeili`/`7700`/Meili-only response fields. New providers (Vespa) add their own adapter file; the guard generalises (only the matching adapter may know its backend).

### Indexer (`apps/indexer`, new — separation from the seeder)
- One-shot/cron job (compose `profiles:["index"]`, like `seed`). Reads books from the **local relay** (`queryEvents` books concept — same source as reads) + the tag assertions, builds `SearchDocument`s (resolving applied non-accusatory tag names + genre slugs via the existing `aggregate` logic), then `provider.configureIndex()` + `provider.index(docs)` in batches. Idempotent/re-runnable. Logs counts.
- Reuses `resolveProvider(config)` — the indexer is provider-neutral too.

### API (`routes/search.ts`, public, read-only)
- `GET /api/search?q=&limit=&offset=&genre=` → `resolveProvider(config).search(...)` → `SearchResult`. Empty/short `q` (<2 chars) → empty result (no error). 503 if search unconfigured.

### Web — dropdown + results page (both hit `/api/search`)
- `api.search(q, {limit, offset, genre?})` client.
- **Instant dropdown** on the hero/nav search box: debounce ~200ms, min 2 chars, abort in-flight on each keystroke, show top ~6 hits (cover + title + author) → click → book detail.
- **Enter / "See all results"** → `/search?q=` route: full results grid, paginated (limit/offset), loading/empty/no-results states. Honest — no fabricated hits.
- Nothing Meili-specific reaches the browser; the client only knows `/api/search`.

## Options considered
- **Raw HTTP adapter (chosen)** vs Meili JS SDK — SDK would be a dependency to excise at the Vespa swap; raw HTTP matches the existing provider and keeps the swap mechanical. (If ever used, an SDK stays inside the adapter.)
- **Index source: local relay (chosen)** vs Neo4j vs index-on-write — relay is the same source the read paths use (consistency), and a re-runnable batch indexer is simplest. Index-on-write is a later optimisation (carry-forward).
- **Indexer as a new `apps/indexer` (chosen)** vs extending `apps/seeder` — separation of concerns; both run as compose profile jobs.
- **Applied tag names in the index (chosen)** vs intrinsic OL metadata only — community taxonomy terms materially improve recall and are on-theme; accusatory tags excluded (mirrors read-time hiding). Cost: index staleness until re-index (acceptable for batch).

## Consequences
- Search works over the seeded catalog and improves as the community tags books (after re-index). The Vespa migration is a contained adapter + env flip, guarded by a test. New `apps/indexer` image + a compose profile job + a droplet cron/one-shot to (re)index. No schema/PRD change. New dep: none in business code (raw HTTP).
- Index goes stale between indexer runs (tags/new books) until re-run — fine for now; index-on-write later.

## Out of scope
GrapeRank/popularity ranking; faceted filter UI beyond a basic genre filter; user/curator search; semantic/vector search; the Vespa adapter itself; index-on-write.

## Implementation notes (staged sub-PRs)
1. **provider core** — `search/types.ts` (neutral) + extended `SearchProvider` + `MeiliProvider` (`configureIndex`/`index`/`search`, raw HTTP) + unit tests (mock fetch) + **architecture guard test**.
2. **indexer** — `apps/indexer` (relay → `SearchDocument` incl. applied tag names) + esbuild Docker image + compose `profiles:["index"]` + tests (mapping incl. accusatory exclusion).
3. **search API** — `routes/search.ts` + `index.ts` wiring + tests (mocked provider).
4. **web** — `api.search`, debounced dropdown on the search box, `/search` results route + states; smoke tests.
Then build images, index the droplet catalog, verify `/api/search` + UI live (AC-7).
