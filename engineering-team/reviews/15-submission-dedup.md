# Review: Story 15 — Submission de-duplication (search-first)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** PR #37, CI-green, deployed to staging.

## Quality gates
- [x] `pnpm -r typecheck` 5/5; `@unbnd/web` 58, `@unbnd/api` 244, `@unbnd/search` 11; builds clean.
- [x] CI green on merge; staging deploy green.

## AC status
- [x] **AC-1** Submit leads with a live, debounced `/api/search`; matches render as a persistent inline list, each linking to the existing book.
- [x] **AC-2** Form gated — hidden until `onProceed`.
- [x] **AC-3** No-match → "Add this book" all-clear reveals the form, prefilled with the searched title.
- [x] **AC-4** Matches present → quieter "Add it anyway" → same reveal/prefill.
- [x] **AC-5** ISBN-exact (normalised 10/13-digit vs hit `isbn13`) → firm "already on Unbnd" banner linking to it. (`SearchHit` gained `isbn13`; architecture guard unaffected.)
- [x] **AC-6** Honest states (searching/empty/no-match/matches); degrades to "proceed" if search errors.

## Tests
DuplicateCheck (matches + add-anyway, no-match CTA, 1-char no-op, ISBN banner); Submit gating + prefill + back-to-search.

## Notes
- Reuses the verified `/api/search`; no new endpoint. ISBN matching is high-confidence only on books that carry `isbn13` (sparse in the OL-seeded catalog) — title matches stay advisory by design.
- The actual submission **write-path** is intentionally still a stub → story 16a.

## Verdict
**PASS** — search-first dedup is live and reuses search cleanly. Story marked Done. (Visual spot-check on `/submit` left to the operator; low-risk.)
