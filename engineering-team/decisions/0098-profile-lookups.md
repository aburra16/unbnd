# ADR 0098: Profile lookups are verified, cached and stop at the first good answer

**Status:** Accepted
**Date:** 2026-10-22
**Story:** `engineering-team/stories/110-profiles-load-reliably.md`
**Amends:** ADR 0012 (kind-0 resolution, best-effort fan-out)

## Context
ADR 0012 resolves a person's kind-0 by a fan-out to public relays on every request, taking the newest event, with a 3-second timeout. The relay set has decayed: one default relay is gone (so every lookup costs the full timeout), one returns 503, and the profile index most clients rely on (purplepag.es) was never in the set. Nothing is remembered between requests, so each page load is a fresh gamble, and the web app caches an empty answer for the whole session. Events are not verified.

## Decision
1. **Relays.** Default `PROFILE_RELAYS`: `wss://purplepag.es`, `wss://relay.primal.net`, `wss://relay.damus.io`, `wss://nos.lol`. The librarian already publishes its kind-0 to purplepag.es (ADR 0088). Every profile read, for display and before a write, also asks Unbnd's own relay (`STRFRY_URL`), where Unbnd publishes every profile and follow list first.
2. **Verification at the read.** The profile fan-out (kind 0, 3 and 10002) drops any event whose signature fails `verifyEvent` (nostr-tools) or whose `pubkey` is not the author asked for, before picking the newest.
3. **Early finish, for display only.** The display lookup resolves when every relay has finished, or 400 ms after the first relay returns a verified event, or at the 3-second timeout. A newer kind-0 on a slower relay is picked up by the next refresh (§4). The raw kind-0 and kind-3 reads that precede a write (ADR 0022, 0023) keep waiting for every relay: stopping early there could merge a write onto an older event and drop newer fields.
4. **A server-side profile cache** in front of `GET /api/profile/:id`, in memory, keyed by hex pubkey, at most 10,000 entries (least recently used out first):
   - a profile found less than 10 minutes ago is served with no relay read;
   - an older one is served at once while one background refresh runs for that pubkey;
   - a refresh that finds nothing, or fails, keeps the entry and is tried again after a minute;
   - a refresh that started before a `set` never overwrites it;
   - "no profile anywhere" is kept for 1 minute;
   - a cold miss waits for the read, and concurrent cold misses for one pubkey share it.
   The raw kind-0 read before a profile write (ADR 0022) stays uncached, so a write always merges onto the freshest event it can find; a kind-0 that `publishKind0` writes to Unbnd's relay replaces that person's cache entry.
5. **The web app keeps what it has.** `useProfileMeta` does not replace a cached profile that has fields with an answer that has none.

## Alternatives rejected
- **Persistent relay connections (a pool).** Saves the handshake, but the cache removes almost every read, and a pool adds reconnect logic for relays we only touch occasionally.
- **Caching in Postgres.** Survives restarts, but profiles are public, cheap to re-read and change rarely; memory is enough for the people who visit.
- **The person's own write relays (outbox) first.** Better coverage for people missing from purplepag.es, at the cost of a second round trip on every cold read. Revisit if misses remain.

## Consequences
- A changed picture shows within about 10 minutes, or at once for an Unbnd profile write.
- A restart empties the cache; the first lookup for each person after it costs one fan-out.
