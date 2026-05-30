# Review: Story 16a — Submission write-path

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** PR #40, CI-green, deployed; verified live end-to-end.

## Quality gates
- [x] typecheck 5/5; `@unbnd/api` 255, `@unbnd/web` 60; builds clean; CI green on merge; staging deploy green.

## AC status
- [x] **AC-1** Submit publishes a kind-39999 record z-tagged to `book-submissions`, signed by the user (sovereign NIP-07 / custodial server-wrap), published local+dcosl.
- [x] **AC-2** Deterministic, collision-safe slug (`sub--isbn-…` else `sub--title--author--pubkey8`); replaceable per submitter.
- [x] **AC-3** "Your submissions" on `/profile/me`; canonical catalog/read paths unchanged.
- [x] **AC-4** Validation + honest states (signed-out blocks; custodial reauth on no-wrap; publish failure messaging).
- [x] **AC-5** **Verified live:** sovereign challenge→verify→template→sign→submit (200) → `/api/submissions/mine` shows it → `/api/books?slugs=<slug>` confirms it's NOT in the catalog.

## Notes / carry-forward
- The `book-submissions` concept header is in the seeder; re-seed to publish it (optional — `#z` queries work without). 
- Promotion into the catalog + search, the curator/role gate (shared with accusatory-tag visibility), and a public community-submissions browse are **story 16b** (needs a design round — security-sensitive).

## Verdict
**PASS** — community submissions publish to their own space and are verified live; the canonical catalog is untouched. Story marked Done. (UI spot-check on `/submit` left to the operator; low-risk.)
