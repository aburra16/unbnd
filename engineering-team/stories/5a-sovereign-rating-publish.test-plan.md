# Test Plan: Story 5a — Sovereign rating publish + generic core

**Story:** `engineering-team/stories/5a-sovereign-rating-publish.md`
**ADR:** `engineering-team/decisions/0005-sovereign-rating-publish.md`
**Date:** 2026-05-28

## Coverage map

| AC | Test file | Level |
|---|---|---|
| AC-1 encode rating event (kind 39999, builder) | `schemas/test/wire.test.ts` + `api/test/ratings/template.test.ts` | unit |
| AC-2 client signs, posts signed event | `web/test/components/rating-control.test.tsx` | component |
| AC-3 server validates (verify + kind + pubkey==session) | `api/test/ratings/validate.test.ts` + `api/test/routes/ratings.test.ts` | unit + component |
| AC-4 publish to strfry + confirm | `api/test/routes/ratings.test.ts` (mocked publish; 200/502) + `api/test/nostr/*` integration (gated) | component + integration |
| AC-5 generic publishEvent core | `api/test/nostr/publish.test.ts` (integration-gated) + route reuse | integration |
| AC-6 raw read-back summary, no trust number | `api/test/ratings/summary.test.ts` + `api/test/routes/ratings.test.ts` (GET) | unit + component |
| AC-7 re-rate replaces (same d-tag) | `schemas` d-tag determinism (cycle 1) + `summary.test.ts` dedup | unit |
| AC-8 book-detail control, tier-gated | `web/test/components/rating-control.test.tsx` | component |

## What each suite pins

- **`schemas/wire.test.ts`** — the unsigned↔wire bridge ADR 0001 deferred here. `toWireTemplate` carries kind/content/`created_at`, appends a `["json", …]` tag with the serialized word-wrapper, preserves the named tags, and adds **no** pubkey/id/sig. `fromWireEvent` reconstructs the unsigned event so `fromBookRatingEvent` round-trips a sample rating (with and without review text), and throws on a missing json tag.
- **`ratings/template.test.ts`** — `buildRatingTemplate` produces a kind-39999 template, anchors `z`/`a` at the **config librarian pubkey**, builds the `d`-tag from the rater, rejects scores outside 1..5 with `RatingError("score_out_of_range")`, and reports `RatingError("feature_unavailable")` when no librarian pubkey is configured.
- **`ratings/validate.test.ts`** — `validateSignedRating` accepts an honest signed rating whose pubkey matches the session; rejects a different-pubkey event (`pubkey_mismatch`), a tampered event (`invalid_signature`), the wrong kind, and junk. Uses a fixture keypair + JSON round-trip (verifiedSymbol discipline, ADR 0004).
- **`ratings/summary.test.ts`** — `summarizeRatings` returns a raw count + raw arithmetic mean, dedups by rater (latest `created_at` wins), reports an empty book as `count 0 / average null`, and exposes **npub never hex** with **no weight/graperank/trust field** in the serialized output.
- **`routes/ratings.test.ts`** — DI-mocked `sessionUser`/`publish`/`query`. `POST /api/ratings/template`: 200 / 401 / 400 / 503. `POST /api/ratings`: 200 (publishes once + returns summary) / 403 pubkey-mismatch / 401 / 400 / 502 publish-failed. `GET /api/books/:slug/ratings`: public 200 raw summary, no trust string.
- **`web/rating-control.test.tsx`** — sovereign session: choosing a star + submit runs template→`signEvent` (kind 39999)→submit. Signed-out: a sign-in prompt, no API call. Custodial: the "email accounts" placeholder (5b), no signing.
- **`config.test.ts`** — `LIBRARIAN_PUBKEY` is undefined when unset, read when 64 lowercase hex, and rejected (throws) otherwise.

## Hybrid strategy

Hermetic everywhere (mocked `publish`/`query`, fixture keypairs). The **relay-backed** behavior — `publishEvent` actually sending `["EVENT", …]` and `queryEvents` collecting to `EOSE` against a live strfry (AC-4/AC-5 end-to-end) — belongs in an integration suite gated on a relay URL, mirroring how `db/integration.test.ts` gates on `DATABASE_URL`. **Not yet authored** (no strfry service in CI). The Implementer adds `api/test/nostr/*.test.ts` gated on e.g. `STRFRY_TEST_URL`, OR an in-process `ws` mock-relay for the framing. Flagged here so the gap is explicit, not silent.

## Edge cases

- [x] tampered rating event (sig break) → rejected
- [x] rating signed by a different key than the session → 403
- [x] score 0 / 6 / 2.5 / -1 → rejected
- [x] no librarian pubkey configured → template 503 / `feature_unavailable`
- [x] re-rate dedup (same rater, latest wins)
- [x] empty book → count 0, average null
- [x] npub exposed, hex never; no trust/weight/graperank field in the summary
- [x] tier gating: sovereign active / anonymous sign-in prompt / custodial placeholder
- [ ] live publish + read-back round-trip (integration-gated; Implementer adds)

## How to run
```
pnpm -r test
# integration (once authored): STRFRY_TEST_URL=ws://localhost:7777 pnpm --filter @unbnd/api test
```

## Verification — failing-for-the-right-reason

Confirmed 2026-05-28. Typecheck clean workspace-wide.

- `@unbnd/schemas`: **6 failed / 63 passed**. All 6 = `toWireTemplate not implemented` (the bridge stub).
- `@unbnd/api`: **25 failed / 132 passed / 9 skipped**.
  - 4 × `buildRatingTemplate not implemented`
  - 5 × `validateSignedRating not implemented`
  - 4 × `summarizeRatings not implemented`
  - 10 × `expected 404 to be 200/401/400/403/502/200` (empty `buildRatingsRouter` — handlers not added yet)
  - 2 × `LIBRARIAN_PUBKEY` parse/validate (loadConfig doesn't read it yet)
  - 9 skipped = the Postgres integration suite (unrelated; CI-gated)
- `@unbnd/web`: **3 failed / 16 passed**. All 3 = the stub `RatingControl` renders nothing (no star button, no prompt, no placeholder).

## Notes for the Implementer

Order: `schemas/wire.ts` (`toWireTemplate` appends the json tag; `fromWireEvent` reads json→payload, z→parentHeader) → `nostr/publish.ts` + `nostr/query.ts` (WS EVENT→OK / REQ→EOSE, per `concept-graph:lib/publish.js`) → `ratings/template.ts` (validate score, resolve librarian pubkey, build via `toBookRatingEvent`+`toWireTemplate`; book address = `39999:<librarian>:<slug>`) → `ratings/validate.ts` (verifyEvent on the raw body, kind, pubkey==session, parse) → `ratings/summary.ts` (parse via `fromWireEvent`+`fromBookRatingEvent`, dedup by rater, raw mean, npub via nostr-tools/applesauce) → `routes/ratings.ts` (three handlers; map `RatingError.code`→400/503, `pubkey_mismatch`→403, publish fail→502) → `index.ts` wiring (`sessionUser` from `resolveSession`→`{id,pubkeyHex,tier}`; `publish`/`query` bound to config) → `config.ts` `LIBRARIAN_PUBKEY` (optional, hex-validated) + `.env.example` → web `RatingControl` (tier-gate on `user.email===null` ⇒ sovereign; stars are buttons named "Rate N of 5"; submit named "Submit rating") + wire into `BookDetail`.

Integration: add `api/test/nostr/*` (relay-gated or in-process `ws` mock) for the live publish/read-back round-trip — the one gap the hermetic suites cannot cover.
