# Story 27b: Custodial display-name rename — re-publish the kind-0, merge-preserving

**Status:** Draft
**Created:** 2026-05-31
**Type:** Feature
**Depends on:** Story 27 (`engineering-team/stories/done/27-custodial-kind0-bootstrap.md`) — the shared `buildProfileKind0Content` seam, `publishKind0`, `fetchRawKind0`, and the custodial server-signing wrap.

> **Origin: gate decision (2026-05-31).** This story is the carved-out AC-6 of Story 27. Story 27 ships the signup bootstrap, login reconciliation, and the shared kind-0 builder (with the `nameFloor` Substack fix); 27b adds the **rename** surface on top of that seam. See ADR 0027 (`engineering-team/decisions/0027-custodial-kind0-bootstrap.md`) Amendment note and its Decision §6 / "Deferred to Story 27b" implementation subsection.

## Background

Story 27 makes a custodial user's chosen display name resolvable on nostr: it publishes a `name`-bearing kind-0 at signup and repairs a missing/name-less one at login. But the name is still **write-once** — there is no way for a custodial user to change it after signup.

**The rename surface does not exist today:**

- `apps/web/src/routes/Settings.tsx` edits **only** the Substack URL. There is no display-name field.
- `displayName` is set once at signup (`validateDisplayName`, `apps/api/src/auth/passwords.ts` lines 51–59) and is never editable afterward.
- `apps/web/src/lib/api.ts` has no rename method; `apps/api/src/auth/users.ts` has no `updateDisplayName`.

So a rename requires a **new server endpoint + a new DB update fn + a new web field + a new web client method**. None of the merge/publish machinery is new — it reuses Story 27's `buildProfileKind0Content` seam verbatim. The work here is the endpoint, the DB lockstep update, the UI field, and one republish call through the shared builder.

After Story 27, the resolvable name lives in **kind-0** (canonical for display) while Postgres `displayName` is the recovery/audit copy and the republish seed. A rename must keep both in lockstep: update Postgres `displayName` AND re-publish a merge-preserving kind-0 carrying the new name, with a strictly-newer `created_at` so the replacement wins.

**PRD anchor:** phase2-prd §2.4 ("Identity header … display name, handle, bio") presumes the custodial display name is not only resolvable but editable in the product surface; §2.6 (custodial personalization). This is the first editable kind-0 field beyond Substack. Touches none of §11.3 out-of-scope.

This story reuses (does not reinvent):

- **`buildProfileKind0Content(rawPrev, patch, nameFloor?)`** (Story 27, `apps/api/src/profile/kind0.ts`) — the single merge-preserve builder with the privacy whitelist. The rename calls it as `buildProfileKind0Content(rawPrevContent, { displayName: D2 }, D2)`.
- **`buildKind0Template(content, createdAt)`** (Story 27, `kind0.ts`) — flat metadata JSON, `tags: []`.
- **`publishKind0`** (`apps/api/src/index.ts`, ADR 0022 F2-A) — local relay first, best-effort fan-out to `config.profileRelays`, never dcosl.
- **`fetchRawKind0`** (`apps/api/src/nostr/profile.ts`) — freshest raw kind-0 `{ content, createdAt }`.
- **Custodial server-signing** via `custodialSign` → `useSessionKey` → `finalizeEvent` (no hand-rolled crypto, per ADR 0002 / crypto-policy).
- **`validateDisplayName`** (`apps/api/src/auth/passwords.ts`).

## User-facing description

As a custodial **Reader** (PRD §3), when I change my display name in Settings, I want the new name to take effect across Unbnd and every nostr client without losing anything else on my profile (my Substack link, etc.) — so I can fix a typo or rebrand without starting over or needing to know what a kind-0 is.

## Acceptance criteria

Testable from the outside, verifiable **without hitting real relays** — the kind-0 publisher, raw fetch, and signer are injected (the same DI shape `profile-substack.test.ts` uses). "the server signs the kind-0" means it builds the kind-0 template and signs it with the session's ephemeral-wrapped key via `custodialSign` / `useSessionKey` — never hand-rolled crypto.

- [ ] **AC-1 (primary, carried from former Story-27 AC-6) — Rename re-publishes, merge-preserving other fields.** Given a custodial user with an existing kind-0 that already carries other fields (e.g. `substack`/`website` from the Story-22 path), when they change their display name to `D2`, then the server fetches the freshest raw kind-0, merges the new `name` (and `display_name`) into it via the shared `buildProfileKind0Content(content, { displayName: D2 }, D2)` preserving **all** other fields, signs with the session key, and publishes via `publishKind0` with a `created_at` **strictly newer** than the fetched event (replacement wins). The published kind-0 has `name == D2` AND `display_name == D2` AND retains the prior `substack`/`website`/etc. unchanged.

- [ ] **AC-2 — Postgres `displayName` updated in lockstep.** Given a successful rename to `D2`, when the kind-0 is published, then the Postgres `displayName` for that user is also updated to `D2` (via a new `updateDisplayName(userId, name)` in `apps/api/src/auth/users.ts`), so the DB recovery/seed copy and the canonical kind-0 agree. (The endpoint returns `200 { displayName: D2 }`.)

- [ ] **AC-3 — Authnz: own profile only.** Given the `POST /api/profile/display-name` endpoint, when it is called, then it renames **only the caller's own** profile: an anonymous/unauthenticated request is rejected `401`; a custodial request with no live signing session (key not wrapped in-session) is rejected `401` (reauth required); there is no path to rename another user's profile (the target is always the session user, never a request-body id).

