# Story 22: Set your Substack link — the first kind-0 profile write (safe merge)

**Status:** Done
**Created:** 2026-05-30
**Type:** Feature

## Background
Story 20 added a **read-only** "Writes on Substack" link to both `/profile/:npub` and `/profile/me`: the display reads a dedicated `substack` field off the user's kind-0 metadata (`apps/api/src/nostr/profile.ts` — `parseKind0` surfaces `substack`, light-validated as an http(s) URL in `httpUrl`). Story 20 deliberately split out the **write**: today there is no way to *set* that field from inside Unbnd, so the link only appears for users who happened to set `substack` in some other Nostr client. Story 20's closing note named the follow-up exactly: "set Substack + safe kind-0 merge."

This story delivers that write. A signed-in user gets a settings affordance to enter, edit, or clear their Substack publication URL; on save it persists to their **kind-0 metadata** under the same `substack` key the Story 20 display reads, and the "Writes on Substack" link (already wired) then shows on their profile.

This is the app's **first kind-0 (profile metadata) write**. Every prior kind-0 interaction has been read-only (ADR 0012, ADR 0020). kind-0 is a single NIP-01 replaceable event holding *all* of a user's profile fields (name, picture, about, website, nip05, lud16, and possibly fields set by other clients), so the write carries a real hazard: it must preserve every existing field and only touch `substack`. The signing tiers mirror the existing rating/tag/shelf write paths (sovereign client-signs via NIP-07; custodial server-signs via the ephemeral-wrap; anonymous cannot).

PRD anchor: **phase2-prd Appendix C-1 "External writing link"** (the Substack link feature; the engineering note that it lives in kind-0 alongside `website`). This stays within phase-2 scope and does not expand PRD §11.3 out-of-scope (no payments, no federation, no OAuth identity-mapping — that last is the separate C-3 design note). It is explicitly *not* a general profile editor.

Affected persona: any signed-in **Reader / Curator / Author** who writes on Substack and wants the link to appear on their Unbnd profile.

## User-facing description
As a signed-in user, I want a place in Unbnd to enter, change, or remove my Substack publication URL, so that the "Writes on Substack" link on my profile points where I want and I can take it down when I want, without leaving the app and without losing the rest of my Nostr profile.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] **AC-1 — Settings affordance for the signed-in user.** Given a signed-in user (sovereign or custodial), when they open the agreed settings surface (Architect picks the location; PO recommends a dedicated `/settings` route reachable from the account dropdown), then they see a single labeled field pre-filled with their current `substack` value (empty when they have none), plus a save control. Given a signed-out visitor, when they navigate to that surface directly, then they are sent to sign-in (no settings, matching the `/profile/me` gate); anonymous users have no settings entry.

- [ ] **AC-2 — Set persists to kind-0 `substack` and the link appears.** Given a signed-in user with a valid `https://…` Substack URL entered, when they save, then a new kind-0 is published carrying `substack` set to that URL, and on reload of `/profile/me` (and their public `/profile/:npub`) the "Writes on Substack" link renders pointing at that URL (the Story-20 display, unchanged).

- [ ] **AC-3 — Merge-don't-clobber: every other kind-0 field is preserved.** Given a user whose current kind-0 already carries other fields (e.g. `name`, `picture`, `about`, `website`, `nip05`, `lud16`, **and at least one field Unbnd does not model**), when they set or change their Substack URL, then the published kind-0 still contains all of those other fields with their original values unchanged, and only `substack` is added/changed. The write must not drop any pre-existing field, including ones Unbnd has no schema for.

- [ ] **AC-4 — Clear removes the field (no empty value left behind).** Given a user who currently has a `substack` value, when they clear the field and save, then the published kind-0 no longer contains a `substack` key at all (not `substack: ""`, not `substack: null`), every other field is preserved (per AC-3), and on reload no "Writes on Substack" link renders. A clear when there was no value is a no-op that does not error.

- [ ] **AC-5 — Validation before publish.** Given a user who enters a value that is not a well-formed http(s) URL (e.g. `notaurl`, `ftp://x`, `javascript:…`), when they attempt to save, then the save is rejected with an honest inline message and no kind-0 is published. Given a well-formed `http(s)` URL, the save proceeds. (Light validation only, mirroring the Story-20 read-side `httpUrl` check; no domain/ownership verification.)

