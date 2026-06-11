# Review: Story 82 — Code-debt cleanup

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-09
**Diff:** `git diff main...HEAD`

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` 0 · `pnpm -r test` exit 0 (1,916 tests) · web build ok.
- [x] The zero-behavior-change proofs, re-run individually: the api's `query-paged` suite (9) and the indexer's `relay` suite (3) pass **unmodified** against the shared pager; the seeder suite (132) passes after the deletion; the Story-31 verified-ban tests pass unmodified against the new copy.

## Item-by-item
- [x] **Shared pager**: `packages/relay/src/paginate.ts` carries the api's superset loop verbatim (budget check after fetch, short-page/plateau exact-stop before the bound check, boundary-second id-dedup, Map insertion order). No policy baked in: the api wrapper passes its ADR-0021 constants; indexer/shelves pass `Infinity` bounds and unwrap `.events` — every call site's semantics reproduced exactly, pinned by the 4 new shared-core tests + the 3 untouched suites. `@unbnd/relay` added as a dep to the three apps.
- [x] **Dead seeder code**: `fetchSubjectWorks` (+ its private `sleep`/`OLWork`/`SubjectResponse` residue) gone; `SEEDER_USER_AGENT` kept with its two importers.
- [x] **shortNpub**: AccountMenu's byte-identical private copy deleted; imports the canonical `lib/view-model` helper.
- [x] **Toggle copy**: states the provenance behavior (`authorPubkey` + `source:"author"`) and routes claiming to the book page; "self-claim"/"vetted credential" gone; "verified" still absent from the form (the Story-31 ban holds). Ban-list-clean.
- [x] **Demote-state labels** (Review #80 carry-forward): `demote_pending`/`demoting` → "Removal queued" with no Promote button; `demoted` falls through to Promote (pinned both ways).

## Findings
### Blocking
_None._
### Non-blocking
1. The `demote_failed` status still falls through to the Promote button — pressing it answers `already` (only `enqueueDemotion` retries a `demote_failed`). Rare (a worker-side failure), same one-tick honesty class as before; noted for the book.
2. The test harness initially missed the `useSession` mock (rows never rendered) — a fixture fix, found red→green; no component change.

## Verdict
**PASS** — every queue AC + the carry-forward covered; the zero-behavior-change claim is proven by the untouched suites passing against the rewired internals, not asserted.
