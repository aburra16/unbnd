# Story 27: Custodial kind-0 bootstrap — publish a baseline profile at signup

**Status:** Done
**Created:** 2026-05-31
**Type:** Bug

> **Gate decision (2026-05-31): AC-6 split to Story 27b.** The display-name RENAME → kind-0
> re-publish surface (former AC-6) is carved out into `engineering-team/stories/27b-custodial-displayname-rename.md`.
> Story 27 ships **7 active ACs (1–5, 7, 8)**. The shared kind-0 seam, the `mergeSubstack`
> `nameFloor` refactor, the signup bootstrap, and the login reconciliation all **stay here**.
> AC-7 holds without the rename surface (it is the `nameFloor` mechanic). See ADR 0027's
> Amendment note.

## Background

A custodial (email-signup, Tier-2) user's chosen display name never reaches nostr, so it is invisible everywhere identity is shown — in Unbnd's own badges and in any other nostr client.

The break is at signup. `buildAuthRouter`'s `signup` handler (`apps/api/src/index.ts` ~line 99) calls `createCustodialUser` (`apps/api/src/auth/users.ts` line 24), which stores the user's `displayName` **in Postgres only** (`users.ts` line 38) and **never publishes a kind-0** metadata event to nostr. The user gets a generated keypair and a row in the DB, but no profile event on any relay.

Every identity badge and name in the product, however, resolves from **kind-0 on relays**, not from our DB:

- `apps/web/src/components/RatedByRow.tsx` (line 34-35) → `useProfileMeta(npub)` → `GET /api/profile/:npub` (`apps/api/src/routes/profile.ts`) → `fetchProfileMeta` (`apps/api/src/nostr/profile.ts`, which parses `name` / `display_name` out of the kind-0 content) → `displayNameOf(meta, shortNpub)`.
- `apps/web/src/components/Avatar.tsx` `initialsOf` (line 18-25) strips the `npub1` prefix and takes the first two characters when there is no resolved name.

**Net effect for a custodial user:** because no kind-0 exists, `fetchProfileMeta` returns no `name`, so `displayNameOf` falls back to the shortened npub and the avatar shows npub-derived initials (e.g. "AO" from `npub1ao…`). The name the user actually typed at signup is shown nowhere — not in Unbnd, not in any other nostr app reading their npub. Sovereign (NIP-07) users are unaffected: they already have a kind-0 on relays from their existing nostr life, so their name and picture resolve normally.

**Latent ordering bug this also fixes.** The Story-22 custodial Substack write (`apps/api/src/routes/profile-substack.ts`) is the *only* code path that currently publishes a custodial kind-0, and it is merge-preserving: it fetches the freshest raw kind-0, merges, signs, publishes (`mergeSubstack` in `apps/api/src/profile/substack-template.ts` line 51). Because a custodial user has **no** baseline kind-0, `mergeSubstack(null, url)` starts from an empty `{}` and adds only `substack` — so the first Substack save publishes a kind-0 carrying `substack`/`website` but **no `name`**. Bootstrapping a `name`-bearing kind-0 at signup gives every later merge-preserve write a correct base to merge into.

**PRD anchor:** phase2-prd **§2.4 "Public profiles + real activity"** — the identity-header acceptance line *"Identity header (kind-0 picture for sovereign, initials for custodial; display name, handle, bio)"* presumes a custodial user's **display name** is resolvable; today it is not. Also supports **§2.6** (custodial personalization, shipped as Story 26), where a named custodial identity is the basis for follow/rating bylines, and is the prerequisite base for the kind-0 merge-preserve paths described in **Appendix C-1** (external writing link in kind-0 `website`) and surfaced by the **C-5** profile IA work. This is a **bug** in already-shipped custodial behavior, not new scope; it touches no PRD §11.3 "Out of Scope" surface (no payments, file hosting, ebook sales, federation, social feed, reading progress, email notifications). Note custodial avatar *images* are not in §2.4 for custodial users ("initials for custodial"), so this story does not add an image.

