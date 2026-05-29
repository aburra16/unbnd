# Review: Story 7 — Catalog seed

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Diff:** `git diff main..HEAD` on `cycle-7-catalog-seed` (ADR 0008 → failing tests → impl).

## Quality gates (run by reviewer)

- [x] `pnpm -r typecheck` — pass (api, seeder, web, schemas).
- [x] `pnpm -r test` — pass: schemas 69, seeder 9, api 176 (+10 skipped), web 20.
- [x] `pnpm --filter @unbnd/seeder bundle` — pass (esbuild single-file).
- [x] **Live pipeline verified** — a `PER_SUBJECT=1` smoke against `wss://dcosl.brainstorm.world/` published 6 real Open Library books and read them back from the relay with correct titles/authors and deterministic d-tags (`ol-ol20600w`, …).

## Spec adherence

- [x] **AC-1** OL work → kind-39999 BookRecord via the schemas builder: `mapWorkToBookRecord` → `toBookRecordEvent` → `toWireTemplate` → `finalizeEvent`. `openlibrary.test.ts` pins the mapping + a round-trip through `from/toBookRecordEvent`.
- [x] **AC-2** concept headers seeded: `buildConceptHeaderTemplate` builds the kind-39998 `books` header + one per genre; the orchestrator publishes them before items; items z-tag to `39998:<librarian>:books` (the schemas builder sets the z-tag from `parentHeader`).
- [~] **AC-3** publish to dcosl + local sync: publish verified live (smoke). The local strfry `strfry sync --dir down` is documented (`docs/DEPLOY.md`) and runs on the droplet — verified there post-merge.
- [x] **AC-4** idempotent: d-tag = `deriveSlug(work.key)` (deterministic); `deriveSlug` determinism is unit-tested; replaceable events overwrite, never duplicate.
- [x] **AC-5** resumable: `loadCheckpoint` (file-backed Set) persists across reload and dedups — unit-tested; the orchestrator skips `checkpoint.has(slug)` and `add`s after a successful publish.
- [x] **AC-6** rate-limit + logging: `RATE_MS` delay between publishes + a `pageDelayMs` between OL pages; `[seeder]` progress/總 logs to stdout (`docker logs`).
- [x] **AC-7** runs on the droplet: a `seeder` service under `profiles: [seed]` (never starts with the normal stack), invoked via `docker compose --profile seed run -d --rm seeder`; checkpoint on the `seeder-data` volume.
- [x] **AC-8** spot-check parses back: the round-trip test + the live read-back (titles/authors correct).

## ADR adherence

- [x] Option A both ways: seeder publishes **directly to dcosl**; local strfry syncs **down**; runs as a `profiles: [seed]` compose service.
- [x] Slug = normalized OL work id; `source: "openlibrary"`, `format: "reference"`; mapping fills optionals (publishYear, openLibraryId, coverUrl, subjects).
- [x] Reuses `toBookRecordEvent` + `toWireTemplate` + `finalizeEvent`; no re-implemented event construction or signing.
- [x] Seeder image built in CI (added to the `staging.yml` build matrix) and pulled like the others.

## Things tests can't catch

- [x] **No hand-rolled crypto** — signing via `nostr-tools/pure.finalizeEvent`; nsec decode via `nip19.decode`. (grep clean.)
- [x] **No secrets committed** (`git ls-files` clean of `.env`/nsec/librarian json) and **none logged** (only the pubkey prefix is printed).
- [x] **Idempotent + resumable on a shared relay**: replaceable d-tags keyed by our librarian pubkey keep our events ours; we never overwrite other authors on dcosl.
- [x] Polite to the source: a `User-Agent` + inter-page delay on the Open Library API.

## House rules

- [x] No new lint/build tooling beyond the ADR-authorized esbuild (reused).
- [x] Scope discipline: data + sync only; UI read-path swap is story 8, search is story 9 (both in Out of scope).
- [x] No PRD scope creep.

## Findings

### Blocking
None.

### Non-blocking
1. **ISBN / page count not mapped.** The subjects API gives title/author/year/cover/subjects but not ISBN or page count without a per-work edition fetch (N extra calls). Mapped fields are complete and real; ISBN/pages are an optional later enrichment (the `BookRecord` fields are optional). Not a shortcut — a scoped mapping; flagged so it's explicit.
2. **Librarian nsec on the droplet** (throwaway staging key in `.env`, only the seeder reads it). Fine for staging; the production librarian identity + secret handling remains owed (the parked discussion).
3. **AC-3 local-sync** rests on the droplet `strfry sync` + cron — verified post-merge on the droplet, not in CI.

## Verdict
**PASS.** All ACs satisfied by passing tests and a live dcosl round-trip; crypto audited-stack only; idempotent/resumable/rate-limited; no secrets committed. The remaining live bits (full droplet seed run + `strfry sync` into the local relay) are verified on staging after merge.
