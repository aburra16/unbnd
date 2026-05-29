# Review: Story 11 — Profile & identity surface

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** PR #19 (feature) + follow-up fixes PR #20 (email sign-in) and PR #21 (Browse/About dead links), all CI-green and deployed. Backend verified live; UI confirmed by the operator on staging.

## Quality gates

- [x] `pnpm -r typecheck` — pass (4/4).
- [x] `@unbnd/api` tests pass (213; + kind-0 parse/route suites). `@unbnd/web` 35 pass (Avatar, AccountMenu, profile/route smoke, email login + create toggle, Browse, About).
- [x] Builds clean; CI green on each merge; staging auto-deploy green.

## AC status

- [x] **AC-1** sovereign avatar/name from kind-0 — verified live (`/api/profile/:id` resolved fiatjaf's name+picture+nip05; operator confirmed their own avatar/name render).
- [x] **AC-2** custodial initials avatar (upload deferred).
- [x] **AC-3** sign out via avatar dropdown (true logout: cookie cleared + custodial key evicted; closes on outside-click/Escape) → clear signed-out state. Operator-confirmed.
- [x] **AC-4** `/profile/me` real identity header on the Calloway layout + honest empty activity; signed-out → `/auth`. Operator-confirmed.
- [x] **AC-5** footer Profile link points at the logged-in user / sign-in, never the dummy account.
- [x] **AC-6** kind-0 resolution best-effort; relay failure → initials fallback; no fabricated/accusatory data.

## Follow-up bugs found in manual QA (fixed this pass)

- **Email sign-in was unreachable** (PR #20): the email screen was signup-only, so returning custodial users couldn't log in. Added a sign-in/create toggle (default sign-in → `api.auth.login` → home). Login endpoint verified live (401 on bad creds).
- **Dead nav links** (PR #21): `/browse` and footer `/about` 404'd. Added a Browse landing (live genre grid + recent shelf) and a plain About page (no-slop copy); footer uses `<Link>`.

## Crypto / safety

- kind-0 is read-only; no new signing. Logout evicts the custodial ephemeral key (existing behaviour). npub for display, hex internal. No fake data.

## Carry-forward (tracked in build-status memory)

- Custodial profile-image **upload** (needs media storage) — own story.
- Dropdown **Settings/Profile** entries — own story.
- **Real profile activity** on `/profile/me` (user's own ratings/tags) — own story.
- Retire the `/profile/:handle` fixture route + profile-fixtures.

## Verdict

**PASS** — signed-in users get a real identity surface (kind-0 avatar/name, sign-out, own profile), returning email users can log in, and the nav's dead links are live. Verified at the API layer and confirmed by the operator in-browser. Story marked Done.
