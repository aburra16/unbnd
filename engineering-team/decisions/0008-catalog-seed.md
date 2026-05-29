# ADR 0008: Catalog seed — Open Library → DLists on dcosl

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/7-catalog-seed.md`

## Context

Story 7 turns the fixture catalog into real data: import a curated ~1–5k subset of Open Library, publish each book as a librarian-signed kind-39999 `BookRecord` DList event (plus the kind-39998 header it z-tags to) to the **dcosl** relay (`wss://dcosl.brainstorm.world/`), and have the droplet's local strfry **sync** them so the app reads through its existing local path. The job must run **on the droplet**, be **resumable/idempotent/rate-limited**, and survive the operator's machine being off.

### Verified facts

- **dcosl** is a strfry built for DLists — stores kinds 9998/9999/39998/39999, `negentropy: 1` (sync supported), and **accepted a write from our throwaway librarian key** (`OK … true`). So we can publish with the staging key and sync down with negentropy.
- **`@unbnd/schemas`** already has `toBookRecordEvent(record)` → `UnsignedDListEvent` (kind 39999, d-tag = `slug`, `source: "openlibrary"`, word-type `bookSubmission`) and `fromBookRecordEvent`. The unsigned→wire bridge (`toWireTemplate`, ADR 0005) adds the `["json", …]` tag + `created_at`. There is **no** kind-39998 *header event* builder — only address builders (`buildBookRecordsHeaderAddress`). The seeder constructs the header event per the BIBLE word-wrapper convention (`{word:{slug,name,title,wordTypes:["word","conceptHeader"]}, conceptHeader:{…}}`, d-tag = the header slug).
- **strfry** lives at `/usr/local/bin/strfry` in the tapestry container and supports `strfry sync <relay> --dir down --filter '{…}'` (negentropy). So the local relay can pull our kinds from dcosl.
- The app's read path (story 5a) queries the **local** strfry via `queryEvents`. So once the local relay has synced the records, book read-back (story 8) is the same pattern as ratings.

### Invariants

- DLists are the source of truth; the seeder produces **events**, not a private DB (the bridge model).
- Idempotent by replaceable d-tag (`d = slug`); re-runs overwrite, never duplicate.
- No secrets committed; the librarian nsec is provided to the job at runtime on the droplet.
- Crypto via the audited stack (`finalizeEvent`); never hand-rolled.

## Options considered

### Publish + sync flow

- **A — Seeder publishes directly to dcosl; local strfry syncs *down* (chosen).** A standalone containerized job fetches Open Library, builds + signs events, publishes to `wss://dcosl.brainstorm.world/`; a periodic `strfry sync --dir down` inside the tapestry container pulls our kinds into the local relay. dcosl stays canonical/shared; the app's read path is unchanged. Matches the operator's decision.
- **B — Seeder publishes to the *local* strfry; local pushes *up* to dcosl (`--dir up`).** Reverses the flow. Rejected: dcosl is the canonical/shared relay, so writing to it directly is the honest source of truth; pushing up makes the local relay the origin and dcosl a mirror, the opposite of intent.
- **C — Import straight into Neo4j / a private table, skip nostr.** Rejected: violates the bridge model — the events on the relay *are* the catalog; a private store wouldn't be shareable or WoT-curatable.

### Job runtime

- **A — A compose service with `profiles: [seed]` (chosen).** A new `seeder` image (built in CI like api/web) added to `docker-compose.prod.yml` under a `seed` profile so it never starts with the normal stack; the operator runs `docker compose --profile seed run --rm seeder` on the droplet (detached / via the deploy SSH). Reuses the GHCR image pipeline; logs via `docker logs`; reads `LIBRARIAN_NSEC` + `DCOSL_RELAY_URL` from the droplet env.
- **B — Ad-hoc `docker run` of a one-off image.** Workable but off to the side of the compose/image pipeline; more bespoke.

## Decision

**Option A for both:** a containerized seeder publishes directly to dcosl; the local strfry syncs down; the seeder runs as a `profiles: [seed]` compose service on the droplet.

### Specifics

