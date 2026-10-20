# ADR 0088: The librarian's public identity is code; Brainstorm endpoints have one default

**Status:** Accepted
**Date:** 2026-10-20
**Story:** `engineering-team/stories/98-librarian-identity-and-endpoints.md`
**Supersedes:** ADR 0057 §3 in part (profile content from environment).

## Context
ADR 0057 made the librarian's profile fields operator-supplied environment values, grouped with `SEED_CURATORS` under the firewall. The firewall protects private business rationale and the identities of seed curators; a public kind 0 is published to the world by definition and protects nothing by living in an unreviewable `.env`. Meanwhile the operator published the profile by hand (2026-05-30), so code and network already disagree, and the next `profile` run would publish whatever the environment holds. Story 97 established the rule for anything a worker republishes: the code owns it.

Brainstorm defaults are copied in five files. Brainstorm production now uses `https://api.brainstorm.world` and `wss://scores.brainstorm.world` (Brainstorm-UI `.github/workflows/build.yml`); both serve exactly the endpoints Unbnd calls (`/setup`, `/authChallenge/{pk}` + `/verify`, `/user/graperank`), and `scores.brainstorm.world` holds the same 30382 events as `nip85.nosfabrica.com` (checked 2026-10-19). `nip85.brainstorm.world` returns nothing.

## Decision
1. **`LIBRARIAN_PROFILE` in `apps/librarian/src/profile-content.ts`:** `name` "unbnd", `display_name` "Unbnd Librarian", `about` "Unbnd's house point of view. An automated account that keeps the book catalog, seeded from Open Library.", the operator's picture URL, `nip05` "librarian@unbnd.ink", `website` "https://unbnd.ink", `bot: true`. The empty `lud06`/`lud16`/`banner` are dropped. The `LIBRARIAN_NAME`/`ABOUT`/`PICTURE_URL`/`NIP05` environment values are retired. `SEED_CURATORS` stays out of band, unchanged.
2. **Kind 10002** built beside it: `r` tags for dcosl, damus, primal and nos.lol, unmarked (read and write). Both events publish to the general relays plus `wss://purplepag.es` (profile indexer) and `wss://search.brainstorm.world` (Brainstorm search). dcosl leaves the kind 0 target set: it stores only list kinds, and the cycle refuses a dcosl target. The set is overridable by its own `LIBRARIAN_PUBLISH_RELAYS`; the librarian stops reading `PROFILE_RELAYS`, which the API uses for profile lookups and may include dcosl.
3. **`BRAINSTORM_DEFAULTS` in `packages/trust`:** `apiUrl` `https://api.brainstorm.world`; `trustRelays` `wss://scores.brainstorm.world`, `wss://nip85.nosfabrica.com`. The API, shelves and librarian import it; compose passes the variables through empty so the code default governs; `.env.example` documents the override without restating the value.
4. **Ops:** `librarian-profile` runs `librarian profile`; `set-brainstorm-endpoints` rewrites `BRAINSTORM_API_URL` and `TRUST_RELAYS` in `/opt/unbnd/.env` only where present, prints the two lines, and recreates the API container.

## Consequences
- Brainstorm, Primal and other clients will show the librarian as an automated account; clients that read kind 10002 find its relays.
- A Brainstorm host change is one edit. `/setup` still supplies the relay hint, so a relay move on Brainstorm's side keeps working before the default catches up.
- Changing the librarian's profile is now a reviewed code change, as for the books header.