This story reuses machinery that already exists, so it stays small and consistent with shipped custodial writes (named here so the Architect inherits the seam):

- **`publishKind0`** — the server-relay kind-0 publisher (`apps/api/src/index.ts` ~line 236; ADR 0022, F2-A). Publishes to the LOCAL relay first (gates/awaits), then fans out best-effort to `config.profileRelays` (the public profile relays). It deliberately does **not** publish to dcosl, which rejects kind-0.
- **Custodial server-signing via the ephemeral wrap** — `useSessionKey` (`apps/api/src/auth/ephemeral.ts` line 50) and the `custodialSign` wiring (`apps/api/src/index.ts` line 301). The signup flow already establishes a signing session immediately after creating the user (`index.ts` line 131-138: decrypt the just-stored nsec with the signup password, `rememberSessionKey`, wipe), so the user's key is available to sign a kind-0 at signup time without a second password prompt.
- **The kind-0 merge-preserve pattern from Story 22** — raw fetch → merge → sign → publish (`profile-substack.ts`; `mergeSubstack` + `buildKind0Template` in `profile/substack-template.ts`) — is the model for the signup bootstrap, the login reconciliation, and (in the follow-up Story 27b) the rename path.

## User-facing description

As a **Reader** (PRD §3) who signs up with email, I want the display name I chose to be my name across Unbnd and any nostr app — shown on my ratings, reviews, and profile — so that I appear as a person, not as a string of `npub1…` characters. (Editing that name later in Settings is the follow-up Story 27b.)

## Acceptance criteria

