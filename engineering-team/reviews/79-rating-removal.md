# Review: Story 79 — Remove a rating

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-09
**Diff:** `git diff main...HEAD` (impl commit `d757390` + review em-dash fixup)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass.** One run showed a single failure in `apps/api/test/routes/shelves-enriched.test.ts` ("Parse Error: Expected HTTP/") — a supertest transport-level flake under full-suite load, in a file this diff never touches; it passed 3/3 in isolation and the full api suite re-ran green (976 passed). Logged as an observation, not a regression.
- [x] `pnpm --filter @unbnd/web build` — **pass.**
- [x] Story suites: schemas retraction 7/7, trust retraction 4/4, api summary-retraction + ratings-remove 14/14, web rating-control-remove 5/5; the whole ratings surface (63 tests across the rate/edit/remove suites) green.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1: a signed-in rater removes from the product (the RatingControl action + `POST /api/ratings/remove`), per tier, through the existing signing paths — no new crypto, no key egress.
- [x] AC-2: only the rater. Sovereign: `validateSignedRetraction` enforces author === session (`403`) AND that the d-tag is the **caller's own** rating address derived from the signing pubkey — you structurally cannot name someone else's rating. Custodial: the server signs with the caller's own session key. Anon: `401`.
- [x] AC-3 (all five seams): `dedupeRatings` (raw + weighted summary + `yourRating`, seams 1–2) and the four own-scoped folds (`countOwnRatings`, `ownRatedSlugs`, `scoreBySlug`, `scoresByAuthor`, seams 3–5) all admit retractions into their latest-wins race and drop a retracted head. Each seam is pinned by a test.
- [x] AC-4: idempotent (`removed:false` + **no publish** when there is no current rating) and re-rate-is-the-restore (pinned in trust + both own-fold suites).
- [x] AC-5: auditable — the retraction is the rater's own signed kind-39999 event on the relay (author + timestamp), never a silent server-side drop.
- [x] AC-6: the edit path is untouched (the pre-existing rate/edit suites pass unmodified in behavior); Remove is a separated, confirm-gated action.

## ADR adherence (0077)
- [x] **Tombstone, not kind-5**: the retraction is published under the SAME `rating--<slug>--<rater8>` d-tag (verified equal to `toBookRatingEvent`'s d-tag in the schema test) — relay-enforced replace; re-rating replaces the tombstone back.
- [x] **The folding-in rule** (the ADR's headline bug-guard): every fold admits retractions into the `created_at` race rather than skipping them, so a retraction *wins* against the older rating. Verified by reading all five folds + the retraction-newer/rating-newer test pairs.
- [x] **One shared primitive**: `isRatingRetraction` (kind + `rating--` d-tag prefix + marker, tag-level) is the only way any fold recognizes a retraction; `fromBookRatingEvent`'s score-required invariant is untouched.
- [x] Endpoints mirror the rate path: tier branch, the same `custodialSign`/`reauth_required` branch, the same `RatingError` mapping; the idempotent short-circuit runs before signing (so a custodial no-op needs no live key).
- [x] Routing tags (z/t/a/p) on the retraction match the rating's, so every existing query that returns ratings also returns retractions (pinned in the schema test) — without this the folds would never see them.

## DList / security integrity
- [x] No new signing surface: sovereign NIP-07 in-browser, custodial session key server-side (ADR 0006), audited stack only. The retraction template is server-built like the rating template.
- [x] No cross-user attack surface: folds key by `event.pubkey` (multi-author) or are author-scoped reads, so one user's retraction can only ever suppress their own entry; the write path additionally pins the d-tag to the signer.
- [x] A hybrid event (score + marker) is rejected at the write gate (`malformed`); at read time the predicate would classify it as a retraction, which only affects the signer's own entry (self-harm only).

## Beyond the story's five seams (a strength, verified)
Every other rating consumer routes through `dedupeRatings` — search rerank, unfurl cards, the shelves worker, and **`computeSubmissionSignals`** (which feeds the #77 auto-promote threshold). A retracted rating therefore also stops counting toward auto-promotion, consistently and for free. No consumer folds rating events any other way (checked by grep across `apps/*/src` + `packages/*/src`).

## UI integrity
- [x] Tokens only (`--u-border`, `--u-muted`, `--u-space-*`; two invented `--u-color-*` names were caught and fixed to the real vocabulary pre-commit). No new hex. `Button` primitives (ghost trigger / secondary Keep it / danger Remove). Calm, no-slop copy ("Remove your rating? You can rate again anytime."); no em dashes in rendered copy; three new code-comment em dashes reworded in review (the #71–#78 precedent).
- [x] Deliberate action: the trigger sits below a separator, apart from the stars and submit; the confirm step sends nothing until "Remove"; "Keep it" cancels cleanly. The flow is await-then-clear (a "Removing…" disabled state), not optimistic — the right gravity for a removal.

## Things tests can't catch
- [x] `applyWrite` widened to accept `null` (the cleared own slice) — the only consumers are `useBookRatings` (handles null) and the three test helpers (annotations widened, type-only).
- [x] After removal the stale "Your rating is in." status is reset; local score/review state cleared; the control re-renders un-rated off the prop.
- [x] No secrets, no logging of events, no commented-out code.

## Findings

### Blocking
_None._

### Non-blocking
1. **`created_at` ties.** A retraction with the SAME `created_at` as the rating does not beat it in the folds (strictly-greater comparison, the pre-existing tie semantics). In practice the relay replaces at the d-tag anyway (only one event survives), and the route stamps the template at request time; a same-second rate-then-remove can transiently read as still-rated until the relay state settles. Cosmetic.
2. **`removed:false` response shape.** The idempotent branch returns the summary from the *pre-replace* read (`rawFromParsed(deduped)`), which is the honest current state; fine, just noting the asymmetry with the post-publish re-read on the `removed:true` branch.
3. **Suite flake observed** (not this diff): `shelves-enriched.test.ts` failed once with a supertest HTTP parse error under full-suite load and passed on every re-run. Worth an eye if it recurs; candidate for the #82 cleanup list if it does.

## Verdict
**PASS** — all gates green, all 6 ACs covered, ADR 0077 adhered to. The critical invariants are verified: the retraction is **relay-replace at the rating's own d-tag** (re-rate restores), **only the rater can retract** (cryptographically, plus the own-d-tag pin), and **every rating consumer in the repo** — the five story seams plus rerank/unfurl/shelves/auto-promote — inherits removal through the single shared predicate + fold rule. Non-blocking items are a tie-semantics nicety, a response-shape note, and an unrelated suite flake.
