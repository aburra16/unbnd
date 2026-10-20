# Review: Story 107 — The API reads the house observer the operator set

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-20

## What changed
`docker-compose.prod.yml`: the `api` service now receives `HOUSE_OBSERVER_PUBKEY`, `TRUST_PROVIDER`, `BRAINSTORM_API_URL`, `TRUST_RELAYS` and `TRUST_FIXTURE`, written exactly as the `shelves` service writes them. A new test (`apps/api/test/infrastructure/compose-trust-env.test.ts`) holds the two services to the same lines.

## Checks
- [x] Root cause confirmed on staging: the shelves worker logs `observer=6aca05b812da` (the librarian, from `.env`); the API, given no `HOUSE_OBSERVER_PUBKEY`, used its code default (nosfabrica) and served a homepage cache computed 2026-06-05.
- [x] Effect on ratings checked before the change: on the re-rated books the librarian's and nosfabrica's house views give the same trusted figures today.
- [x] Empty values: the API's config treats an empty `TRUST_PROVIDER`/`BRAINSTORM_API_URL`/`TRUST_RELAYS` as its default, as the shelves worker does. An empty `HOUSE_OBSERVER_PUBKEY` disables the API's house view while the shelves worker falls back to nosfabrica; `.env` sets it on staging and `.env.example` sets it, so this is out of scope and recorded here.
- [x] Red set: 1 failing before the compose change; green after.
- [x] Gates: `pnpm -r --no-bail` typecheck and build clean; tests green in every package (api 1022 + 13 skipped). On the first full run two api tests unrelated to this change failed (a claimants test and a custodial rating test that ran 7.9 s); both pass in isolation three times and the full api suite passes twice after. The same intermittent failure was noted in story 104's review.

## Findings
### Blocking
_None._
### Non-blocking
1. Two api tests fail intermittently under full-suite load (see above). Worth its own look.

## Verdict
**PASS.** After merge and deploy the API restarts with the new environment; check that `/api/homepage/shelves` carries the shelves worker's latest `computedAt`, then that "Recently added" and Hidden Gems read from it.
