# Story 23: Follow / unfollow a user — the kind-3 contact-list write (safe merge)

**Status:** Done
**Created:** 2026-05-31
**Type:** Feature

## Background
Today Unbnd has no in-app way to follow anyone. Sovereign (NIP-07) users may have a follow graph published from another client; custodial (email) users have **no kind-3 at all**, which is why custodial GrapeRank personalization returns empty (phase2-prd §2.6: "only sovereign users can personalize; custodial users have no kind-3"). Building the follow graph is the prerequisite that unblocks custodial personalization — it produces the kind-3 events GrapeRank reads.

This story delivers the **follow / unfollow write** plus the supporting **follow-status** and **following-count** reads, surfaced as a polished control on the **public profile** (`/profile/:npub`). Following a curator adds a `p` tag to the viewer's NIP-02 **kind-3 contact list**; unfollowing removes it. Follows are real Nostr events for **all three tiers** — explicitly including custodial: the custodial server signs via the existing ephemeral-wrapped session key (ADR 0006), sovereign signs client-side via NIP-07. This is the in-app follow mechanism named in phase2-prd §2.6 and roadmapped as **Story 24 "Follow mechanism — kind-3 publish/update for custodial + sovereign; follow buttons."**

This is the same **class of problem we just shipped in Story 22** (the kind-0 Substack write). kind-3, like kind-0, is a **single replaceable event** (NIP-01 replaceable; latest `created_at` wins) that holds the user's **entire** list — every `p` tag for everyone they follow, each tag carrying NIP-02's optional relay-hint and petname positions (`["p", <hex>, <relay-hint?>, <petname?>]`). The MERGE-DON'T-CLOBBER hazard is identical: a follow/unfollow must fetch the user's **freshest RAW kind-3**, preserve ALL existing `p` tags **and their relay-hint/petname positions**, add or remove only the one target, re-sign, and publish. Anything less silently wipes the user's follow graph. The implementation mirrors Story 22's `fetchRawKind0` → merge → `buildKind0Template` → three-tier-sign → `publishKind0` path (`apps/api/src/nostr/profile.ts`, `apps/api/src/profile/substack-template.ts`, `apps/api/src/routes/profile-substack.ts`, and the `publishKind0` wiring in `apps/api/src/index.ts`).

**Relay-routing finding to honor (same as kind-0).** dcosl **rejects** non-DList kinds — it accepts only 39998/39999. So kind-3, like kind-0, must publish to the **external profile relays + the LOCAL strfry** (which accepts it), **NOT dcosl**. The local relay gates the response/read-back; profile-relay fan-out is best-effort fire-and-forget. Reads (the viewer's own kind-3 for follow-status, the target's kind-3 for following-count) come from the profile relays. This is exactly the `publishKind0` propagation model (ADR F2-A) — kind-3 reuses it.

Affected personas: any signed-in **Reader / Curator / Author** who wants to follow other users; and, downstream, every custodial user who today cannot personalize because they have no follow graph.

## User-facing description
As a signed-in user (sovereign or custodial), I want to follow and unfollow another user from their profile, so that I build the follow graph that powers my personalized "from people you trust" view — and so my follows are real Nostr contact-list events that travel with my identity, not locked inside Unbnd.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] **AC-1 — Follow control on the public profile, by tier and session state.** Given a signed-in user viewing another user's `/profile/:npub`, when the page loads, then a follow control renders reflecting their current follow status toward that target (see AC-2). Given a **signed-out** visitor, when they view a profile, then the control renders a sign-in affordance (a labeled prompt/link to `/auth`, no follow action fires). Given a user viewing **their own** profile (the path npub resolves to the session pubkey), then **no follow control renders** (self-follow prevention — you cannot follow yourself).

- [ ] **AC-2 — Follow status drives Follow vs Following.** Given a signed-in viewer whose freshest kind-3 already contains a `p` tag for the target, when the profile loads, then the control shows the **Following** state. Given a viewer whose kind-3 does **not** contain the target (including a viewer with no kind-3 at all), then the control shows the **Follow** state. The status is read from the **viewer's own** freshest kind-3 (across the profile relays), never fabricated.

