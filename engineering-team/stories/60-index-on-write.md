# Story 60: Index-on-write — incremental, best-effort search index updates on live API writes

**Status:** In progress
**Created:** 2026-06-05
**Type:** Hardening

## Background

PRD §2.11 (Block E — Hardening, Lane 1) lists the one unbuilt index-freshness bullet:

> **Index-on-write:** publishing a book/rating/tag via the API updates the search index immediately or via a near-real-time queue, instead of a batch `apps/indexer` re-run.

Today the only way a live write reaches search is the **batch indexer**: an operator runs `docker compose --profile index …`, which reads every catalog event off the relay, rebuilds the documents, flushes the index, and re-upserts the whole set. Between batch runs, search and genre-browse are stale: a freshly applied genre tag or a freshly promoted submission does not appear until someone re-runs the batch. This story closes that gap on the **live API path** without touching the batch indexer (which stays as the full-rebuild source of truth and the bulk-seed path).

The survey below maps the real code so the acceptance criteria are grounded. The headline architectural facts are: (a) the search document is built by a pure function in `apps/indexer`, not a shared package; (b) the API already holds a `SearchProvider` and can write to it via `index([doc])`; (c) **promotion does not happen inside an API request** — it runs in a separate worker process (`apps/promoter`) fired by an operator cron; (d) genre/tag membership in a search document is **raw** consensus, not trust-weighted, so the incremental path must match the batch path's raw semantics (CLAUDE.md invariant #3 — filter at view time; the trust-weighted view is a query-time rerank, never baked into index membership).

### What a search document contains (which writes can change it)

`packages/search/src/types.ts` — `SearchDocument` (provider-neutral, ADR 0013):

```
id (= book slug), title, authorName, isbn13?, subjects[], tags[], genreSlugs[],
blurb?, format, language?, publishYear?, coverUrl?, openLibraryId?
```

`tags` are **applied community tag NAMES** (non-accusatory) and `genreSlugs` are the **applied genre slugs** for filtering. Only a write that changes one of these fields needs to touch the index.

### How a document is built (the logic to reuse, not reimplement)

`apps/indexer/src/build-documents.ts` — `buildSearchDocuments(bookEvents, taxonomyEvents, assertionEvents, currentYear)`:

- Parses each book record; **skips junk** via `isJunkRecord(rec, currentYear)` from `@unbnd/schemas` (Story 56 / ADR 0055 — positive junk is never indexed).
- Resolves each book's applied tags from the assertion consensus with the **same read-time rules the API uses**: dedup by `(author, book, tag)` keeping the latest, net polarity per `(book, tag)`, drop net ≤ 0, drop accusatory-sensitivity tags. A tag whose taxonomy `type === "genre"` also contributes its slug to `genreSlugs`. **This is RAW consensus — no trust weighting.**

This is a pure function; the incremental path must reuse its per-book logic so the live doc and the batch doc are byte-identical for the same inputs. Note `buildSearchDocuments` and `isJunkRecord` live where they can be reused: `isJunkRecord` is already exported from `@unbnd/schemas`; `buildSearchDocuments` currently lives **inside `apps/indexer`** (an app, not a package), and the API does **not** depend on `@unbnd/indexer` today (it depends on `@unbnd/schemas` + `@unbnd/search`). Making the per-book builder callable from the API/promoter is an Architecture question (extract a per-book helper into a shared package vs. depend on the indexer app) — see Open questions.

### The provider write surface (can the consumer write?)

`packages/search/src/index.ts` + `types.ts` expose the `SearchProvider` interface: `configureIndex()`, `index(docs)` (upsert by id, idempotent), `deleteAll()`, `search(query)`. The API already **reads** through a resolved provider — `apps/api/src/index.ts` calls `resolveProvider({ provider: config.searchProvider, … })` and injects it into `buildSearchRouter` (`apps/api/src/routes/search.ts`, which only calls `provider.search`). The provider can **write**: `provider.index([oneDoc])` upserts a single document by `id` (slug), idempotently — exactly the incremental primitive this story needs. `provider.deleteAll()` is the batch-only flush and is **not** part of the live path.

