# ADR 0012: Profile & identity surface

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/11-profile-surface.md`

## Context

Signed-in identity is thin: initials from a server display name, a broken profile link, no sign-out, a dummy footer link. Sovereign users have richer identity (kind-0: name, picture, nip05) on the public nostr network — not on dcosl. Custodial users have only their DB display name (no media storage for uploads yet).

## Decision

### Backend — kind-0 resolution (`apps/api/src/nostr/profile.ts`)
- `parseKind0(events)` — pure: pick the newest kind-0, parse `content` JSON → `{ name?, displayName?, picture?, nip05?, about? }` (tolerant of malformed JSON → null).
- `fetchProfileMeta(relays, pubkeyHex, queryFn)` — fan out `{kinds:[0],authors:[pubkey],limit:1}` across the relays in parallel, flatten, `parseKind0`. Best-effort: per-relay failure ignored; overall returns null if nothing.
- `queryRelayUrl(url, filter)` — thin one-shot WS REQ→EOSE against an explicit relay URL (mirrors `publishEvent(relayUrl, …)`); `query.ts` keeps the config-based `queryEvents` for the local relay.
- Config: `profileRelays: string[]` (env `PROFILE_RELAYS`, comma-sep; sensible public default: damus / primal / nos.lol / nostr.band, plus dcosl). 

### Backend — endpoint
- `GET /api/profile/:id` (public, read-only): `:id` is an npub (bech32) or hex; decode → hex. Fetch kind-0 across `profileRelays`. Respond `{ profile: { npub, name?, displayName?, picture?, nip05?, about? } }`. No kind-0 → `{ profile: { npub } }`. Never exposes hex (npub for display). 3s budget; returns the bare npub on timeout so callers still render.
- `/auth/me` is unchanged (stays fast, DB-only). The client enriches with kind-0 via `/api/profile/:npub` — keeps the hot session path off the relays.

### Web
- `api.profile.get(idOrNpub)` → `{ profile }`.
- `Avatar` component: `picture?` → `<img>`; else a deterministic initials circle (bg colour hashed from the npub; initials from kind-0 name → display name → "?"). `onError` on the img falls back to initials (covers dead picture URLs).
- `AccountMenu` (replaces the nav avatar link): avatar button → dropdown showing the identity (name + short npub) and **Sign out** (`api.auth.logout()` → `session.refresh()`). Closes on outside-click / Escape. Sign-out-only for now (Settings/Profile are carry-forward).
- `Nav`: signed-in → `AccountMenu`; signed-out → "Sign in"; loading → nothing. Enrich name/picture via `api.profile.get(session.user.npub)` (sovereign gets kind-0; custodial returns bare npub → initials from display name).
- `ProfileMe` route `/profile/me`: requires session (else redirect to `/auth`); identity header (Avatar + name + copyable npub) on the Calloway layout; `ProfileStats` zeros + an empty activity state. No fake trust/data.
- `Footer`: session-aware Profile link → `/profile/me` when signed in, `/auth` otherwise.

## Options considered
- **Enrich `/auth/me` with kind-0 server-side** — rejected: every session check would hit external relays (slow hot path). Separate `/api/profile` keeps `/auth/me` fast and lets the avatar resolve progressively (initials → picture).
- **Decode npub→hex client-side** — rejected: avoids bundling nip19 in the web; the server already has it and decodes `:id`.
- **Custodial file upload now** — rejected (operator decision): no media storage; deferred to its own story. Initials this pass.

## Consequences
- New best-effort outbound relay reads (the droplet already dials wss for dual-publish). New public read endpoint. New web components (Avatar, AccountMenu, ProfileMe). No schema/migration; no new dependency.
- kind-0 is read-only and uncached this pass (a short cache is a fine later optimisation).

## Out of scope
Custodial avatar upload; dropdown Settings/Profile; real profile activity; editing/publishing kind-0; retiring the fixture profile route.

## Implementation notes (single PR, test-first)
1. `nostr/profile.ts` (`parseKind0` pure + `fetchProfileMeta` + `queryRelayUrl`) + config `profileRelays`.
2. `routes/profile.ts` `GET /api/profile/:id` + wire in `index.ts`.
3. web `api.profile`, `Avatar`, `AccountMenu`, `Nav` swap, `Footer` session-aware, `ProfileMe` + route.
4. Tests: `parseKind0` (newest wins, malformed → null, picture/name extraction); profile route (mocked fetch → maps to `{profile}`, npub-only on no kind-0); Avatar (picture vs initials, onError); AccountMenu (sign-out calls logout + refresh, closes on outside click); Nav (signed-in/out states). Update route smoke if needed.
5. Verify on staging: sovereign login → real avatar/name + sign out; custodial → initials + sign out; footer + `/profile/me`.