- [ ] **AC-3 — Following = add a `p` tag (merge-preserve).** Given a signed-in viewer in the Follow state, when they activate the control, then the viewer's freshest RAW kind-3 is fetched, a `["p", <target-hex>]` tag is added, **every pre-existing `p` tag is preserved with its full positional payload unchanged** (relay-hint and petname intact), the event is re-signed (per tier) and published, and the control settles into the **Following** state. If the viewer had no kind-3, a fresh kind-3 containing only the target `p` tag is published.

- [ ] **AC-4 — Unfollowing = remove only that `p` tag (merge-preserve).** Given a signed-in viewer in the Following state, when they activate the unfollow affordance, then the viewer's freshest RAW kind-3 is fetched, **only** the `p` tag whose pubkey equals the target is removed, **all other `p` tags are preserved with their full positional payload unchanged**, the event is re-signed (per tier) and published, and the control settles into the **Follow** state. Unfollowing a target who is not currently followed is a no-op that does not error and does not strip anyone else.

- [ ] **AC-5 — Merge-don't-clobber: the whole follow list survives every write.** Given a viewer whose current kind-3 already follows **multiple** users (with at least one tag carrying a relay-hint and at least one carrying a petname), when they follow or unfollow **one** target, then the published kind-3 still contains every other follow with byte-identical positional payload, and only the one target tag is added/removed. The write must not drop, reorder-destructively, or strip the relay-hint/petname of any pre-existing follow. (Non-`p` tags present on the kind-3, if any, are likewise preserved.)

- [ ] **AC-6 — Sovereign tier signs via NIP-07.** Given a signed-in sovereign viewer (no email), when they follow/unfollow, then the kind-3 is signed in the browser through the existing NIP-07 path (`window.nostr.signEvent`), mirroring the rating/tag/shelf/Substack sovereign flow, and published. No private key touches the server. If no Nostr extension is present, an honest message is shown and nothing is published.

- [ ] **AC-7 — Custodial tier signs server-side; reauth when the key is gone.** Given a signed-in custodial (email) viewer with a live session key, when they follow/unfollow, then the server builds the merged kind-3 and signs it with that session's ephemeral-wrapped key (ADR 0006), then publishes it (satisfying phase2-prd §2.6 AC "follow/unfollow publishes kind-3 signed by the custodial key, in-session"). Given a custodial viewer whose live key is gone (process restart / evicted), when they follow/unfollow, then the response is the existing `reauth_required` 401 and no kind-3 is published — matching the rating/tag/shelf/Substack custodial behavior.

- [ ] **AC-8 — Published kind-3 propagates where it will be read.** Given any successful follow/unfollow, when the kind-3 is published, then it goes to the **local relay** (awaited, gates the response and read-back) and is fanned out **best-effort to the profile relays** — and **NOT to dcosl** (which rejects kind-3). After a successful write, a fresh follow-status read for that viewer→target pair reflects the new state. (Per Story-22 read-back lag, the success response may echo the new status optimistically rather than block on a public-relay re-read — see Open Questions.)

- [ ] **AC-9 — Following count on a profile is the target's own kind-3 `p`-tag count.** Given any `/profile/:npub` (viewer signed-in or not), when the page loads, then a **Following** count renders equal to the number of distinct `p` tags on the **target's** freshest kind-3 (one cheap event read; 0 when they have no kind-3). The count is honest — it is the real tag count, never fabricated, and is not silently capped (a single kind-3 event is well under any relay limit).

- [ ] **AC-10 — Honest control states; accessible interaction.** Given the follow control, when an action is in flight, succeeds, or fails, then the UI shows honest pending / settled / error states (an optimistic pending state on click, reverting on failure with an honest message — no fabricated success). The control is keyboard-operable, exposes `aria-pressed` reflecting follow status, and has a visible `:focus-visible` state. Labels use no-AI-slop copy (no em dashes, no "Seamlessly follow," etc.).

