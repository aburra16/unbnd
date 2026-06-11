# ADR 0078: Promotion demotion — a delisted-state replace, one promotions state machine

**Status:** Accepted
**Date:** 2026-06-09
**Story:** `engineering-team/stories/80-promotion-demotion.md`

## Context
A promoted book is a librarian-signed `BookRecord` at `39999:<librarian>:<slug>` (z-tagged to the `books` concept). Promotion is a one-row-per-slug state machine: `promotions` (UNIQUE slug; `pending → promoting → done | failed`), written by the api (`enqueuePromotion`: INSERT, unique-violation → `already`), claimed by the off-path `apps/promoter` worker (`FOR UPDATE SKIP LOCKED`), which signs/publishes (local + dcosl) and reindexes on write. The #77 auto-promote sweep **skips any slug with any promotions status**. Catalog reads funnel through two parsers: `parseBook` (detail 404s on null; browse + `?slugs=` hydration filter nulls — homepage shelves and For-You hydrate through these) and `buildBookDocument` (null → not indexed; its callers already anticipate "demoted"). `reindexBook` deliberately has **no single-doc delete** (ADR 0059 Q6: the batch rebuild owns stale-row removal). The `SearchProvider` seam is `health/configureIndex/index/deleteAll/search`.

The Phase-2 #30b stub assumed a NIP-09 kind-5 deletion and named its load-bearing unknown: whether strfry/dcosl honor kind-5 for addressable records end to end. Since then #79 / ADR 0077 settled the removal idiom: **replace at the same addressable identity**.

Constraints: `LIBRARIAN_NSEC` only in the worker (the api enqueues); curator-gated + confirmed + audited + reversible; attached community data never deleted; no demote/auto-re-promote war.

## Decision

### 1. Wire mechanism: a librarian-signed DELISTED record replace (resolves OQ-1; kind-5 rejected)
The worker republishes at the record's own address `39999:<librarian>:<slug>` a minimal **delisting** event: tags `["d", slug]`, `["z", <books header>]`, `["delisted","true"]`, empty content, a `word/bookRecord`-typed payload carrying a `delisted: true` sentinel (no title/author — it is a tombstone, not a record). Kind 39999 is parameterized-replaceable, so this **replaces the canonical record at the relay** — the same mechanism promote itself relies on ("every run publishes under the SAME address... replace, not duplicate"). Kind-5 is rejected for the same reasons as in ADR 0077, plus the stub's own unknown: replace needs no relay deletion semantics at all.

New in `@unbnd/schemas` (mirroring the retraction pair): `buildBookDelisting({ slug, parentHeader })` + the predicate **`isDelistedRecord(event)`** (kind 39999 + `["delisted","true"]`, tag-level, no payload parse).

**Read seams (2 changes cover every surface):** `parseBook` and `buildBookDocument` check `isDelistedRecord` → return null. Detail (404), browse, `?slugs=` hydration, homepage-shelves/For-You hydration, index-on-write, and the batch indexer all inherit. (Both already return null on a failed parse — the predicate makes the behavior intentional rather than accidental.)

**Resurrection safety:** the only writers at a community record's address are the promoter worker (promote, demote) and nothing else (author overlays are separate events; the seeder owns disjoint seeded slugs). A re-promote publishes the full record with a newer `created_at` → replaces the delisting. Clean both directions.

### 2. Queue model: extend the ONE `promotions` state machine (resolves OQ-2; no sibling table)
One row per slug stays the single source of truth for "where is this slug relative to the catalog" — exactly what the promote gate, the demote gate, the #77 sweep, and the enriched submissions list all consult. `PromotionStatus` gains four states:

```
pending → promoting → done | failed            (promote, unchanged)
done → demote_pending → demoting → demoted | demote_failed   (demote)
demoted → pending                               (manual re-promote)
```

- **api `enqueueDemotion(slug, requestedBy)`** (db helper + `SubmissionsDeps`): `UPDATE promotions SET status='demote_pending', requested_by=<curator>, error=NULL, updated_at=NOW() WHERE slug=$1 AND status IN ('done','demote_failed')` → `{ status: "queued" }`; 0 rows updated → the slug is not a demotable promoted book (never promoted / in-flight / already demoted) → `{ status: "not_promoted" | "already" }` for the route to map. Only a `done` (or retriable `demote_failed`) promotion can be demoted — fail-closed, idempotent (AC-6: re-demote is a no-op).
- **worker**: `claimDemotePending()` mirrors `claimPending` (`demote_pending → demoting`, `FOR UPDATE SKIP LOCKED`, attempts++); `markDemoted(job, delistId)` (stores the delisting event id in `canonical_id`); `markDemoteFailed(job, reason)`. The demote cycle: claim → build `buildBookDelisting` → librarian-sign → publish local + dcosl → search delete (§3) → `markDemoted`. Fault-isolated per job, like promote.
- **#77 no-war for free:** the sweep skips any slug with **any** status; `demoted` (and every demote state) keeps it skipped. Zero changes to `evaluateAutoPromotions`. (AC-5.)
- **Manual re-promote (AC-6):** `enqueuePromotion` gains the demoted branch: on unique-violation, if the existing row's status is `demoted` → `UPDATE ... SET status='pending', requested_by, canonical_id=NULL, error=NULL` → `queued`; any other status → `already` (unchanged). A deliberate curator promote — and only that — re-enters the machine; the auto-sweep still never sees the slug.
- `readPromotionStatuses` is untouched; the new statuses flow to the enriched submissions list automatically, so the UI can show a demoted submission honestly.