- [ ] **AC-4 — Input validation + privacy whitelist preserved.** Given a rename request, when the new name is validated, then it goes through the existing `validateDisplayName` (`passwords.ts`) before publish, and the published kind-0 carries **only** whitelisted profile fields (`name`/`display_name` plus whatever `rawPrev` already held within the whitelist) — **no email, password, internal user id, or session token** can enter the event, because the rename builds its patch through Story 27's `buildProfileKind0Content` (the closed `PROFILE_KIND0_FIELDS` patch surface). An assertion checks the user's email string appears nowhere in the published event.

- [ ] **AC-5 — Settings field: no-slop copy, no hardcoded hex, custodial-only.** Given the `/settings` page, when a custodial user views it, then a display-name field is present (prefilled from the current resolved name), with honest `idle|saving|saved|error` states; on success the session/echo updates and `invalidateProfileMeta(user.npub)` refreshes the badge. The field reuses existing `Settings.css` tokens (**no new hex literal, no new icon library**) and its strings pass `memory/feedback_unbnd_copy_and_visual.md` (no em dashes, no declarative-negative slop, no rhetorical contrast, no emoji). The field is **hidden/disabled for sovereign** users.

- [ ] **AC-6 — Sovereign untouched.** Given a sovereign (NIP-07) user, when they hit `POST /api/profile/display-name`, then the server rejects it `403` (sovereign users own their profile and sign their own kind-0); the field is hidden/disabled for them in the UI. No kind-0 is built, signed, or published on a sovereign's behalf. All existing sovereign auth/profile tests still pass.

## DList shapes touched

None. This re-publishes a **kind-0** (NIP-01 replaceable metadata event, flat JSON content, `tags: []`), via `publishKind0` to the local relay + `config.profileRelays` fan-out, never dcosl. No `kind:39998`/`kind:39999`, no kind-3.

## Scope

**In scope:**

- `apps/api/src/routes/profile-display-name.ts` (new) — `buildProfileDisplayNameRouter(deps)`, DI like `buildProfileSubstackRouter` plus `updateDisplayName`. `POST /api/profile/display-name`, tier-branched (custodial: publish via the shared builder + DB lockstep; sovereign: 403; anon: 401).
- `apps/api/src/auth/users.ts` — add `updateDisplayName(tx-or-db, userId, name)`.
- `apps/api/src/index.ts` — register the new router; add `displayName` to `resolveSessionUser`'s returned shape **only if** Story 27's Substack `nameFloor` threading did not already add it.
- `apps/web/src/lib/api.ts` — `api.profile.setDisplayName(name) → POST /api/profile/display-name`.
- `apps/web/src/routes/Settings.tsx` — the custodial-only display-name field (per AC-5).
- New test: `apps/api/test/routes/profile-display-name.test.ts` (DI-injected, no live relay).

**Out of scope:**

- The shared `buildProfileKind0Content` / `hasResolvableName` / `buildKind0Template` builder, the `mergeSubstack` `nameFloor` refactor, the signup bootstrap, and the login reconciliation — all **delivered by Story 27**. 27b adds no new merge logic.
- Custodial avatar IMAGE / `picture` (no blob storage; §2.4 "initials for custodial").
- A general profile editor (bio/nip05/lud16/website/banner). Only the display-name field is added.
- Reconciling a hand-edited relay kind-0 back into Postgres (one-directional: DB seeds kind-0, not vice versa).
- Any sovereign-side change (AC-6 only guards the route off for sovereign).
- New lint/typecheck/build tooling (CLAUDE.md house rule; requires an ADR).

## Privacy guardrail (non-negotiable)

kind-0 is a **public, unencrypted, broadcast** event. The rename's only user-supplied data permitted into the event is the new display name (`name`/`display_name`). No email, password, internal user id, or session token may be serialized. This is enforced structurally by reusing Story 27's `buildProfileKind0Content` closed patch surface (`PROFILE_KIND0_FIELDS`); AC-4 asserts it directly.

## Reuse note

This story is intentionally thin: it is **the endpoint + the DB update + the UI field + one republish call through Story 27's `buildProfileKind0Content`**. No new kind-0 merge logic, no new privacy whitelist, no new template builder, no hand-rolled crypto. If 27b finds itself adding merge logic, that is a smell — the shared seam already covers it.

## Linked artifacts
- ADR: `engineering-team/decisions/0028-custodial-displayname-rename.md` (the 27b design-of-record: pins the endpoint contract, the DB↔kind-0 ordering, and the failure posture; reuses Story 27's `buildProfileKind0Content` seam with no new merge logic).
- Parent ADR: `engineering-team/decisions/0027-custodial-kind0-bootstrap.md` (Amendment note + Decision §6 + the "Deferred to Story 27b" implementation subsection — the seam-of-record this builds on).
- Parent story: `engineering-team/stories/done/27-custodial-kind0-bootstrap.md` (the builder seam this reuses; ships ACs 1–5, 7, 8).
- Model for the route shape: `engineering-team/stories/done/22-substack-set.md` and `apps/api/src/routes/profile-substack.ts` (tier-branched custodial write + injected `publish`/`fetchRaw`/`custodialSign`).
- Test plan: `engineering-team/stories/27b-custodial-displayname-rename.test-plan.md`
- Review: (filled in after Review phase)