1. **New workspace package `apps/seeder`** (Node + TS, esbuild-bundled like the API):
   - **Source:** Open Library **HTTP API** (no multi-GB dump for a curated subset). Query the **subjects** matching the eight UI genres (`literary-fiction`, `science-fiction`, `mystery`, `romance`, `fantasy`, `thriller`, `biography`, `history`) via `https://openlibrary.org/subjects/<subject>.json?limit=…&offset=…`, paginating to ~a few hundred works each, deduped by work id → ~1–5k unique works. Polite `User-Agent`, sequential with a small delay (rate-limit the *source* too).
   - **Map** each work (+ its primary edition for ISBN/pages) → `BookRecord`: `slug` = the Open Library work id normalized (e.g. `OL45804W` → `ol-ol45804w`) — deterministic ⇒ idempotent; `title`, `authorName`, `isbn13`, `pageCount`, `publishYear`, `language`, `blurb` (description), `format: "reference"`, `source: "openlibrary"`, `parentHeader = buildBookRecordsHeaderAddress(librarian)`. Skip works missing a title/author.
   - **Build + sign:** `toBookRecordEvent(record)` → `toWireTemplate(unsigned, createdAt)` → `finalizeEvent(template, librarianSk)`.
   - **Publish to dcosl:** open one WS to `DCOSL_RELAY_URL`, send `["EVENT", e]`, await the matching `OK`; **rate-limit** (e.g. a few events/sec) and retry on failure; reuse the `nostr/publish.ts` handshake (parameterised by relay URL).
2. **Headers:** before items, publish the kind-39998 **book-records** header (d-tag `books`, word-wrapper `conceptHeader`) and one header per genre, librarian-signed, on dcosl. Items z-tag to `39998:<librarian>:books`.
3. **Checkpoint (resumable):** a newline-delimited file of completed slugs on a mounted volume (`/data/seed-checkpoint`); on start, load it and skip done slugs. Combined with idempotent d-tags, an interrupted run resumes cleanly and a full re-run is a no-op.
4. **Sync (read path):** a periodic `strfry sync wss://dcosl.brainstorm.world/ --dir down --filter '{"kinds":[39998,39999]}'` run **inside the tapestry container** — a cron entry on the droplet (`docker exec unbnd-tapestry strfry sync …`) every few minutes, plus a one-shot right after seeding. The local relay then serves the catalog to the app exactly as it serves ratings.
5. **Secrets/runtime:** the seeder reads `LIBRARIAN_NSEC` and `DCOSL_RELAY_URL` from env (droplet `.env`, 0600, untracked). It is a `profiles: [seed]` service so it never runs with the normal `up`; the operator invokes `docker compose --profile seed run --rm seeder` (detached) on the droplet. Image built in CI (extend the publish workflow) and pulled like the others.
6. **Verification:** `fromBookRecordEvent` round-trips a sampled event back to its source fields; `queryEvents(local, {kinds:[39999], "#t":[slug]})` returns the seeded book after sync.

## Consequences

- **Enables** a real catalog on a shared relay, synced locally — the foundation for story 8 (live read paths) and story 9 (search indexing).
- **Constrains:** the seeder holds the librarian **nsec** on the droplet (the throwaway staging key). Fine for staging; a production librarian identity + secret handling is still owed. The Open Library API path caps practical volume (curated subset) — a bulk-dump path is a later scale-up.
- **New dependency?** `apps/seeder` package (Node/TS, esbuild); no new third-party runtime beyond `ws`/`nostr-tools`/`@unbnd/schemas`. A cron entry on the droplet for sync.
- **New config:** `LIBRARIAN_NSEC`, `DCOSL_RELAY_URL` (seeder env). The app/api are unchanged (still read the local relay).
- **PRD change?** No — implements the Open Library import the PRD anticipates.
- **dcosl is shared:** our events live alongside others'. Idempotent replaceable d-tags keyed by our librarian pubkey keep them ours; we never overwrite other authors.

## Out of scope

UI read-path swap (story 8); search indexing (story 9); genre tags / quality signals / ratings seeding; full Open Library corpus; author-claim; a production librarian identity + secret management; GrapeRank.

## Implementation notes

- DList: items kind **39999**, d-tag = `slug` (Open Library work id, normalized), `source: "openlibrary"`; header kind **39998**, d-tag `books`, word-wrapper `conceptHeader`; items z-tag `39998:<librarian>:books`. Cribbed from `@unbnd/schemas` (builders) + `origin/concept-graph:BIBLE.md` §§ (header/word-wrapper shape).
- Files: `apps/seeder/` (`src/openlibrary.ts` fetch+map, `src/headers.ts` build header events, `src/publish.ts` dcosl WS publish, `src/checkpoint.ts`, `src/index.ts` orchestrator), `apps/seeder/Dockerfile`, a `seeder` service in `docker-compose.prod.yml` under `profiles: [seed]`, a sync cron in `docs/DEPLOY.md`, CI image build.
- Reuse `toBookRecordEvent` + `toWireTemplate` + `finalizeEvent`; do not re-implement event construction or signing.
