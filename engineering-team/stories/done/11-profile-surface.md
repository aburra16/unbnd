# Story 11: Profile & identity surface (avatar, sign out, logged-in profile)

**Status:** Approved
**Created:** 2026-05-29
**Type:** Feature / UX

## Background

Manual QA of the live catalog surfaced gaps in the logged-in identity surface:
- The top-right avatar shows initials of a server-stored display name and links to a broken `/profile/<dbid>` route. For **sovereign** users we can do better: their real identity (name + picture) lives in their nostr **kind-0** metadata.
- There's **no sign-out** anywhere.
- The footer's "Profile" link is hardcoded to the dummy `/profile/mira-calloway` fixture.
- There's no real logged-in profile page.

## User-facing description

As a signed-in user, I want the app to recognise me: my avatar/name (from my nostr profile when I have one), a way to sign out, and a profile page that's actually mine — not a demo account.

## Decisions (locked with operator)

- **Sovereign avatar/name** comes from kind-0 metadata fetched from well-known public relays (their kind-0 is on the broad network, not dcosl). Best-effort, short timeout, **fall back to initials**.
- **Custodial avatar:** initials this pass (we have no media storage). **File upload is deferred to its own story.**
- **Profile page:** real identity header (avatar / name / npub) on the Calloway layout; activity/shelves render as **honest empty states** — no fabricated data. Real activity wired later.

## Acceptance criteria

- [ ] AC-1: A signed-in **sovereign** user sees their kind-0 avatar + display name in the top-right (and on their profile); when no kind-0 / no picture exists, a deterministic **initials** avatar.
- [ ] AC-2: A signed-in **custodial** user sees an initials avatar from their display name (no upload this pass).
- [ ] AC-3: Clicking the avatar opens a dropdown with **Sign out** that performs a true sign-out (clears the session cookie; custodial session key evicted) and returns the UI to a clear signed-out state ("Sign in"). Dropdown closes on outside click / escape.
- [ ] AC-4: A logged-in profile page (`/profile/me`) shows the user's real identity header (avatar, name, npub) on the Calloway layout, with activity/shelves as empty states. Signed-out access redirects to sign-in.
- [ ] AC-5: The footer "Profile" link points to the logged-in user's profile when signed in (and to sign-in otherwise) — never the dummy account.
- [ ] AC-6: kind-0 resolution is best-effort: relay failure/timeout never breaks the nav or profile (graceful initials fallback); accusatory/fake data is never shown.

## Out of scope / carry-forward

- **Custodial profile-image upload** — future story (needs media storage: Postgres-bytea or an object store / nostr media host).
- **Dropdown items beyond Sign out** (Settings, Profile, etc.) — future story; this pass is sign-out-only.
- **Real profile activity** (the user's own ratings/tags/shelves on their profile) — future story; empty states for now.
- Retiring the `/profile/:handle` fixture route + profile-fixtures — later.
- Editing one's kind-0 from Unbnd; publishing kind-0 for custodial users.

## Linked artifacts

- ADR: `engineering-team/decisions/0012-profile-surface.md`
- Review: `engineering-team/reviews/11-profile-surface.md`
