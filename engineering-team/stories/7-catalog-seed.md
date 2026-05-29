# Story 7: Seed the book catalog (Open Library → DLists)

**Status:** Draft
**Created:** 2026-05-29
**Type:** Feature

## Background

Staging has a working rating loop for both tiers, but the catalog is a single hardcoded fixture (*Orbital*). To make staging a real, browsable product we need real books. DLists are the bridge from non-nostr source data into nostr: a real book becomes a kind-39999 `BookRecord` DList event (word-wrapper JSON, z-tag to a parent concept header), signed by the librarian/house identity and published to a relay. The `@unbnd/schemas` package (cycle 1) already encodes this shape; this story builds the **import job** that produces and publishes the events.

Per the operator's direction:
- The canonical DLists live on the **dcosl relay** (a shared/curated relay).
- The droplet's local strfry **syncs from dcosl**, so the app's read path (already pointed at the local relay) is unchanged — books flow dcosl → local strfry → app/Neo4j.
- The import is **long-running**, so it runs as a **job on the droplet**, resilient to the operator's machine being off.
- First seed is a **curated subset (~1–5k books)** from Open Library — real and browsable, not the full corpus.

This story produces the data and the sync; replacing the UI fixtures with live reads (story 8) and search indexing (story 9) follow.

## User-facing description

As the Unbnd operator, I want a resumable job on the droplet that imports a curated set of real books from Open Library, turns each into a librarian-signed kind-39999 `BookRecord` event published to the dcosl relay (with the concept headers it needs), so that the local strfry syncs them and the catalog becomes real data rather than a fixture.

End state a reader will eventually see (via story 8): a real catalog of books instead of the one demo title. This story is the data foundation; success is "the events exist on dcosl, are synced to the local strfry, and are queryable."

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: A job (runnable on the droplet) imports a curated subset of real books from Open Library and, for each, builds a kind-39999 `BookRecord` event via `@unbnd/schemas` (correct d-tag, word-wrapper JSON, z-tag to the books concept header), signed by the librarian identity.
- [ ] AC-2: The required concept header(s) — at minimum the kind-39998 **book-records** header (and any genre headers the records reference) — are seeded (librarian-signed) on dcosl, with items z-tagged to them.
- [ ] AC-3: Events are published to the **dcosl relay**, and the local strfry **syncs** them so they are queryable through the existing local read path (the same path ratings use).
- [ ] AC-4: The job is **idempotent** — re-running it republishes the same replaceable events (same d-tag) without creating duplicates; the catalog count is stable across re-runs.
- [ ] AC-5: The job is **resumable** — it checkpoints progress and, if interrupted (restart/crash), continues from where it left off rather than restarting the whole import.
- [ ] AC-6: The job **rate-limits** its publishing (does not flood dcosl) and **logs** progress (counts, errors) to the droplet so it can be monitored without the operator's machine.
- [ ] AC-7: The job runs **on the droplet** (a container / one-off service), not the operator's laptop; shutting down the operator's machine does not stop it.
- [ ] AC-8: A spot check confirms the data is real and well-formed: a sampled book's event parses back via `fromBookRecordEvent` to its source fields (title, author, ISBN/year/etc.), and querying the local relay for the book-records returns the seeded set.

## DList shapes touched

- `kind:39999` — `bookRecord` items (**created + published**), via the cycle-1 `@unbnd/schemas` `BookRecord` builder.
- `kind:39998` — the **book-records** concept header (and genre header(s)) the records z-tag to (**created + published**), via `buildBookRecordsHeaderAddress` etc.

## Out of scope

- Replacing the web fixtures with live reads (book detail / home / genre browse off real data) — **story 8**.
- Search indexing into Meilisearch — **story 9**.
- Genre tagging, quality signals, ratings seeding — separate concerns / user-generated.
- The full Open Library corpus — this is a curated subset; scaling up is later.
- GrapeRank / trust-weighting.
- Author claiming / submission flow (PRD §4.3) — later.

## Open questions

Resolved with the operator / in the ADR.

1. **dcosl relay URL + write policy.** The `ws(s)://` endpoint, and whether it gates writes (owner/WoT allowlist). If it does, the **librarian key must be authorized** there — which forces the parked librarian-identity decision (a throwaway staging key may be rejected by a shared relay).
2. **Open Library source.** Bulk dumps (gz JSON/TSV) vs the search/works API; how the curated subset is selected (popular/awarded titles, specific genres, a seed list).
3. **Sync mechanism.** How the local strfry pulls from dcosl — strfry `sync` (negentropy) on a timer, a router/stream config, or a one-shot backfill + ongoing stream.
4. **Checkpoint store.** Where resumable progress lives (a file on a droplet volume, a Postgres table, the relay itself).
5. **Slug / identity.** How a book's stable `d-tag`/slug is derived (Open Library work id, ISBN-13, normalized title) so it's deterministic and idempotent.
6. **Job runtime.** A dedicated container in the prod compose (one-shot/`profiles`) vs a `docker run` detached job vs a scheduled unit — and how it gets the librarian nsec without committing it.

## Linked artifacts

- ADR: `engineering-team/decisions/0008-catalog-seed.md`
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
