# Review: Story 32 — Verified Author upgrade + gated author metadata editing

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-06-01
**Diff:** `git diff main...feat/verified-author`
**Story:** `engineering-team/stories/done/32-verified-author.md` (9 ACs)
**ADR:** `engineering-team/decisions/0033-verified-author.md`
**Test plan:** `engineering-team/stories/done/32-verified-author.test-plan.md`

## Outcome: BLOCKED (B-1) → remediated → APPROVED

First review found one blocking bug + two non-blocking gaps; all three were remediated through the gated loop and the re-review confirmed them closed with no regression.

### B-1 (blocking, first pass) — author-edits write contract was incoherent; happy-path save crashed BookDetail
ADR §4 says the `author-edits` write returns `{ ok: true, book: effectiveBook }`. The server returned only `{ ok: true }`, but the client type (`lib/api.ts`), `AuthorEdit.tsx` (`onSaved(result.book)`), and `BookDetail.tsx` (`setBook`) all expected `book` — so a *successful* save set `book` undefined and `BookHeader` threw on re-render. The web test passed only because its mock fabricated a `book` field the server never sent (same masked-contract pattern as Story 30's B1).

### N-1 (folded into remediation) — sovereign overlay write didn't validate URLs
The sovereign signed-event path didn't re-validate `coverUrl`/`purchaseUrl` (only template/custodial did), so a verified author could publish a `javascript:`/`data:` URL — a stored-XSS vector against AC-5.

### N-2 (folded in) — only `blurb` attributed
Applied `coverUrl`/`purchaseUrl` overlays were tracked in `authorProvided[]` but rendered no "From the author" attribution (AC-6 completeness).

### Remediation (verified closed in re-review)
- **B-1:** the write (both tiers) now returns `{ ok, book }`, reading back the merged effective book via a newly-extracted **shared** `apps/api/src/books/effective.ts` (`mergeEffectiveBook`) — the same merge `GET /api/books/:slug` uses (no duplication). All four layers agree; the web mock is now type-tied to the real `lib/api.ts` return (a contract drift fails compilation); the API test asserts the real `{ ok, book }` body.
- **N-1:** the sovereign path validates `coverUrl`/`purchaseUrl` with the same `isHttpUrl` helper before the gate + publish (400 `invalid_url`, no publish); adversarial tests for `javascript:`/`data:`/`ftp://`.
- **N-2:** `BookHeader` attributes any applied overlay field (blurb/cover/purchase).

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` — PASS (all projects clean).
- [x] `pnpm -r test` — PASS: schemas 102, search 11, promoter 11, indexer 6, seeder 12, api 682 (+10 pre-existing docker/relay-gated skips), web 276. No flake on targeted re-run.
- [x] `pnpm -r build` — PASS (tsc emit + web vite build).

Test-count deltas exactly as expected vs the first review: api 677→682 (+2 B-1, +3 N-1), web 273→276 (+1 B-1 re-render, +2 N-2). No suite weakened or skipped. Red set typechecked clean (the PR-#74 rule).

## Spec adherence (9 ACs)
- AC-1 curator-gated `author-verified` write (anon 401 / below 403 / mismatch 403 / custodial reauth+502 / idempotent / both tiers) — PASS.
- AC-2/AC-3/AC-8 count-gate: ≥N distinct above-floor curators, latest-apply, author self-excluded, dispute drops, single batched `weights` call, honest degrade (never 500) — PASS (`author-verified/verify.ts` byte-unchanged from the approved impl).
- AC-4 badge "Verified Author" vs "claimed", honestly distinct, no raw count/GrapeRank — PASS.
- AC-5 `author-edits` verified-only write, blurb/cover/purchase whitelist, **http(s) validation on both tiers** (post-remediation) — PASS.
- AC-6 read-merge `effectiveBook` + `authorProvided[]` attribution (all three fields, post-remediation) — PASS.
- AC-7 none-on-conflict (>1 verified → no overlay, all badged) — PASS.
- AC-9 both tiers, fixture-verified, no Brainstorm leak (ADR-0014 guard green) — PASS.

## Hard invariants
- Canonical librarian record NEVER mutated (`mergeEffectiveBook` derives `{ ...canonical }`; byte-identical snapshot asserted). Single batched `weights` call (no N+1). No `LIBRARIAN_NSEC` in `apps/api/src` (seeder/promoter only). No hand-rolled crypto (`verifyEvent`/DI'd `custodialSign`). npub-out, no hex on the wire. Editing limited to blurb/cover/purchaseUrl.
- Shared-merge extraction verified behaviorally identical to the prior approved inline merge (logic moved verbatim; all book-read suites green; `books.ts` re-exports `PublicBook`/`parseBook`; importers typecheck/build clean).

## Findings
### Blocking
None (B-1 remediated).
### Non-blocking
1. The `{ ok: true }` (no `book`) fallback when the catalog read-back fails immediately post-publish is unreachable in normal operation; if desired, the component could no-op `onSaved` when `result.book` is absent. Not a defect.
2. Phase-3/4 deferrals to carry forward: **co-author overlay support** (none-on-conflict today), **multi-retailer purchase links** (single `purchaseUrl` for v1).

## Verdict
**APPROVED**