**7 active ACs: 1–5, 7, 8.** (Former AC-6 — display-name rename — is deferred to Story 27b; it is listed below in place, struck from this story's scope, with a pointer.)

Testable from the outside, verifiable **without hitting real relays** — the kind-0 publisher is injected (a fake/in-memory publisher capturing the published event), consistent with how prior custodial-write stories test (`profile-substack`'s injected `publish`/`fetchRaw`/`custodialSign`, `FixtureTrustProvider`, etc.). "the server signs the kind-0" means it builds the kind-0 metadata template and signs it with the session's ephemeral-wrapped key via the existing `custodialSign` / `useSessionKey` path — never hand-rolled crypto.

- [ ] **AC-1 — Signup publishes a name-bearing kind-0.** Given a successful custodial signup with display name `D`, when the signup transaction commits and the signing session is established, then the server builds a kind-0 metadata event whose parsed content `name` equals `D` (and `display_name` equals `D`, per the field choice in Open Question 1), signs it with the session's ephemeral-wrapped key, and publishes it via the existing `publishKind0` path (local relay first, then best-effort fan-out to the profile relays, not dcosl). The captured published event is `kind: 0`, authored by the new user's pubkey.

- [ ] **AC-2 — Badge and name resolve to the real name after signup.** Given a custodial user who signed up with display name `D` and whose kind-0 has been published, when `GET /api/profile/:npub` resolves their profile, then `name` (and/or `display_name`) is `D`, so `displayNameOf` returns `D` and the avatar renders `D`-derived initials rather than npub-derived initials. (Verified against an injected resolver that returns the published kind-0; no live relay.)

- [ ] **AC-3 — PRIVACY: no email or PII in the published kind-0.** Given any custodial signup, when the kind-0 is built and published, then the event content contains **only** the chosen display name fields (`name`, and `display_name` per Open Question 1) and carries **no** email address and **no** other PII (no password, no internal user id, no session token). An explicit assertion checks that the signup email string does not appear anywhere in the published event (content or tags). (kind-0 is a public, unencrypted, broadcast event — see Privacy guardrail below.)

- [ ] **AC-4 — Fail-open: account creation survives a publish failure.** Given the kind-0 publish to the local relay fails or throws (relay down, signing-session race, network error), when a user signs up, then the signup still returns `200` with a valid session and the Postgres user row is committed (the account exists and the user is logged in). The publish failure is logged, never surfaced as a signup error, and never rolls back the account. (The kind-0 is best-effort; a relay must never block signup.)

- [ ] **AC-5 — Reconciliation path for a missed publish.** Given a custodial user whose signup kind-0 publish failed (AC-4) and who therefore has no baseline kind-0, when they next perform a profile-affecting action where the key is available in-session (the Architect picks the concrete trigger — e.g. next login, or the next merge-preserve profile write), then the server detects the missing/name-less kind-0 and publishes/repairs a name-bearing kind-0, so the user's name eventually resolves without manual intervention. (Best-effort + retriable, not a guaranteed-at-signup invariant.)

- **AC-6 — Rename re-publishes, merge-preserving other fields. → DEFERRED to Story 27b** (`engineering-team/stories/27b-custodial-displayname-rename.md`). Per the 2026-05-31 gate decision, the display-name RENAME → kind-0 re-publish surface (the new `POST /api/profile/display-name` endpoint, `users.updateDisplayName`, the Settings name field, and the web `setDisplayName` client) is carved out of this story. It depends on Story 27's shared `buildProfileKind0Content` seam. **Not an active AC of Story 27.**

- [ ] **AC-7 — Substack-first ordering no longer drops the name.** Given a custodial user who signed up (and therefore has a baseline `name`-bearing kind-0 from AC-1), when they then save a Substack URL via the Story-22 path, then the resulting merged kind-0 carries BOTH the `name` (preserved from the baseline) AND the `substack`/`website`, so the latent "kind-0 with website but no name" outcome described in Background no longer occurs. **This holds WITHOUT the rename surface:** it is delivered by the shared `buildProfileKind0Content` builder carrying the DB `displayName` as `nameFloor` in the `mergeSubstack` delegation — it does not depend on AC-6 or any rename endpoint.

- [ ] **AC-8 — Sovereign path untouched.** Given a sovereign (NIP-07) signup/login, when the auth flow runs, then the server does **not** build or publish any kind-0 on their behalf (sovereign users own their profile and already have a kind-0 on relays); all existing sovereign auth and profile tests still pass.

## DList shapes touched

No DList records. This story publishes a **kind-0** (NIP-01 replaceable metadata event), not a `kind:39998`/`kind:39999` DList header or item, and not a kind-3. kind-0 is a flat metadata JSON event with empty tags (per `buildKind0Template`), published to the profile relays via `publishKind0` (not dcosl, which rejects kind-0).

## Out of scope

State explicitly — do not build:

- **Custodial avatar IMAGE upload.** No media/blob storage exists yet (Blossom is PRD §11.3 Phase-2+). Custodial avatars stay **initials** (PRD §2.4 says "initials for custodial"). This story sets `name`/`display_name` only; it does not set a `picture` field.
- **The C-5 profile IA / "Advanced — Nostr identity" tab refactor.** Separate web-only IA story (Appendix C-5). This story does not restructure the profile or settings surface.
- **Provider → npub federation (C-3).** The many-to-one identity-mapping table and OAuth login providers are a Phase-3 design note (Appendix C-3). Untouched here.
- **Any sovereign-side change.** Sovereign users already have a kind-0 on relays and own their profile writes; this story never signs or publishes on their behalf (AC-8).
- **The display-name RENAME surface → Story 27b.** The `POST /api/profile/display-name` endpoint, `users.updateDisplayName`, the Settings name field, and the web `setDisplayName` client are deferred to `engineering-team/stories/27b-custodial-displayname-rename.md` (former AC-6). Story 27 propagates the display name into kind-0 at **signup** (AC-1) and **repairs** it at login (AC-5); it does not add an edit surface.
- **A general profile-edit surface.** Bio, nip05, relay-list editing, etc. are not added here. The Substack field continues to flow through the existing Story-22 path; this story only guarantees it composes correctly with the baseline (AC-7).
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": this story touches none of payments, file hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed, reading progress, federation, or email notifications.

## Privacy guardrail (non-negotiable — call out for the ADR)

A kind-0 is a **public, unencrypted, broadcast** event replicated across every relay it reaches and readable by any nostr client. The user's **email must NEVER appear in any kind-0**, in content or tags. The only user-supplied data permitted in the published kind-0 is the chosen **display name** (`name`, and optionally `display_name`). No email, password, internal user id, session token, or any other account/PII field may be serialized into the event. AC-3 asserts this directly; the Architect should treat it as a hard constraint on whatever kind-0-content builder is introduced.

## Open questions

Resolve before approving the story.

1. **`name` only, or `name` + `display_name`?** Recommendation: write **both** `name` and `display_name` to the same chosen string. `name` is the broadest-compatibility kind-0 field; `display_name` (NIP-24) is what many modern clients prefer, and `fetchProfileMeta` already reads both (`apps/api/src/nostr/profile.ts` line 95-97: `name`, then `display_name`/`displayName`). Writing both maximizes resolution across clients at zero extra cost. Confirm, or restrict to `name` only.

2. **Reconciliation trigger for a missed signup publish (AC-5).** Recommendation: reconcile on **next login** (the key is wrapped fresh in-session at login — `index.ts` login path line ~170) by detecting a missing or name-less kind-0 and publishing the baseline then; the next merge-preserve profile write is a secondary catch. Confirm the trigger(s) the Architect should target, or whether AC-5 should be a softer "best-effort, no guaranteed retry point" (in which case it can be dropped to a non-AC note).

3. **DB ↔ kind-0 as the source of truth for display name.** Today Postgres `displayName` is the only store. After this story, the resolvable name lives in kind-0 while Postgres still holds `displayName`. Recommendation: treat **kind-0 as the canonical display surface** (it is what the product reads everywhere) and keep Postgres `displayName` updated in lockstep on rename (AC-6) for recovery/audit, accepting that a manual relay edit could drift them. Confirm this dual-write posture, or specify that one is authoritative.

4. **Does signup block on the local-relay publish, or fire fully async?** Recommendation: keep `publishKind0`'s existing posture — **await the local relay** (so the kind-0 is gated/read-back-able and AC-2 holds immediately in tests), but the public-relay fan-out stays fire-and-forget. AC-4 (fail-open) governs what happens if even the local publish fails: the signup still succeeds. Confirm that awaiting the local publish (but never failing signup on it) is acceptable, versus making the entire publish fully async/post-response.

## Flags for the gate (PO — possibly contentious, user decides)

- **AC-5 (reconciliation) may be larger than the rest of the story.** Detecting a missing/name-less kind-0 and repairing it on login is a real behavior with its own tests. If the user wants this story kept to the minimum, AC-5 could be split into a follow-up ("27b — custodial kind-0 reconciliation") and this story would ship AC-1–4, 6–8 with fail-open documented but no automatic retry. PO leans **keep AC-5 in**, because without it a single relay blip at signup permanently strands a user's name (until they happen to do a profile write), which reproduces the exact invisibility bug this story exists to fix. Flagging so the user can choose.
- **AC-1 writing `display_name` in addition to `name` (Open Question 1)** is a small forward-compat choice but technically expands the published payload beyond the literal `name`. Called out so the user can veto it and restrict to `name` only.

## Linked artifacts
- ADR: `engineering-team/decisions/0027-custodial-kind0-bootstrap.md` — see also ADR 0022 (kind-0 publisher / F2-A) and ADR 0023 (custodial kind-3 server-signing via the ephemeral wrap) for the machinery this reuses.
- Prior story: `engineering-team/stories/done/22-substack-set.md` (custodial kind-0 merge-preserve write — the rename path's model).
- Test plan: `engineering-team/stories/done/27-custodial-kind0-bootstrap.test-plan.md`
- Review: (filled in after Review phase)
