# Test Plan: Story 7 — Catalog seed

**Story:** `engineering-team/stories/7-catalog-seed.md`
**ADR:** `engineering-team/decisions/0008-catalog-seed.md`
**Date:** 2026-05-29

## Coverage map

| AC | Test file | Level |
|---|---|---|
| AC-1 OL work → BookRecord event | `seeder/test/openlibrary.test.ts` | unit |
| AC-2 concept header construction | `seeder/test/headers.test.ts` | unit |
| AC-3 publish to dcosl + local sync | staging (live) — `strfry sync` + read-back | integration |
| AC-4 idempotent (deterministic d-tag) | `openlibrary.test.ts` (deriveSlug deterministic) | unit |
| AC-5 resumable (checkpoint) | `seeder/test/checkpoint.test.ts` | unit |
| AC-6 rate-limit + logging | inspection + staging run | review + integration |
| AC-7 runs on the droplet | inspection (compose `profiles: [seed]`) | review |
| AC-8 spot-check parses back | `openlibrary.test.ts` (round-trip via schemas) | unit |

## What each suite pins

- **`openlibrary.test.ts`** — the bridge core: `deriveSlug` normalizes an OL work key to a **deterministic** slug (`/works/OL45804W` → `ol-ol45804w`) — the idempotency anchor (d-tag = slug); `mapWorkToBookRecord` produces a `BookRecord` with `source: "openlibrary"`, `format: "reference"`, filled optionals (publishYear, openLibraryId, coverUrl, subjects), the books header as parent, and **returns null** when title/author is missing; and a mapped record **round-trips** through `toBookRecordEvent`/`fromBookRecordEvent` (so the event the seeder signs is well-formed).
- **`headers.test.ts`** — `buildConceptHeaderTemplate` yields a kind-39998 template with the d-tag and a `["json", …]` `conceptHeader` word-wrapper (the seeder signs + publishes it as the parent header).
- **`checkpoint.test.ts`** — `loadCheckpoint` records completed slugs, reports `has`/`size`, **persists across reload** (resumable), and doesn't double-count — the resume guarantee.

## What's verified on staging (not hermetic)

- AC-3 (publish to dcosl + local strfry `sync --dir down` + read-back via the local relay) and AC-6/AC-7 (rate-limit, logging, droplet `profiles: [seed]` run) are exercised by running the seeder against dcosl from the droplet and confirming the local relay then serves the books. The dcosl publish handshake reuses the proven `OK`-frame logic; the WS layer itself is not unit-mocked.

## Verification — failing-for-the-right-reason

Confirmed 2026-05-29. Typecheck clean across all three packages (api, seeder, web).

`@unbnd/seeder`: **9 failures**, all `…not implemented`:
- 5 × `openlibrary.test.ts` (deriveSlug ×2, mapWorkToBookRecord ×3)
- 1 × `headers.test.ts`
- 3 × `checkpoint.test.ts`

## Notes for the Implementer

Order: `openlibrary.ts` (`deriveSlug`: strip `/works/`, lowercase, prefix `ol-`; `mapWorkToBookRecord`: require title + first author name, fill optionals, cover from `cover_id` → `https://covers.openlibrary.org/b/id/<id>-L.jpg`, `openLibraryId` = the bare work id, `parentHeader` passed in) → `headers.ts` (`buildConceptHeaderTemplate`: kind 39998, d-tag = slug, json word-wrapper `conceptHeader`) → `checkpoint.ts` (`loadCheckpoint`: read newline file into a Set, `add` appends + writes, `has`/`size` from the Set) → `src/publish.ts` (WS EVENT→OK to `DCOSL_RELAY_URL`, rate-limited, retry — reuse the api `nostr/publish.ts` handshake) → `src/fetch.ts` (paginate the OL subjects API, polite UA + delay) → `src/index.ts` (orchestrate: load checkpoint, publish headers, fetch subjects, map, sign via `toBookRecordEvent`+`toWireTemplate`+`finalizeEvent`, publish to dcosl, checkpoint each; `LIBRARIAN_NSEC`/`DCOSL_RELAY_URL` from env) → `Dockerfile` + `seeder` service in `docker-compose.prod.yml` under `profiles: [seed]` + CI image build + sync cron in `docs/DEPLOY.md`.

Sign with `finalizeEvent` (audited); never hand-roll. Live publish + sync verified on staging after merge.
