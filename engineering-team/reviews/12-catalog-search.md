# Review: Story 12 — Catalog search (provider-agnostic)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** five staged PRs — #23 provider core, #24 `@unbnd/search` package + indexer, #25 search API, #26 web UI, #27 indexer pagination fix (+ this closeout with nav search). All CI-green; verified live on staging.

## Quality gates

- [x] `pnpm -r typecheck` — pass (5 workspaces incl. new `@unbnd/search`, `@unbnd/indexer`).
- [x] Tests: `@unbnd/search` 11, `@unbnd/indexer` 6, `@unbnd/api` 220 (+ repo-wide architecture guard), `@unbnd/web` 39. Builds clean.
- [x] CI green on every merge; staging auto-deploy green; indexer image built in the matrix.

## AC status

- [x] **AC-1** `GET /api/search?q=&limit=&offset=&genre=` → ranked, provider-neutral, PublicBook-shaped hits. Short `q` → empty (200). **Verified live** (author/title queries).
- [x] **AC-2** Web search: debounced as-you-type dropdown (top 6) + `/search` results page; loading/empty/error states; no fabricated hits. Operator-confirmed in-browser. Nav search added (subtle, compact, hidden < 860px).
- [x] **AC-3 (headline — provider-agnostic)** All search code depends only on `@unbnd/search`'s neutral surface. A repo-wide **architecture guard test** fails CI if Meili API specifics appear outside `packages/search/src/meili.ts`. The provider name stays at the seam (config enum + `resolveProvider`). Vespa swap = add `vespa.ts` + flip `SEARCH_PROVIDER`, zero changes elsewhere.
- [x] **AC-4** `@unbnd/indexer` reads books + taxonomy + assertions from the local relay, builds neutral `SearchDocument`s, `configureIndex()` + `index()`. Idempotent; paginates past the relay's 500 cap (fixed in #27 — 1960/1960 indexed live).
- [x] **AC-5** Index settings (searchable order, filterable attrs) applied via the adapter's `configureIndex()`, not scattered calls.
- [x] **AC-6** No provider SDK in business code — raw HTTP in the adapter only.
- [x] **AC-7** Verified live: 1960 docs indexed; `/api/search` returns books for author/title; **typo tolerance** works (`gatsbey` → The Great Gatsby); short-query guarded. UI dropdown + results page confirmed by operator.

## Crypto / safety
- No signing involved; search is read-only and public. No fake data — relevance is provider-default; no trust/popularity ranking yet.

## Notes / carry-forward (in build-status memory)
- **ISBN search** is wired (searchable field) but the OL-seeded *works* rarely carry ISBN-13 (edition-level data) — effectively dormant until ISBN-bearing records exist. Not a bug.
- **Index staleness** — re-run the indexer after re-seeds / to refresh community tags (runbook updated). Index-on-write is the future upgrade.
- **Tags in search** (surface matching genre/community tags above the book list) — logged as a future story.
- GrapeRank/popularity ranking; faceted filter UI; the Vespa adapter — deferred per ADR.

## Verdict
**PASS** — the catalog is searchable end-to-end (API + indexer + web), verified live, and the Meili→Vespa swap is a guarded one-adapter change (the operator's load-bearing constraint). Story marked Done.
