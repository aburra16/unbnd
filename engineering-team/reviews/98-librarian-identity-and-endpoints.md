# Review: Story 98 — Librarian identity in code, one Brainstorm default

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-20

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · full workspace green (trust 47, librarian 39, seeder 144, api 994 + 13 skipped, web 447) · web build ok · workflow YAML parses with both new tasks.
- [x] Live check of the claim the host swap rests on: `/authChallenge/<librarian>` and `/setup/<librarian>` answer identically on `api.brainstorm.world` and the old host; `scores.brainstorm.world` holds the same 30382s as `nip85.nosfabrica.com` (2026-10-19).

## Spec adherence (ADR 0088)
- [x] `LIBRARIAN_PROFILE` keeps the operator's 2026-05-30 fields exactly (name, display name, picture URL, NIP-05) and normalises website to `https://unbnd.ink`; adds `bot: true` and an about line that says automated; drops the empty lightning/banner strings. Picture URL verified to resolve (one redirect, 18 KB JPEG).
- [x] Kind 10002: dcosl, damus, primal, nos.lol, unmarked. Published with the kind 0 to general relays, purplepag.es and the search relay; the cycle refuses any dcosl target and stops before the relay list if the profile is refused everywhere (tested).
- [x] The librarian reads its own `LIBRARIAN_PUBLISH_RELAYS`, not the API's `PROFILE_RELAYS` (whose server value is unknown and may include dcosl). A collision the original design would have hit on its first run.
- [x] `BRAINSTORM_DEFAULTS` is the one default; API, shelves and librarian import it; compose and `.env.example` no longer restate a host; a test fails if any of the five files names the retired host or the empty relay again.
- [x] Ops: `librarian-profile` pulls the deployed image and runs `profile`; `set-brainstorm-endpoints` edits only keys already present, prints the result, recreates the API.

## Findings
### Blocking
_None._
### Non-blocking
1. The retired `LIBRARIAN_NAME`/`ABOUT`/`PICTURE_URL`/`NIP05` values may still sit in the server `.env`. They are now ignored; removing them is cosmetic.
2. `nip85.nosfabrica.com` stays as the second relay. It currently mirrors `scores.brainstorm.world`; if it is retired, the `/setup` hint still carries reads.
3. Treasure Map (kind 10040) scorer resolution remains out of scope, as the story says.

## Verdict
**PASS.** After merge and deploy: run `set-brainstorm-endpoints`, then `librarian-profile`, then read both events back.