### 3. Search-index removal: teach the provider `delete(ids)` (resolves OQ-3; no waiting on the batch window)
`SearchProvider` gains `delete(ids: readonly string[]): Promise<void>` (meili: `POST /indexes/<i>/documents/delete-batch`). The worker's demote cycle calls `searchDelete([slug])` — injected and optional like `reindexBook`, logged + swallowed on failure, never fails the job. The batch rebuild stays the backstop (it `deleteAll`s and reindexes the filtered set, and `buildBookDocument` now nulls delisted records — consistent). ADR 0059 Q6 stands for `reindexBook` itself: the *null-build* path still never deletes; the demote path is an explicit, intentional delete. Removal is immediate on fulfillment — no honest-UX window needed beyond the worker's normal async lag.

### 4. Endpoint + affordance (resolves OQ-4)
- **`POST /api/submissions/:slug/demote`** on the submissions router, mirroring promote exactly: session → `401`; `houseWeightOf ≥ curatorThreshold` → else `403 below_gate`; `enqueueDemotion` → `not_promoted` → `400` (not a community-promoted book — seeded books have no promotions row, so they are structurally undemotable); `already` → `200 { status: "already" }` (idempotent); else `200 { status: "queued" }`.
- **Web, book page:** the affordance composes two things the page already has or trivially gains: the curator bit (`canAssertAccusatory` from the tags read — the same gate) and the book's provenance — `PublicBook` gains `source` (additive; `parseBook` already holds the record). A quiet, curator-only "**Remove from catalog**" action renders only when `source === "community"`: confirm step ("Remove this book from the catalog? It goes back to community submissions.") → POST → calm requested state ("Removal requested. The catalog updates shortly."). The worker is async, exactly like reveal. Tokens only; plain words (no "demote" jargon in UI copy).
- **Submissions list:** a `demoted`/`demote_*` `promotionStatus` renders as a plain submission again (no promoted badge); copy stays calm. No new list surface.

## Consequences
- **Enables:** the catalog's undo — wrongly-promoted books come back out, visibly (the submission remains), auditably (queue row = who asked; librarian-signed delisting = what changed), reversibly (re-promote re-mints; ratings/tags/shelves data was never deleted and is live again).
- **Two-parser leverage:** the whole read surface (detail, browse, hydration, both index paths, both workers) inherits from `parseBook`/`buildBookDocument` nulls — the same single-seam economy as #79's folds.
- **No-war guarantee** is structural: the sweep's existing skip-any-status rule plus the one-row state machine; re-promotion requires a human.
- **Constrains:** `PromotionStatus` consumers see new states (the enriched list maps them; `canPromote` display logic treats a `demoted` row as re-promotable). The worker grows a second claim loop in its run.
- **Affects existing fixtures?** Additive: new statuses in a type union; `PublicBook.source` (additive field — fixtures asserting exact PublicBook shapes may need the field, the known #74 pattern); new schema builder/predicate; new provider method (the fake provider in tests gains `delete`).
- **New dependency?** No. **PRD change?** No — implements §5.7's loop hygiene / carries #30b.
- **Ops note:** none beyond the existing promoter cron; the demote cycle rides the same run.

## Implementation notes
- `packages/schemas/src/BookRecord.ts`: `buildBookDelisting({ slug, parentHeader })` + `isDelistedRecord(event)`; `BookDelistingEvent` type.
- `packages/search/src/types.ts` + `meili.ts`: `delete(ids)` on `SearchProvider`; `build-document.ts`: null on `isDelistedRecord`.
- `apps/api/src/books/effective.ts` (`parseBook`): null on `isDelistedRecord`; `PublicBook` + `toPublicBook` gain `source`.
- `apps/api/src/db/index.ts`: `enqueueDemotion` (the gated UPDATE) + the `demoted → pending` branch in `enqueuePromotion`; `PromotionStatus` union extended.
- `apps/api/src/routes/submissions.ts`: `POST /api/submissions/:slug/demote` (mirror of promote; `enqueueDemotion` on `SubmissionsDeps`). `index.ts`: wire it.
- `apps/promoter/src/queue.ts`: `claimDemotePending` / `markDemoted` / `markDemoteFailed`. `index.ts`: `runDemotionCycle(deps)` (build → sign → publish → searchDelete → markDemoted), invoked from `main.ts` after the promote cycle, sharing connections.
- `apps/web/src/lib/api.ts`: `PublicBook.source?`; `api.submissions.demote(slug)`. `BookDetail` (+ a small component/CSS): the curator-only, community-only, confirm-gated "Remove from catalog" action + requested state. Submissions list: no promoted badge for demote-state rows.

## Out of scope
- Seeded-record delisting; auto-demotion; deleting attached data; kind-5 anywhere; submitter notifications; the worker stranded-job reaper (a Story-30 follow-up, unchanged).
