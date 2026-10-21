# Review: Story 106 — Search reads Brainstorm's search relay

**Reviewer:** independent reviewer (rounds 1 and 2); round 3 fixes checked by the implementer
**Date:** 2026-10-20

## Round 1: FAIL, one blocking
1. **The switch would have broken the workers.** The promoter and the indexer read `SEARCH_PROVIDER` from the same `.env`; `search-relay` would have set them to `nip50`, and both build the provider without the relay read, so every promoter cycle and indexer run would have thrown. **Fixed:** both are pinned to Meilisearch in the compose file, held by a test.

Non-blocking, fixed: index-on-write reaches only the relay provider while it serves search, so `search-meili` rebuilds Meilisearch when switching back; a `CLOSED` from a relay fails the read at once; the adapter verifies each event's signature; identical searches in flight share one read and a failed read is not kept; typed NIP-50 options are removed and the text is capped at 200 characters. Found while checking a note on the duplicate check: the relay does not match ISBN text, so a record now carries its ISBN as a NIP-73 identifier (`["i","isbn:<13 digits>"]`) and an ISBN query is an exact `#i` lookup.

## Round 2: PASS
Recommended, fixed in round 3: the identifier is always the 13-digit form (an ISBN-10 or a hyphenated value is normalized, a record with only an ISBN-10 gets one, a non-ISBN gets none); only NIP-50's option names are stripped, so a title such as "Re:Zero" survives; a query left empty asks the relay nothing and finds nothing.

Accepted and documented: a page loaded more than two minutes after the last comes from a new list; a delisting can show in search for up to two minutes; format and language filters have no caller yet; no guard rule for `include:spam`, which the review reads also use.

## Quality gates (round 3, at HEAD)
- [x] `pnpm -r --no-bail typecheck` and `build`: every package clean.
- [x] `pnpm -r --no-bail test`: schemas 183, search 36, promoter 53, api 1026 + 13 skipped, web 454, seeder 237, shelves 34, trust 68, librarian 44, indexer 28, relay 22, ui 20, guide-lint 13.
- [x] Live, from a workstation against `wss://search.brainstorm.world` with signature checks: "island" 100+ verified in about 0.7 s, page two continuing where page one stopped; "island" in fantasy 26; a typed `observer:` option removed. ISBN lookups need the labels pass to write the identifiers first.

## Verdict
**PASS.** After merge and deploy: let the labels cron add the ISBN identifiers (a near-full republish), smoke-test one ISBN lookup on the relay, then run `search-relay` and check the search page, the search box and the submit form's duplicate check on staging. `search-meili` is the way back.
