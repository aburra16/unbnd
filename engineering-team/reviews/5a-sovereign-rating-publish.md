# Review: Story 5a — Sovereign rating publish + generic core

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-28
**Diff:** `git diff 915bb2d..HEAD` (ADR → failing tests `dda5400` → impl `9074bd4` → review fixes), branch `cycle-4-nostr-writes`.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass**, all three packages.
- [x] `pnpm -r test` — **pass**: schemas 69, api 160 (+10 skipped), web 19 = 248 passing.
- [x] `pnpm --filter @unbnd/web build` — **pass** (321 kB JS / 103 kB gzip).
- [x] `pnpm --filter @unbnd/api build` — **pass** (tsc emit clean; the new `nostr/`, `ratings/`, `routes/ratings.ts` compile into dist).
- [~] **Live-relay round-trip NOT run.** `test/nostr/integration.test.ts` (AC-4 publish + AC-5 read-back end-to-end) is gated on `STRFRY_TEST_URL`; no relay on :7777 here and **no strfry service in CI yet**, so it skips. The framing logic of `publishEvent`/`queryEvents` is otherwise only exercised against a real relay — this is the one path a reviewer can't close locally. It runs the moment a relay URL is provided.
- [x] _Lint not configured — skipped._

## Spec adherence

- [x] **AC-1** encode rating: `ratings/template.ts` builds via `@unbnd/schemas` (`toBookRatingEvent`+`toWireTemplate`); `schemas/wire.test.ts` + `template.test.ts` pin kind 39999, the named tags, and the json tag. Out-of-range score → `RatingError("score_out_of_range")`.
- [x] **AC-2** client signs + posts: `RatingControl` runs `template → window.nostr.signEvent → submit`; `rating-control.test.tsx` asserts the signed arg is kind 39999. Server never receives a key.
- [x] **AC-3** server validates: `ratings/validate.ts` checks kind, `pubkey===session`, then `verifyEvent` on the raw body (ADR 0004 verifiedSymbol discipline), then parses. `validate.test.ts` covers honest/mismatch(403)/tampered(401)/wrong-kind/junk; `routes/ratings.test.ts` covers 403/400.
- [~] **AC-4** publish + confirm: `nostr/publish.ts` sends `["EVENT", …]` and resolves on the matching `["OK", id, accepted]`; route maps a failed publish → 502 (`ratings.test.ts`). End-to-end against a relay is the gated integration test.
- [~] **AC-5** generic core + read-back: `publishEvent`/`queryEvents` are kind-generic; `GET /api/books/:slug/ratings` returns `summarizeRatings`. Read-back honesty verified by `summary.test.ts` + the route test (no `weight|graperank|trust` substring). Live read-back is gated.
- [x] **AC-6** raw summary, no trust number: `summary.ts` returns raw count + raw mean; `summary.test.ts` asserts npub-not-hex and no trust field. Confirmed by inspection of `RatingControl` (shows "{avg} average across {n} ratings", no trust label).
- [x] **AC-7** re-rate replaces: d-tag `rating--<slug>--<rater8>` is per-(rater,book) (cycle-1 schema); `summary.ts` also dedups by rater keeping latest — `summary.test.ts` "dedups by rater".
- [x] **AC-8** tier-gated control: `rating-control.test.tsx` — sovereign active flow, signed-out sign-in prompt (no API call), custodial placeholder (no signing). Gates on `user.email === null ⟺ sovereign`.

## ADR adherence

- [x] **Option A implemented as decided:** server builds the template (`/api/ratings/template`), client signs, server validates + publishes (`/api/ratings`). The `buildRatingTemplate` + `publishEvent` core is exactly what 5b will reuse with the signing step swapped.
- [x] The unsigned↔wire bridge landed in `@unbnd/schemas` (`toWireTemplate`/`fromWireEvent`) — the piece ADR 0001 deferred here.
- [x] `LIBRARIAN_PUBKEY` optional + hex-validated; endpoints 503 when unset (`ratings.test.ts` "503 when … not configured"; `config.test.ts` parse/validate).
- [x] Publish transport mirrors `concept-graph:lib/publish.js` (EVENT→OK). Query is REQ→EOSE.
- [x] Layering respected: web stays UI; signing/verification/publish stay in apps/api; the pure bridge is in schemas.

