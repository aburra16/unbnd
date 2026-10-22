# Story 110: Profiles load reliably

**Origin:** the operator's signed-in avatar on staging shows initials ("HQ") instead of their picture, or loads it slowly (2026-10-22).

## Problem
The API resolves a person's kind-0 by opening a fresh connection to each profile relay for every request and waiting up to 3 seconds for all of them. On 2026-10-22, of the default relays:
- relay.damus.io answered 503;
- relay.nostr.band never answered, so every lookup took the full 3 seconds;
- relay.primal.net, nos.lol and dcosl answered at once without the operator's kind-0.

Only purplepag.es, a profile index, had it, and it is not in the set. Six lookups in a row found the picture three times.

The web app caches whatever comes back for the session, so one empty answer shows initials until the tab is closed. The relay read also takes events as given: a relay could serve a forged kind-0 for anyone.

## Acceptance criteria
1. **The right relays.** The default profile relays are purplepag.es, relay.primal.net, relay.damus.io and nos.lol; relay.nostr.band is dropped. `PROFILE_RELAYS` still overrides them.
2. **Only real events count.** Kind-0, kind-3 and kind-10002 reads keep an event only if its signature verifies and its author is the pubkey asked for.
3. **No waiting on a dead relay.** A lookup returns when every relay has answered, or a short grace after the first relay returns an event, or at the timeout, whichever comes first.
4. **The server remembers profiles.** `GET /api/profile/:id` serves a profile it found in the last 10 minutes without a relay read. An older one is served at once and refreshed in the background, one refresh per person at a time. A refresh that finds nothing keeps the old profile. A person with no profile anywhere is remembered as such for a minute. The cache is bounded.
5. **The app never forgets a picture it has.** An answer with no profile fields does not replace a cached profile in the web app.

## Out of scope
- Image size and caching for avatars and covers (story 111).
- Caching the raw kind-0 read used before a profile write; it stays a fresh read.