## Followers count — PO call: DEFERRED (out of scope for this story)
**Recommendation: defer followers-count.** It is the one hard, dishonest-by-construction read in this feature and it does not block the §2.6 goal (the follow graph is built by the writes + following-count alone).

Why it is hard, concretely:
- Followers-count requires querying relays for **all** kind-3 events whose `#p` tag includes the target — an **unbounded** fan-out over the entire network's contact lists, exactly the relay-cap honesty problem Story 21 (ADR 0021) just fixed for author-scoped stats. It cannot be answered from one event read the way following-count can.
- The current `NostrFilter` (`apps/api/src/nostr/query.ts`) supports `kinds`, `authors`, `limit` only — **there is no `#p` tag-filter wiring today.** Adding `#p`-filtered, paginated, honestly-capped relay reads is a meaningful separate piece of work, not a free rider on this story.
- Honest handling would mean a Story-21-style capped "N+" with the same caveats, over a far larger result set, and it would still be a per-relay-coverage lower bound rather than a true global count.

If the user wants followers-count, the honest path is a **follow-up story** that (a) extends `NostrFilter`/`queryEventsPaged` with `#p` support and (b) renders a capped "N+" reusing the Story-21 paginator. I recommend shipping Story 23 with **following-count only** and tracking followers-count separately. (Flagged as Open Question Q4 in case the user wants it folded in with honest capping.)

## DList shapes touched
No new DList shape. This story writes the existing **kind-3** (NIP-02 contact list) replaceable event for the signed-in viewer, adding/removing only the one target `p` tag, and reads kind-3 for follow-status (viewer's own) and following-count (target's own).

- `kind:3` — NIP-02 contact list. **New** read + write paths. Write: fetch-freshest-RAW → add/remove one `p` tag (preserve all others + their relay-hint/petname) → sign per tier → publish to local + profile relays (NOT dcosl). Reads: viewer's freshest kind-3 (`p`-tag membership = follow status), target's freshest kind-3 (`p`-tag count = following count). The exact endpoint shape, the raw-kind-3 fetch helper, and the merge/template-build location are the Architect's call; PO recommendations below are non-binding.

The kind-39999 community write paths (ratings/tags/shelves) and the kind-0 Substack write are **untouched**; this story only references the kind-0 Story-22 path as the structural model to mirror, and the Story-21 paginator as the thing followers-count *would* need (and which keeps it deferred).

## Architect questions (named, not solved)
These are the hazards this story names for the Architecture phase. The PO is flagging them, not deciding them.

1. **Merge-don't-clobber, including NIP-02 tag payloads.** kind-3 holds the user's whole follow list as `p` tags, each potentially `["p", hex, relay-hint, petname]`. The write must fetch the viewer's *current* kind-3 tags, add/remove *only* the one target `p` tag by pubkey (tag[1]), and preserve every other tag's full array unchanged — including relay-hint and petname positions, and any non-`p` tags. **Note for the Architect:** Story 22's `parseKind0` is lossy and the merge there operated on raw `content`; the kind-3 analogue must operate on the raw `tags` array (the follow data lives in `tags`, not `content` — kind-3 `content` is typically empty or a legacy relay-list JSON that must also be preserved verbatim). Decide the raw-kind-3 fetch + tag-merge representation. A `fetchRawKind3` mirroring `fetchRawKind0` is the obvious shape.