## DList integrity

- [x] Kind **39999**; d-tag `rating--<slug>--<rater8>`; word-wrapper JSON in the `["json", …]` tag; `content` = review text; `z` → `39998:<librarian>:book-ratings`; `a` → `39999:<librarian>:<slug>`.
- [x] **Librarian pubkey resolved at runtime** from `config.librarianPubkey`, never hardcoded (template builder + route both read config; 503 when absent).
- [x] Concept-header address built via the cycle-1 `buildBookRatingsHeaderAddress` (stable `kind:pubkey:slug`).

## UI integrity (apps/web)

- [x] Brand tokens only — `RatingControl.css` uses `var(--u-*)` / `var(--signal-*)`; **no raw hex literals** (grep clean).
- [x] No icon library — stars are an inline hand-crafted SVG path.
- [x] Copy passes the no-slop rules: no em dashes, no rhetorical contrasts, no banned filler. The custodial placeholder was reworded from "sign in with Nostr" to "Ratings from email accounts are coming soon" so the protocol name does not surface outside auth/sovereignty screens (bridging principle).
- [x] Trust shown as… nothing — the live summary is a raw average + count, no tier string, no number dressed as trust.

## Things tests can't catch

- [x] No secrets committed; `.env.example` gains only `LIBRARIAN_PUBKEY=` (non-secret, blank).
- [x] No `console.*` / debugger / TODO in new code (grep clean).
- [x] No commented-out code.
- [x] Error paths: template 401/400/503; submit 401/400/403/502; both through the cycle-3 error sanitizer. `publishEvent`/`queryEvents` time out (5s) and fail closed rather than hanging.
- [x] Security: 64-hex pubkey checks at the validate boundary; `pubkey===session` gate prevents rating-as-someone-else (403); the verify runs on the raw parsed body, not a derived copy.
- [x] No key on the server for the sovereign path — the endpoints receive a signed event or a rating intent, never a secret.

## House rules check

- [x] PRD §11.3 scope: no payments/file-hosting/feed/etc. Trust-weighting, tags, shelves, follows, custodial signing, rate limiting all remain deferred.
- [x] POV-first: no global "the book's rating" is stored; the summary is computed at read time from the events strfry returns.
- [N] **New dependency:** `@unbnd/schemas` added to `apps/api` (workspace package, already in the repo). Authorized by ADR 0005 ("@unbnd/schemas … present"). No third-party addition.

## Findings

### Blocking
None.

### Non-blocking
1. **`RatingsBlock` (the fixture component) still renders a fake trust number** — `book.trustWeightedRating.toFixed(1)` with the label "from curators you trust" — and now sits on the same page as the honest `RatingControl` summary. This is pre-existing handoff fixture UI, not introduced by 5a, but the juxtaposition (one fake trust number + one honest raw average) is exactly the no-fake-numbers concern. **Recommend a follow-up** to remove or relabel the fixture trust display until GrapeRank lands. Spawning a task.
2. **AC-4/AC-5 rest on the gated integration test.** The live publish/read-back is the sole coverage for the relay handshake and isn't in CI (no strfry service). Mirrors the cycle-3/4 integration posture; add a strfry service to CI when convenient.
3. **Fixed during review (no longer open):** the `POST /api/ratings` response previously set `rating.npub` to the first summary entry (not necessarily the submitter); dropped it (the client ignores it; per-entry npubs live in `summary`). The client `submit` return type was aligned.

## Verdict
**PASS.** All eight ACs are satisfied by passing tests except the live-relay halves of AC-4/AC-5, which are covered by a correctly-gated integration test that runs against any provided relay. One pre-existing fixture inconsistency flagged as a follow-up; no blocking issues.