- [ ] **AC-6 — Sovereign tier signs via NIP-07.** Given a signed-in sovereign user (no email), when they save, then the kind-0 is signed in the browser through the existing NIP-07 path (`window.nostr.signEvent`), mirroring the rating/tag/shelf sovereign flow, and published. No private key touches the server. If no Nostr extension is present, an honest message is shown and nothing is published.

- [ ] **AC-7 — Custodial tier signs server-side; reauth when the key is gone.** Given a signed-in custodial (email) user with a live session key, when they save, then the server builds the merged kind-0 and signs it with that session's ephemeral-wrapped key (ADR 0006) and publishes it. Given a custodial user whose live key is gone (process restart / evicted), when they save, then the response is the existing `reauth_required` 401 and no kind-0 is published, matching the rating/tag/shelf custodial behavior.

- [ ] **AC-8 — Published kind-0 propagates where it will be seen.** Given any successful save, when the kind-0 is published, then it goes to both the local relay and the target(s) where the user's kind-0 is actually read from (the profile relays and/or dcosl — exact target is an Architect decision, see Open Questions), so that the updated link is visible to clients reading the user's kind-0, not stranded on a relay nobody reads. (Acceptance: after a save, a fresh `fetchProfileMeta` read for that user returns the new `substack` value.)

- [ ] **AC-9 — Honest save states; no other profile field is editable.** Given the settings surface, when a save is in flight, succeeds, or fails, then the UI shows honest idle / saving / saved / error states (no fabricated success). Given the same surface, then it exposes **only** the Substack field — no input for name, bio, picture, nip05, website, or any other kind-0 field.

## DList shapes touched
No new DList shape. This story writes the existing **kind-0** (NIP-01 user metadata) replaceable event for the signed-in user, setting/clearing only the `substack` field.

- `kind:0` — NIP-01 user metadata. Read path exists (`apps/api/src/nostr/profile.ts` `fetchProfileMeta`/`parseKind0`; `GET /api/profile/:id`). This story adds the **write**: fetch-current → merge `substack` → sign (per tier) → publish + propagate. The exact endpoint shape and template-build location are the Architect's call; PO recommendations below are non-binding.

The other kinds (`39999` ratings/tags/shelves) are untouched; this story only references their write paths as the structural model to mirror.

## Architect questions (named, not solved)
These are the hazards this story names for the Architecture phase. The PO is flagging them, not deciding them.

1. **Merge-don't-clobber, including unknown fields.** kind-0 holds the user's whole profile. The write must fetch the user's *current* kind-0 content, set/clear *only* `substack`, and preserve every other field — including fields Unbnd has no schema for. **Note for the Architect:** the existing `parseKind0` is lossy — it projects kind-0 down to a known `ProfileMeta` (`name`, `displayName`, `picture`, `nip05`, `about`, `substack`) and would silently drop `lud16`, `banner`, `website`, and anything else. The merge therefore **cannot** be built on `parseKind0`; it must operate on the *raw* kind-0 `content` JSON object. Decide how the raw current content is obtained and merged.

2. **Where "current kind-0" is fetched from, and where the result is published.** The read (`fetchProfileMeta`) fans out across the configured **profile relays** (`config.profileRelays` — damus/primal/nos.lol/nostr.band, plus dcosl). A user's freshest kind-0 may live on those public relays and **not** on dcosl (Story-20 example: the librarian's kind-0 lives on damus/primal, not dcosl). So the write must (a) fetch the *freshest* existing kind-0 to merge from a source that actually has it, and (b) publish the updated kind-0 to a target where it will propagate to the clients that read it. The current write `publish` wrapper dual-publishes local + dcosl (ADR 0011); kind-0 may need a *different* propagation target (profile relays) than the kind-39999 community writes. **Decide the fetch source and the publish target(s) for kind-0 specifically.**

3. **Concurrency / clobber risk (accepted limitation).** kind-0 is globally replaceable — latest `created_at` wins across all clients. If the user edits their profile in another client after Unbnd reads-but-before/after Unbnd writes, one write can shadow the other. Merge-from-freshest mitigates but does not eliminate this. The Architect should name this as an accepted limitation and decide whether any guard (e.g. re-read immediately before sign, created_at handling) is warranted at this scope.