2. **Where "current kind-3" is fetched from, and where the result is published.** Same finding as kind-0: read the freshest kind-3 from the **profile relays** (a user's kind-3 may live on damus/primal/nos.lol/nostr.band, not on the local relay); publish to **local (awaited) + profile-relay fan-out (best-effort), NOT dcosl**. Reuse the `publishKind0` model (ADR F2-A). Confirm whether a dedicated `publishKind3` is warranted or `publishKind0` generalizes to "public-relay kinds."

3. **Concurrency / clobber risk (accepted limitation).** kind-3 is globally replaceable — latest `created_at` wins across all clients. If the user edits their follow list in another client between Unbnd's read and write, one write can shadow the other (and a stale read could resurrect a just-removed follow or drop a just-added one). Merge-from-freshest mitigates but does not eliminate this; the risk is *larger* than kind-0 because follow lists change more often and from more clients. The Architect should name this as an accepted limitation and decide whether any guard (re-read immediately before sign, `created_at` handling) is warranted at this scope.

4. **Who builds the merged template, per tier.** Mirror Story 22: for custodial the server fetches-current + merges + signs + publishes; for sovereign the server fetches-current + builds the merged unsigned template and returns it for the browser to sign via NIP-07, then accepts the signed event back. The Architect decides whether the merge happens server-side (template endpoint) or client-side, and whether follow and unfollow are one tier-branched intent (`{ target, action: "follow"|"unfollow" }`) or two endpoints.

5. **Follow-status + following-count read endpoints.** Follow-status needs the *viewer's* freshest kind-3 (`p` membership for one target); following-count needs the *target's* freshest kind-3 (`p`-tag count). Decide whether these are one endpoint (e.g. `GET /api/profile/:npub/follow` returning `{ following: boolean | null, followingCount: number }`, where `following` is null for signed-out) or fold into the existing `/profile/:npub/stats`. Note `following` membership is viewer-scoped (depends on the session), so it cannot be cached purely by path npub.

6. **Optimistic settle vs read-back (AC-8/AC-10).** kind-3 reads are best-effort fan-outs with a timeout and may lag a just-published write across public relays (same as Story 22's kind-0). Decide whether the write response echoes the new follow status optimistically so the control updates immediately, rather than depending on an immediate re-read.

## PO recommendation (non-binding — Architect decides the mechanism)
- **Button location: the public profile only, in the identity header of `/profile/:npub`** (`apps/web/src/routes/Profile.tsx`, the `me-head`/`me-id` block, beside the npub/nip05/substack line). Rationale: it is the one surface that already resolves a target pubkey and renders identity; it keeps this story tightly scoped; it is where phase2-prd §2.6 lists the buttons ("Follow/unfollow buttons live on profiles..."). **No split needed** for the write itself — but see "Recommended split" below for the byline buttons, which I recommend deferring.
- **Endpoint shape:** mirror Story 22 — `POST /api/profile/follow/template` (server fetches current kind-3, applies the add/remove, builds the merged unsigned kind-3 template) + `POST /api/profile/follow` (sovereign posts the signed `{ event }`; custodial posts the intent `{ target, action }` and the server signs with the session key). Plus a `GET` for follow-status + following-count (Architect question 5). Or fold writes into one tier-branched endpoint. Architect's call.
- **Signing:** reuse the audited stack only — NIP-07 `window.nostr.signEvent` for sovereign (as in `RatingControl.tsx`/`Settings.tsx`); `useSessionKey` + `finalizeEvent` for custodial (`apps/api/src/auth/ephemeral.ts`, wired via `userEventDeps.custodialSign` in `apps/api/src/index.ts`). No new signer, no hand-rolled crypto.
- **Web API:** add an `api.profile.follow / unfollow / followStatus`-style set to `apps/web/src/lib/api.ts`, paralleling `api.profile.substack*`.
- **Component:** a new `FollowButton` component derived from existing brand tokens + the button patterns already in the codebase (`rate-submit`, `set-save`, `AccountMenu` items). No icon libraries — any glyph (e.g. a check on Following) is hand-authored SVG or typographic, per house rules.

### Recommended split
Keep this story to the **profile follow control + status + following-count**. Defer to later stories:
- **Followers count** (its own story; needs `#p`-filter + paginator work — see the followers-count call above).
- **Follow buttons on rating/review BYLINES** (`ReviewsList`/byline surfaces) — same write machinery, different surface; fold in only if the user explicitly wants it, otherwise a thin follow-up once `FollowButton` exists.

If the Architect finds the write + status + count + the high design bar together exceed a comfortable single-story size, splitting the **read (status + following-count display)** from the **write (follow/unfollow action)** is the natural seam.

## Design bar (CALL-OUT — no wireframe exists)
**There is NO wireframe for this control.** The user has explicitly asked for it to be genuinely polished, not a shortcut. The canonical pattern to craft to:
- **Follow** state: filled, amber (`--u-amber`, hover `--u-amber-hover`) — the affirmative primary action.
- **Following** state: a quieter confirmed state (e.g. outline/`--u-surface` with a hand-drawn check glyph), which on **hover/focus reveals "Unfollow"** — typically in a destructive/red treatment (`--signal-negative`) so the consequence reads clearly.
- **Pending/optimistic** state on click (disabled + a "…" or subtle busy affordance), reverting on failure.
- **Accessible:** `aria-pressed` reflecting follow status, full keyboard operation (Enter/Space), a visible `:focus-visible` ring, and an accessible label that states the action and target.
- Derived from the **existing component system + brand tokens** (`apps/web/src/styles/tokens.css`), but **crafted to a high bar** — this is a flagship interactive control on a public surface.

**Flag for the gate:** the user may want to **review the visual at this gate or supply a reference** before the Architect/Implementer build it. Absent a reference, the Architect specifies the states and the Implementer crafts them from tokens. This is called out as Open Question Q1.

## Out of scope
Stated explicitly; do not let these creep in.
- **Followers count** — deferred (see the dedicated call above). Needs `#p`-filtered paginated reads (Story-21 machinery) and is dishonest-by-construction without honest capping. Not in this story.
- **Follow buttons on rating/review BYLINES** — profile-only this story (phase2-prd §2.6 lists bylines too; deferred to a thin follow-up once `FollowButton` exists, unless the user folds it in at the gate).
- **A dedicated "following / followers list" page** — no list-of-people screen; this story shows a *count* and a *button*, not a roster.
- **Custodial GrapeRank personalization itself** — this story builds the kind-3 graph that *unblocks* custodial personalization (phase2-prd §2.6 / the "Block C" personalization trigger), but the NIP-98 personalization trigger and the "Personalize" prompt for custodial users are a **separate story**. This is the prerequisite, not the payoff.
- **NIP-65 relay lists (kind 10002)** — out of scope. We honor any relay-hints already present in the user's kind-3 `p` tags (preserve them), but we do not author NIP-65 or use it for routing.
- **Petname editing** — we *preserve* petnames on existing `p` tags; we do not add a UI to set/edit them.
- **Eliminating the multi-client clobber risk** (Architect Question 3) — merge-from-freshest is the mitigation; a full conflict-resolution scheme is out of scope.
- PRD §11.3 Phase-2+ items generally that this does not touch: payments, Blossom file hosting, ebook sales, federation, email notifications, a social feed.

## Open questions
Resolve before approving the story.

- **Q1 (design review at the gate):** Do you want to review/approve the Follow / Following / Unfollow visual at this Planning gate, or supply a reference, before the Architect/Implementer craft it from tokens? (No wireframe exists; this is a deliberately high design bar.)
- **Q2 (button location confirmation):** Confirm the control lives on the **public profile only** for this story (PO recommendation), with rating/review byline buttons deferred to a follow-up — or do you want byline buttons folded in now?
- **Q3 (split):** Accept the single-story scope (write + status + following-count), or split read-display from the write action? PO leans single story; the design bar is the main size risk.
- **Q4 (followers-count):** Accept **deferred** (PO recommendation), or do you want it **in this story with honest Story-21-style "N+" capping** (which also requires extending `NostrFilter`/`queryEventsPaged` with `#p` support)?
- **Q5 (custodial users with no kind-3 yet):** Confirm the intended behavior is to publish a fresh kind-3 containing only the target `p` tag (an honest minimal contact list) on first follow, rather than blocking. PO recommends: allow it.
- **Q6 (read-back freshness / optimistic settle):** Confirm the write response may echo the new follow status optimistically (so the control updates immediately) while profile-relay propagation settles, rather than blocking on an immediate re-read. PO recommends: echo optimistically; do not block the UI on a public-relay re-read (same as Story 22).

## Linked artifacts
- ADR: `engineering-team/decisions/0023-follow-kind3.md`
- Test plan: `engineering-team/stories/done/23-follow-kind3.test-plan.md`
- Review: `engineering-team/reviews/23-follow-kind3.md` (PASS)