### The API write paths that could affect search — verdict per write type

- **Tag/genre assertion** — `apps/api/src/routes/tags.ts`, `POST /api/tags` (and the sovereign template path). Publishes a kind-39999 `bookTagAssertion`. **Affects the doc: YES.** A net-positive genre/style assertion changes the book's `tags` and (for `type === "genre"` slugs) its `genreSlugs` — the exact fields `buildSearchDocuments` derives from the assertion consensus. A dispute that flips a tag from net-positive to net ≤ 0 must likewise drop it from the doc. This is the primary index-on-write target.
- **Submission promotion** — enqueued by `apps/api/src/routes/submissions.ts` (`POST /api/submissions/:slug/promote` → `enqueuePromotion`), but **executed by a separate worker**: `apps/promoter` (`runPromotionCycle` → `mapSubmissionToCatalogRecord` → librarian-sign → publish a canonical kind-39999 BookRecord under `39999:<librarian>:<slug>`). **Affects the doc: YES** — promotion *creates a new book document* (a community-sourced catalog entry entering search). Critically, the promotion write is **not** in an API request; the index update for a promotion belongs in the **promoter worker after its durable publish**, not in the API route. (The bare submission write — `POST /api/submissions` — lands in the `book-submissions` concept, which is **not** the catalog and is **not** indexed, so it is out of scope.)
- **Rating** — `apps/api/src/routes/ratings.ts`, `POST /api/ratings`. Publishes a kind-39999 book rating. **Affects an indexed field: NO.** `SearchDocument` carries no rating/score field. Ratings influence ordering only through the **query-time** trust-weighted rerank (`apps/api/src/search/rerank.ts`), which reads ratings per page and blends a trust signal into the sort — it never mutates index membership or any indexed field. **Verdict: a rating write triggers no index update.** (This is also the correct POV-aware behavior per CLAUDE.md invariant #1/#3 — "the rating" is per-POV and computed on read.)

### The best-effort side-effect pattern to mirror

`apps/api/src/nostr/propagate.ts` — `withUpSync(localPublish, dcoslPublish, onError)` is the house pattern for "do the durable write, gate the response on it, then fire a best-effort side effect off the critical path." The local publish (source of truth) settles and is returned; the dcosl propagation is `void`-ed (never awaited, never rejects the caller), and failures are logged and left to a cron backstop. **Index-on-write must mirror this shape:** the durable relay publish succeeds and gates the user's response exactly as today; the index update fires *after*, never awaited by the response, with failures logged — the batch indexer is the backstop/source-of-truth rebuild.

### The batch indexer stays

`apps/indexer/src/run-index.ts` (`runIndex` — `configureIndex` → `deleteAll` → batched `index`) and `build-documents.ts` remain the **full-rebuild backstop** and the **bulk-seed** path. Index-on-write is the **live API/worker path only**; it does not replace, weaken, or change the batch rebuild.

## User-facing description

As a Reader (PRD §3.1) browsing and searching Unbnd, when a curator applies a genre/tag to a book or a curator promotes a community submission into the catalog, I want that change to show up in search and genre-browse promptly — without waiting for an operator to re-run the batch indexer — so the catalog feels live rather than stale between maintenance runs.

(There is no UI change. This is an index-freshness hardening: the same search/browse surfaces simply reflect recent writes.)

## Acceptance criteria

Testable from the outside / against the provider seam. The real test surface is the incremental doc-build (reusing `buildSearchDocuments`' per-book logic) and the best-effort hook, plus an end-to-end check that a write is reflected in a subsequent search without a batch run.

**Tag / genre assertion → incremental index update**
- [ ] Given a book already in the index, when a net-positive **genre** assertion is published via `POST /api/tags` (sovereign or custodial), then that book's indexed `genreSlugs` and `tags` are updated incrementally (via a single-document upsert through the `@unbnd/search` provider), and a subsequent `GET /api/search?q=…&genre=<slug>` returns the book **without any batch `--profile index` run**.
- [ ] Given a tag that was net-positive, when a dispute is published that flips its net polarity to ≤ 0, then the incremental update **removes** that tag/genre from the book's doc (the live doc matches what the batch builder would produce for the same events) — the path is not append-only.
- [ ] Given the incremental doc-build, when it runs for a book, then it produces a `SearchDocument` **byte-identical** to `buildSearchDocuments`' output for the same `(book, taxonomy, assertion)` events — the per-book logic is **reused, not reimplemented** (dedup by `(author, tag)`, net-positive wins, accusatory hidden, **raw** consensus — never trust-weighted).

**Junk is never indexed on write**
- [ ] Given a book record that fails `isJunkRecord(rec, currentYear)`, when a write that would touch its doc occurs, then **no index entry is created or updated** for it on the incremental path (the Story-56 read-time prune is honored identically to the batch path).

**Promotion → new book document**
- [ ] Given a submission is promoted, when the promoter worker durably publishes the canonical catalog BookRecord, then the promoter incrementally upserts that book's `SearchDocument` so the promoted book is findable via `GET /api/search` **without a batch run** (subject to the same junk filter). The index hook sits **after** the durable publish in the worker, never in the API promote route (which only enqueues).

**Ratings do not touch the index**
- [ ] Given a rating is published via `POST /api/ratings`, when the write succeeds, then **no index write occurs** (ratings change no `SearchDocument` field; ranking stays a query-time rerank). A test asserts the provider's write surface is **not** called on a rating publish.

**Best-effort, off the critical path (mirror `propagate.ts`)**
- [ ] Given the durable relay publish succeeds, when the index update is attempted and **fails** (provider down/throws/rejects), then the failure is **logged and swallowed** and the user's write still returns its normal success response — the index update never blocks, delays past the response, or fails the user write.
- [ ] Given the durable relay publish **fails**, when the write is rejected, then **no index update is attempted** (only locally-accepted writes update the index, mirroring `withUpSync`'s "on local success" guard).

**Invariants & gates preserved**
- [ ] Given the change, when the batch indexer is run, then `runIndex` (`configureIndex` → `deleteAll` → batched upsert) still works unchanged and remains the full-rebuild source of truth and the bulk-seed path; index-on-write does **not** run on the seeder/bulk path.
- [ ] Given the change, when the architecture guard test (`apps/api/test/search/architecture.test.ts`, ADR 0013) runs, then it stays green — no Meili/provider HTTP specifics leak outside `packages/search/src/meili.ts`; all index-on-write writes go through the neutral `@unbnd/search` `SearchProvider` surface.
- [ ] Given the change, when CI runs, then `pnpm -r typecheck`, `pnpm -r test`, and all package builds are green, with new unit tests covering: the incremental per-book doc-build (parity with `buildSearchDocuments`, incl. the dispute-flip and junk-skip cases), the best-effort hook (success path, failure-is-swallowed path, no-update-on-failed-publish path), and the no-op-on-rating assertion.
- [ ] Given the change, when reviewed, then there is **no web / UI change** and **no change to the `SearchDocument` shape** or the trust-weighted rerank.

## DList shapes touched

No new DList shape, no schema change. The writes that drive index-on-write are the **existing** kind-39999 events:

- `kind:39999` `bookTagAssertion` (genre/style tag apply/dispute) — already published by `POST /api/tags`. Drives incremental `tags`/`genreSlugs` updates via raw consensus.
- `kind:39999` BookRecord under the librarian `books` header — already published by the **promoter worker** on promotion. Drives an incremental new-document upsert.
- `kind:39999` book rating — published by `POST /api/ratings`. **Read-only for search** (no index write).

The only new artifact is the **index-update side effect** wiring (consumer-side), not a new event or field.

## Out of scope

- **Replacing the batch indexer.** `runIndex` + `build-documents.ts` stay as the full-rebuild backstop and source of truth.
- **Index-on-write for the bulk seeder path.** The seeder publishes thousands of records; it stays a batch-then-reindex flow. Index-on-write is the live API/worker path only.
- **Changing the `SearchDocument` shape** or adding fields (e.g. a rating column). The shape is fixed; this story only keeps existing fields fresh.
- **Trust-weighted ranking.** It is computed at query time in `apps/api/src/search/rerank.ts` and must stay there; index membership remains **raw** consensus (CLAUDE.md invariant #3).
- **Rating-driven index updates.** Ratings change no indexed field; per the survey verdict, a rating publish triggers no index write.
- **The bare submission write** (`POST /api/submissions`) — submissions live in a non-indexed concept; only **promotion** (the catalog entry) is in scope.
- **Re-deriving the index when a viewer switches POV.** Per-POV view is a read-time concern; nothing here precomputes per-POV index state.

## Open questions

For the Architect to resolve during the Architecture phase (the PO does not answer these):

1. **Immediate-inline-async vs. a near-real-time queue.** The PRD allows either ("immediately or via a near-real-time queue"). Decide: fire the single-doc upsert inline-but-unawaited (the simplest `propagate.ts` mirror), or push to a small in-process queue with debounce/coalescing (so a burst of assertions on one book collapses to one upsert). Inline-async is the default unless coalescing is warranted; pin the decision and its failure/retry story.
2. **Where the index-update hook sits.** Options: (a) in each route after the durable publish (tags route for assertions; promoter worker after its publish), or (b) factored into the shared publish/propagate dependency so any catalog-affecting publish can opt in. The promoter is a **separate process** from the API — the promotion hook necessarily lives in the worker, so a single shared hook must be reachable from both. Decide the seam.
3. **How the incremental per-book doc-build reuses `buildSearchDocuments`.** It currently lives inside `apps/indexer` (an app), and the API/promoter do not depend on `@unbnd/indexer`. Decide: extract a pure per-book builder (`buildOneDocument(bookEvent, taxonomy, assertionsForBook, currentYear)`) into a shared package (e.g. `@unbnd/search` or a new package) consumed by the indexer + API + promoter, or have the consumers depend on the indexer app. The constraint is **zero logic duplication** — the live doc and the batch doc must come from one implementation.
4. **Where the incremental build gets its inputs.** To rebuild one book's doc on an assertion write, the path needs that book's record event + the taxonomy + that book's assertion events. Decide whether to read them fresh from the relay at hook time (a small `#a`/`#z`-scoped query, like the existing per-book reads in `tags.ts`/`rerank.ts`) or to derive what's possible from the just-published event. Confirm the read is scoped (no full-catalog scan on every write).
5. **Raw-consensus parity (invariant guard).** Confirm the incremental path computes `genreSlugs`/`tags` from **RAW** tag consensus (net-positive, accusatory-hidden, dedup-by-author) exactly as the batch builder does — **not** trust-weighted — so search membership stays consistent between the live and batch paths and does not leak a POV into the shared index. (The API has a `TrustProvider`; it must **not** be consulted for index membership.)
6. **Deletion/demotion symmetry.** Story 30b covers promotion→demotion and there is an unrate/removal path (Story 28b). Decide whether index-on-write must also handle a book leaving the catalog (demotion) or a tag being fully withdrawn that empties a doc — at minimum the dispute-flip (tag removal) is in the acceptance criteria; clarify whether a demoted book must be removed from the index incrementally or left to the batch rebuild.

## Linked artifacts

- ADR: `engineering-team/decisions/0059-index-on-write.md` (to be written by the Architect).
- Relates to: ADR 0013 (search provider seam — the write goes through the neutral surface), ADR 0011 / `propagate.ts` (best-effort off-critical-path side-effect pattern this mirrors), Story 56 / ADR 0055 (`isJunkRecord` read-time prune — honored on the incremental path), ADR 0035 / Story 34 (`rerank.ts` — query-time trust ranking that stays out of the index), ADR 0031 / Story 30 (`apps/promoter` — where the promotion index hook lives), ADR 0009 (`bookTagAssertion` — the primary index-on-write trigger).
- Test plan: `engineering-team/stories/60-index-on-write.test-plan.md` (to be written in the Test-Design phase).
