# Story 98: The librarian says it is automated, and Brainstorm's endpoints live in one place

**Origin:** ecosystem catch-up follow-ups (2026-10-20), on the operator's go.

## Problem
1. **Librarian identity.** The operator's DList standard asks a curator key for a profile marked automated (`bot: true`, an about line that says so) and a relay list (kind 10002) naming dcosl. The librarian's only profile is the operator's 2026-05-30 one (display name "Unbnd Librarian", a Primal-hosted picture, `librarian@unbnd.ink`, about "The House Point-of-View for Unbnd"): no `bot` flag, no relay list. The `profile` command builds the profile from server environment values nobody can review, so running it could overwrite the operator's fields.
2. **Brainstorm endpoints.** The API host and trust relays are hard-coded as defaults in five places (API config, shelves worker, librarian worker, production compose, `.env.example`). One default relay, `nip85.brainstorm.world`, is now empty; Brainstorm production uses `api.brainstorm.world` and `wss://scores.brainstorm.world`. Nothing is broken (the old host still answers and `/setup`'s relay hint already adds the new relay), but the copies drift.

## Acceptance criteria
1. The librarian's public profile is a reviewed code constant: the operator's existing fields kept (name, display name, picture, NIP-05, website), `bot: true`, an about line saying it is automated, no empty-string fields.
2. `librarian profile` publishes that kind 0 and a kind 10002 listing dcosl and the general relays it uses, unmarked; to the general relays, an indexer relay and the search relay (dcosl stores only list kinds).
3. One shared default for Brainstorm's API host and trust relays, exported by `@unbnd/trust` and used by the API, shelves and librarian; compose and `.env.example` stop hard-coding the old host; the empty relay is gone.
4. Staging ops gains `librarian-profile` (run the profile command) and `set-brainstorm-endpoints` (rewrite those two keys in the server `.env` if present, then restart the API), both idempotent and printing what they did.

## Out of scope
Resolving the scorer through kind 10040 Treasure Maps instead of `/setup` (Brainstorm's newer path; a design change of its own). Changing which relays the librarian publishes its follow list to.
