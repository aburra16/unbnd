# Review: Story 78 — In-product accusatory reveal

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff main...HEAD` (impl commit `ebc411d` + review nit fixup)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0, no failing files). Story suites: `aggregate-reveal` 13/13 (3 new), `tags-reveal-write` 5/5, `tag-control-reveal` 3/3.
- [x] `pnpm --filter @unbnd/web build` — **pass**.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1: a curator reveals from the product (endpoint + `TagControl` Reveal control).
- [x] AC-2/AC-3: curator-gated (401 no session / 403 below gate); only accusatory tags (400 otherwise); surfaces via the existing read gate (the worker mints, unchanged).
- [x] AC-4 (audit): `enqueueReveal(…, requestedBy = user.pubkeyHex)` — the curator, not the librarian; the gate event stays librarian-signed; the librarian key is never on the api.
- [x] AC-5: withdraw (`state: withdrawn`) in-product. AC-6: the operator CLI + worker are untouched.

## ADR adherence (0076) — the public-gate invariant
- [x] **The public gate is provably unchanged.** `includeGatedAccusatory` defaults to `false`; the only caller passing it is the book-tags route, which passes `canAssertAccusatory` — a **fail-closed** boolean (starts `false`; anon / below-gate / any trust degrade → `false`). The other caller (`aggregateBookTags`) passes no flag → `false`. So a non-curator never receives a gated accusatory tag. Verified by reading both call sites + the gate computation.
- [x] Gated vs revealed are mutually exclusive: an unrevealed accusatory tag (curator view) → `gated:true`, never `revealed`; a revealed one → `revealed:true`, never `gated`.
- [x] `enqueueReveal` (api) mirrors the worker's upsert `ON CONFLICT (book_slug, tag_slug)`, always re-queues (the revealed↔withdrawn toggle), resets `minted_id`/`error`. No schema change.
- [x] Endpoint validates the `state` enum; gate order is session → accusatory → curator.

## DList / security integrity
- [x] **Librarian key never on the api** — `enqueueReveal` is a DB insert only; the worker (which holds the key) mints the signed event. The egress posture is unchanged.
- [x] No new event shape; the signed reveal event + read gate are untouched. `TagConsensus.gated?` is additive.

## UI integrity
- [x] Tokens only (`--signal-negative`, `--u-*`); no new hex. Calm, no-slop copy ("{n} flagged. Hidden from readers until you reveal it."); no em dashes in rendered copy (two code-comment em dashes reworded). Reveal/Withdraw use the `Button` primitive (no raw `<button>`). Non-curators see neither control.

## Things tests can't catch
- [x] No secrets/logging; no commented-out code. The async mint shows a calm disabled/pending state; a failed enqueue is swallowed without changing the tag state.
- [x] The Withdraw control sits on a *publicly revealed* tag but is shown only to curators (`canAssertAccusatory`); a non-curator cannot withdraw.

## House rules check
- [x] Sensitive surface handled with gravity: curator-gated, audited (who/when), reversible. POV-first (house-vantage gate). No new dependency/tooling.

## Findings

### Blocking
_None._

### Non-blocking
1. **`isAccusatorySlug` fails closed on a taxonomy-read error.** If the taxonomy relay read throws, `isAccusatorySlug` returns `false`, so a reveal request degrades to `400 not_gated` (can't reveal) rather than 500. This is the safe direction (fail-closed) and consistent with the rest of the route; worth knowing that a relay hiccup briefly disables in-product reveal (the operator CLI is the fallback). Non-blocking.
2. **`enqueueReveal` inserted-vs-updated heuristic.** The `{ status: "queued" | "updated" }` value is derived from `createdAt === updatedAt`. It is only a response-body label (the web shows a pending state either way); the upsert itself is correct. Cosmetic.
3. **Gate-order info signal (benign).** A below-gate user gets `400` on a non-accusatory slug vs `403` on an accusatory one — distinguishable, but the accusatory taxonomy is already public (`/api/tags`), so nothing is leaked. Non-blocking.

## Verdict
**PASS** — all gates green, all 6 ACs covered (AC-2/3 + key-egress structurally, AC-1/4/5 by test), ADR 0076 adhered to. The critical invariant — **the public read gate is unchanged** (only fail-closed curators see gated tags) — is verified, and the librarian-key egress posture is untouched (the api only enqueues). Non-blocking items are a fail-closed degrade, a cosmetic status label, and a benign status-code distinction.
