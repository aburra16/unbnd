# Review: Story 80 — Demote a promoted book

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-09
**Diff:** `git diff main...HEAD` (impl commit `c574c18` + review em-dash fixup)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0; api 988 passed | 13 skipped — the 13 are the two pre-existing DB/relay integration suites plus this story's 3 real-Postgres state-machine tests, which run in a `DATABASE_URL` env).
- [x] `pnpm --filter @unbnd/web build` — **pass.**
- [x] Story suites: BookDelisting 6/6, search delisted 5/5, demotion-cycle 6/6, books-delisted + submissions-demote 12/12, demote-control 6/6.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1: curator-gated endpoint (`POST /api/submissions/:slug/demote`, the exact promote-gate mirror: anon 401, below-gate 403, honest-degrade 403); the affordance is curator-only (`canAssertAccusatory`) + community-only (`PublicBook.source`); seeded books are **structurally** undemotable (no promotions row → `not_promoted` → 400).
- [x] AC-2: confirm-gated UI (nothing sent before "Remove"; "Keep it" cancels; calm requested state — the worker is async and the UI never pretends the catalog already changed).
- [x] AC-3: the api only runs the gated UPDATE (`enqueueDemotion`); the worker (sole `LIBRARIAN_NSEC` holder) signs + publishes. Audit: the row's `requested_by` = the curator; the delisting event is librarian-signed with a timestamp; the delisting event id is stored in `canonical_id`.
- [x] AC-4: detail 404 + browse + `?slugs=` hydration verified by test (with **parseable-plus-marker** fixtures, so the predicate, not parse luck, drives the null); search is removed immediately on fulfillment via `searchDelete` with the batch rebuild as backstop; the submission remains in the community space.
- [x] AC-5: structural — `demoted` is "any status" to the #77 sweep's skip rule (zero sweep changes; verified by reading `evaluateAutoPromotions` step 3); the demoted→pending reset exists **only** in `enqueuePromotion`'s manual path.
- [x] AC-6: re-demote → `already` (200, no-op); never-promoted → `not_promoted`; re-promote of a demoted row resets to `pending` (the real-Postgres arc test); attached data untouched (no deletes anywhere in the diff).

## ADR adherence (0078)
- [x] §1: the delisting is a minimal replace at the record's own address (d + books z + marker, no record fields — pinned in the schema test); `isDelistedRecord` checked in exactly the two parser seams (`parseBook`, `buildBookDocument`) and every surface inherits.
- [x] §2: one state machine; `enqueuePromotion` relocated to `src/db` beside `enqueueDemotion` (as the test design mandated); the demoted-reset is a targeted `WHERE status='demoted'` UPDATE inside the unique-violation branch — `done`/in-flight rows still answer `already`.
- [x] §3: `SearchProvider.delete(ids)` (required — the honest contract; meili delete-batch, empty no-op, non-ok throws); the worker swallows, the provider doesn't.
- [x] §4: route on the submissions router mirroring promote; web copy uses plain words ("Remove from catalog"), no "demote" jargon.
- [x] **A justified divergence from promote's publish rule** (pinned by the red set): promote tolerates one failed relay (`!local.ok && !dcosl.ok` → failed); the demote cycle **requires the local publish** (catalog reads come off the local relay — marking demoted while the book stays locally listed would lie) and treats dcosl as logged best-effort. Correct for a removal; documented in the cycle.

## DList / security integrity
- [x] `LIBRARIAN_NSEC` stays worker-only (the api's `finalizeEvent` import is the pre-existing ADR-0006 custodial *session* signer, not the librarian key). No new event shape beyond the delisting; no kind-5; no deletes of community data.
- [x] Resurrection safety: only the promoter worker writes at a community record's address; a re-promote replaces the delisting with a newer record (and the relay's replaceable semantics keep exactly one event at the address).

## UI integrity
- [x] Tokens only (`--u-border`, `--u-muted`, `--signal-negative`, `--u-space-*`); no new hex; `Button` primitives (ghost trigger / secondary Keep-it / danger Remove). Ban-list-clean copy; 8 code-comment em dashes reworded in review (the running precedent).
- [x] The submissions list: a `demoted` row falls through `PromoteCell` to the plain **Promote** button for curators — the re-promotable state the ADR intended, wired without touching the list.

## Things tests can't catch
- [x] `enqueueDemotion`'s UPDATE-then-SELECT is two statements (not transactional), but the worst interleaving misreports `already` vs `not_promoted` in a response body — the state machine itself can't corrupt (the UPDATE is atomic and gated).
- [x] The demoted row's `requested_by` is **overwritten** by the demoting curator (and again by a re-promoter). The full actor history lives in the librarian-signed events on the relay + `updated_at`; the row records the *latest* actor. Acceptable; noted.

## Findings

### Blocking
_None._

### Non-blocking
1. **In-flight demote states in the submissions list.** A `demote_pending`/`demoting` row falls through `PromoteCell` to the Promote button; pressing it answers `already` (no state change) while the UI optimistically shows "Promotion queued". Transient (one worker cron tick), curator-only, no integrity impact — but a quiet "Removal queued" label for the `demote_*` states would be more honest. Candidate for #82.
2. **Book page doesn't reflect "removal queued".** After the calm requested state, a page reload re-offers "Remove from catalog" until the worker runs (the control has no demote-status read). Same transient window as (1); re-demoting answers `already` harmlessly.
3. **`PublicBook.source` is required server-side, optional in the web type** — deliberate (old cached responses), but the web gate `source !== "community"` fails closed on absence, which is the right direction.

## Verdict
**PASS** — all gates green, all 6 ACs covered, ADR 0078 adhered to (with one justified, documented divergence: the demote cycle requires the LOCAL publish). The critical invariants are verified: the librarian key never touches the api; a delisting is a relay-enforced replace the whole catalog read surface inherits through two parser seams; the no-auto-re-promote guarantee is structural (skip-any-status + manual-only reset); seeded records are structurally undemotable. Non-blocking items are two transient-window UX labels (queued for #82 consideration) and a deliberate type looseness that fails closed.