4. **Who builds the merged template, per tier.** For custodial, the server already builds + signs + publishes (it holds the wrapped key). For sovereign, the browser signs — but the *merge* needs the current kind-0, which the server is better placed to fetch. PO suggests mirroring the ratings pattern: the server fetches-current + builds the merged unsigned template and returns it for the sovereign client to sign via NIP-07, then accepts the signed event back for publish/propagation. The Architect decides whether the merge happens server-side (template endpoint) or client-side.

## PO recommendation (non-binding — Architect decides the mechanism)
- **UI location:** a dedicated `/settings` route, gated like `/profile/me`, reachable from a "Settings" item in the `AccountMenu` dropdown (`apps/web/src/components/AccountMenu.tsx`). Rationale: it is the minimal honest home for a write that will plausibly grow (a future story may add name/bio/avatar editing on the same page, which the merge-preserve machinery here sets up). An inline edit on `/profile/me` is the alternative; PO leans `/settings` so the read-only profile view stays a clean display surface. Architect picks.
- **Endpoint shape:** mirror ratings — `POST /api/profile/substack/template` (server fetches current kind-0, builds the merged unsigned kind-0 template) + `POST /api/profile/substack` (sovereign posts the signed `{ event }`; custodial posts the intent `{ url }` and the server signs with the session key). Or fold both into one tier-branched endpoint. Architect's call.
- **Signing:** reuse the audited stack only — NIP-07 `ExtensionSigner` path for sovereign (the `window.nostr.signEvent` already used in `RatingControl.tsx`), `useSessionKey` + `finalizeEvent` for custodial (`apps/api/src/auth/ephemeral.ts`, wired in `apps/api/src/index.ts`). No new signer, no hand-rolled crypto.
- **Web API:** add an `api.profile.setSubstack`-style method to `apps/web/src/lib/api.ts` paralleling `api.ratings`.

## Out of scope
Stated explicitly; do not let these creep in.
- **Full profile editor** — setting/editing `name`, `display_name`, `about`/bio, `picture`/avatar, `banner`, `nip05`, `lud16`, or any kind-0 field other than `substack`. This story sets ONLY `substack`. The merge-preserve machinery built here is the foundation a later story can extend to those fields, but none of them are editable in this story. (PRD §11.3: this is not a re-scope; it is a deliberately narrow first write.)
- **Other external links** beyond Substack (the broader C-1 "external writing link" set; e.g. a general `website` editor).
- **OAuth / identity-mapping** between a Substack account and the Nostr identity (the C-3 Phase-3 design note). This story sets a self-asserted URL string; it does not verify ownership of the publication.
- **nip05 setting / verification.**
- **Eliminating the multi-client clobber risk** (Architect Question 3) — merge-from-freshest is the mitigation; a full conflict-resolution scheme is out of scope.
- PRD §11.3 Phase-2+ items generally: payments, Blossom file hosting, ebook sales, federation, email notifications, social feed.

## Open questions
Resolve before approving the story.

- **Q1 (UI location):** dedicated `/settings` route (PO recommendation) vs. inline edit on `/profile/me` vs. a field in the account-dropdown flow. Confirm the minimal one to scope the AC-1 surface.
- **Q2 (kind-0 propagation target):** publish the updated kind-0 to the **profile relays** (`config.profileRelays`, where kind-0 is read from), to **dcosl** (where kind-39999 writes go today), or to both? Story 20 showed a user's kind-0 can live on profile relays and not dcosl, so publishing only to dcosl/local could leave the change invisible to clients reading elsewhere. Flagged as the central Architect decision (AC-8). PO leans: publish to the profile relays at minimum, plus local for read-back.
- **Q3 (custodial users with no kind-0 yet):** a custodial user who never published a kind-0 has no existing fields to merge. Confirm the intended behavior is to publish a fresh kind-0 containing only `substack` (an honest minimal profile), rather than blocking the save. PO recommends: allow it — a kind-0 with just `substack` is valid.
- **Q4 (read-back freshness for the AC-2/AC-8 test):** kind-0 reads are best-effort fan-outs with a 3s timeout and may briefly lag a just-published write across public relays. Confirm whether the success response should echo the saved value optimistically (so the UI updates immediately) while propagation settles, rather than depending on an immediate re-read. PO recommends: echo optimistically; do not block the UI on a public-relay re-read.

## Linked artifacts
- ADR: `engineering-team/decisions/0022-substack-set.md`
- Test plan: `engineering-team/stories/done/22-substack-set.test-plan.md`
- Review: `engineering-team/reviews/22-substack-set.md` (PASS, re-verified at fix HEAD `b7e2496`)
