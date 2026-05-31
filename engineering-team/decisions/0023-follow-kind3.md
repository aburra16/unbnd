# ADR 0023: Follow / unfollow — the kind-3 contact-list write (safe merge)

**Status:** Proposed
**Date:** 2026-05-31
**Story:** `engineering-team/stories/23-follow-kind3.md`

## Context

Story 23 delivers the in-app follow / unfollow write plus the supporting follow-status and following-count reads, surfaced as a crafted control on the public profile (`/profile/:npub`). Following a curator adds a `["p", <target-hex>]` tag to the viewer's NIP-02 **kind-3 contact list**; unfollowing removes it. Follows are real Nostr events for all three tiers, custodial included — the server signs custodial via the existing ADR 0006 ephemeral-wrapped session key; sovereign signs client-side via NIP-07. Building the kind-3 graph is the prerequisite that unblocks custodial GrapeRank personalization (phase2-prd §2.6).

This is the **same class of problem as Story 22** (ADR 0022, the kind-0 Substack write). kind-3, like kind-0, is a **single NIP-01 replaceable event** (latest `created_at` wins) holding the user's **entire** list. The MERGE-DON'T-CLOBBER hazard is identical: a write must fetch the freshest RAW event, preserve everything that is already there, change only the one target, re-sign, and publish — anything less silently wipes the user's follow graph. The one structural difference from kind-0: **the follow data lives in the `tags` array, not `content`.** Each `p` tag is NIP-02-shaped `["p", <hex>, <relay-hint?>, <petname?>]`, and those trailing positions, plus any non-`p` tags and the kind-3 `content` (sometimes a legacy relay-list JSON), must all survive verbatim.

The relay-routing finding from kind-0 carries over exactly: **dcosl rejects non-DList kinds** (39998/39999 only). kind-3 therefore publishes to the **LOCAL strfry (awaited, gates the response) + the external profile relays (best-effort fan-out), NOT dcosl** — the `publishKind0` propagation model (ADR 0022 F2-A). Reads (the viewer's own kind-3 for status, the target's own kind-3 for following-count) come from the profile relays.

**Existing assets this ADR mirrors / reuses (Story 22, ADR 0022):**

- `apps/api/src/nostr/profile.ts` — `pickNewestKind0`, `parseRawKind0Content`, `fetchRawKind0` (the RAW read; `fetchProfileMeta`'s best-effort fan-out + 3s timeout).
- `apps/api/src/profile/substack-template.ts` — `validateSubstackUrl` / `mergeSubstack` (clone-not-mutate) / `buildKind0Template` (pure, testable).
- `apps/api/src/profile/validate-kind0.ts` — `validateSignedKind0` (kind / hex-pubkey / pubkey-matches-session / `verifyEvent` / content guard).
- `apps/api/src/routes/profile-substack.ts` — the three-tier `/template` + tier-branched submit, dependency-injected.
- `apps/api/src/nostr/publish.ts` — `publishEvent` (single relay) + `publishToMany` (best-effort fan-out).
- `apps/api/src/index.ts` — `publishKind0` (local awaited gate + profile-relay fire-and-forget fan-out) and the router wiring with `fetchRaw`, `custodialSign`, `resolveSessionUser`.
- `apps/api/src/routes/profile-stats.ts` — the `GET /api/profile/:npub/stats` public twin (npub→hex via `toHex`, 404 on unresolvable, 60s TTL cache) — the model for the public following-count read.
- `apps/web/src/lib/api.ts` (`api.profile.substack*`), `apps/web/src/routes/Settings.tsx` (tier branch: `isSovereign = user.email === null` → NIP-07; else custodial), `apps/web/src/components/RatingControl.tsx` (`aria-pressed`, pending/error states, signed-out gate), `apps/web/src/styles/tokens.css`.

**Constraints carried in:**

- PRD anchor: phase2-prd **§2.6** (in-app follow mechanism; "follow/unfollow publishes kind-3 signed by the custodial key, in-session"). Does not touch §11.3 out-of-scope (no payments, federation, social feed, email notifications).
- **No hand-rolled crypto** (CLAUDE.md): NIP-07 `signEvent` for sovereign; ADR 0006 ephemeral wrap (`useSessionKey` + `finalizeEvent`) for custodial; verification via `verifyEvent`. No new signer.
- **nostr-native:** kind-3 is the NIP-02 contact list. No proprietary follow table; the follow graph travels with the identity.
- **npub-display / hex-internal**; **honest counts** (the real `p`-tag count, never fabricated, not silently capped); **honest control states** (optimistic pending, revert-on-failure, no fabricated success).
- **No new tooling, no new runtime dependency, no new DList shape.** kind-3 is an existing NIP-01 kind.
- The three architecture invariants (POV-first / decentralized-first / filter-at-view-time) are **not engaged** by the write or the following-count read: a user's own kind-3 is true for everyone who reads it, and following-count is the target's own self-asserted tag count, not a trust-weighted aggregate. (Followers-count, deferred below, *would* engage them — which is part of why it is deferred.)

This ADR does not contradict any prior ADR. It extends the ADR 0022 machinery to a second public-relay replaceable kind and deliberately reuses the profile-relay propagation target rather than the dcosl path (ADR 0011).

## Options considered

The real forks are: **(F1)** generalize the Story-22 raw-replaceable-write helpers vs. duplicate them for kind-3; **(F2)** the read-endpoint shape (status + following-count). The write-endpoint shape and `publishKind3` follow Story 22 almost verbatim and are not re-litigated as forks; they are stated in the Decision.

### F1 — Generalize the raw-replaceable-write skeleton vs. duplicate for kind-3

Story 22 established a four-step skeleton for a public-relay replaceable event: **fetch freshest RAW → merge (clone, change one thing) → build template (created_at bumped past the fetched event) → three-tier sign → publishKindN**. kind-3 needs the identical skeleton; only the *kind*, the *merge function*, and *what's preserved* (tags+content vs. content) differ.

#### Option A — Duplicate the skeleton for kind-3, share only the genuinely-kind-agnostic primitives (chosen)

Add kind-3 analogues alongside the kind-0 files, mirroring names so the Tester/Implementer/Reviewer recognize them 1:1:

- `fetchRawKind3` in `profile.ts` (mirrors `fetchRawKind0`) — but returns the freshest event's **`tags` array + `content` string + `created_at`** (not parsed content), because the follow data is in `tags`.
- A new pure module `apps/api/src/profile/follow-template.ts` (mirrors `substack-template.ts`): `mergeFollow(rawTags, targetHex, action)`, `buildKind3Template(tags, content, createdAt)`, and a typed `FollowError`.
- `validateSignedKind3` in a new `apps/api/src/profile/validate-kind3.ts` (mirrors `validate-kind0.ts`): kind 3, hex pubkey, pubkey-matches-session, `verifyEvent`, `tags` is an array.
- `buildProfileFollowRouter` (mirrors `buildProfileSubstackRouter`).
- `publishKind3` in `index.ts` (mirrors `publishKind0`).

**Genuinely shared, reused unchanged (NOT re-implemented):** `pickNewestKind0` is renamed/factored to a kind-parametric `pickNewest(events, kind)` (or a thin `pickNewestKind3` that calls a shared selector) — the newest-by-`created_at` reducer is identical; `publishEvent` + `publishToMany` are reused as-is; the session/cookie plumbing (`readSessionCookie`, `tokenToId`, `nextCreatedAt`) is small enough to lift into a tiny shared `apps/api/src/profile/replaceable-write.ts` helpers module **only if** it can be done without abstracting the kind-specific merge — `nextCreatedAt` and the cookie reader are the clean candidates; the merge and validate are NOT.

**Pros:**
- Each kind keeps a flat, readable, individually-testable merge with no `kind` branching inside the hot path. The kind-0 and kind-3 merges differ in a load-bearing way (content-object vs. tags-array preservation); folding them behind one generic interface hides exactly the thing most likely to regress (a clobber).
- Mirrors the project's established grain: ratings/tags/shelves each have their own `template.ts` + `validate.ts` + router, sharing only `publish`/`query`/`toWireTemplate`. The Tester already has a per-kind mental model.
- The pure `mergeFollow` is trivially unit-testable against AC-3/4/5 fixtures (multi-follow lists with relay-hints and petnames) without any generic-skeleton indirection.

**Cons:**
- Four new files closely paralleling four kind-0 files (some near-structural duplication in the router and the fetch wrapper). Accepted: the duplication is in the *plumbing* (cookie read, tier branch, 401/400/502 mapping), which is stable and already battle-tested; the *logic* (the merge) is genuinely different per kind and should not be shared.

#### Option B — Generalize into one `buildReplaceableKindRouter(kind, mergeFn, validateFn)` + one `fetchRawKind(kind)`

Parameterize the whole skeleton by kind + a merge function + a validate function, so kind-0 and kind-3 (and a future kind-10000 mute list, kind-10002 relay list) all flow through one router factory and one fetch.

**Pros:** one place for the three-tier branch, the 401/400/502 mapping, and the `created_at` bump; adding a future replaceable kind is "supply a merge + validate."

**Cons:**
- Premature: we have exactly **two** replaceable-kind writes and they differ on the single most dangerous axis (what the merge preserves and where — `content` object vs. `tags` array vs. a future `content`-stringified list). A generic `mergeFn` signature has to be the union of all of those, which reintroduces per-kind branching inside the "generic" code or forces an awkwardly wide interface.
- It would require **refactoring the shipped, reviewed ADR-0022 kind-0 path** to flow through the new generic factory to realize the DRY benefit — a production-source edit to working code, outside this story's scope and risk budget, for a second caller.
- Hides the clobber-critical merge behind an indirection, working against the "name the pattern, name the file, name the function" house rule and making the AC-5 merge-preserve guarantee harder to read at the call site.

Rejected for now. The skeleton **is** real and worth naming, but the right amount of sharing at N=2 is the small kind-agnostic primitives (the newest-by-created_at selector, `publishToMany`, the cookie reader, the `created_at` bump), not a generic router. Revisit generalization when a *third* replaceable-kind write lands (e.g. NIP-51 mute lists / NIP-65 relay lists) — that is the point where the pattern's invariants are known and a factory pays off. (Recorded as a follow-up note below.)

### F2 — Read endpoint shape (follow-status + following-count)

Follow-status is **viewer-scoped** (does the session user follow this target — depends on the session, cannot be cached by path npub alone). Following-count is **target-scoped** (the target's own `p`-tag count — cacheable by path npub, like `/stats`).

#### Option A — Two endpoints split by scope: session-gated status + public count (chosen)

- `GET /api/profile/follows/:target` — **session-gated** (401 `no_session` when signed-out). Resolves `:target` (npub or hex) via `toHex`; reads the **viewer's** freshest kind-3; returns `{ following: boolean }` (true iff a `p` tag for the target hex is present). Self (`target === session.pubkeyHex`) → `{ following: false }` (you never follow yourself; the UI also suppresses the control, AC-1).
- **Following-count: fold into the existing public profile read or `/stats`, scoped to the *target*.** The target's following-count is the count of distinct `p` tags on the **target's** freshest kind-3 — one cheap read, cacheable by path npub exactly like the other public counts. Add a `followingCount` field to the `GET /api/profile/:npub/stats` response (reusing its `toHex` + 60s TTL + present-on-success / omit-on-throw discipline): run a fourth parallel read (the target's kind-3) inside `statsFor`, count distinct `p` tags, surface `followingCount` as a present number (incl. a true 0) or omit on throw. The web renders it as a fourth stat cell.

**Pros:**
- Each endpoint matches its cacheability: status is viewer-scoped and uncacheable-by-path (correctly session-gated, no cache); count is target-scoped and rides the existing `/stats` TTL cache and `statsFor` omit-on-throw machinery for free.
- Reuses the ADR 0019/0020/0021 stats plumbing (parallel reads, present-vs-omit, capped-key discipline) verbatim — no new public read endpoint, no new cache.
- The status endpoint is a single tiny session-gated handler with no caching to get wrong.

**Cons:**
- Two call sites on the web (`api.profile.followStatus(target)` and the existing `api.profile.stats(npub)` now also yields `followingCount`). Accepted — they are genuinely two different scopes and the web already calls `stats` on the profile.

#### Option B — One combined `GET /api/profile/:npub/follow` → `{ following: boolean | null, followingCount: number }`

One endpoint returns both: `following` is the viewer→:npub relation (`null` when signed-out), `followingCount` is the :npub target's count.

**Pros:** one round-trip; one web method.

**Cons:**
- Mixes a **viewer-scoped, uncacheable** field (`following`) with a **target-scoped, cacheable** field (`followingCount`) in one response, so the whole response can't be path-cached without leaking one viewer's follow state to another. You'd have to either drop caching (losing the `/stats` cache benefit for the count) or split internally anyway (same two reads, one wrapper). It muddies the clean "public count = cacheable by path / private status = session-only" seam the rest of the profile surface already follows.

Rejected: it couples two different cache lifetimes. Option A keeps the honest separation and reuses more.

## Decision

We chose **F1-A (duplicate the skeleton; share only the kind-agnostic primitives)** and **F2-A (split session-gated status from the public, `/stats`-folded following-count)**. The write-endpoint shape, signing, and propagation follow ADR 0022 directly.

1. **Raw kind-3 read + merge (server-side, pure, testable).**
   - `fetchRawKind3(relays, pubkeyHex, queryFn?)` in `profile.ts` returns the freshest kind-3's `{ tags: string[][]; content: string; createdAt: number } | { tags: null; content: ""; createdAt: null }` (null when no relay has a kind-3). Same best-effort fan-out + 3s timeout as `fetchRawKind0`; reuses a kind-parametric newest-by-`created_at` selector. Does **not** parse `content`.
   - `mergeFollow(rawTags: string[][] | null, targetHex: string, action: "follow" | "unfollow"): string[][]` in `apps/api/src/profile/follow-template.ts` — **CLONE** the tags array (deep enough that no source tag array is mutated). `follow`: if no existing `p` tag has `tag[1] === targetHex`, append `["p", targetHex]`; if one already exists, **no-op** (idempotent, no duplicate). `unfollow`: remove **only** the `p` tag(s) whose `tag[1] === targetHex`; if none match, no-op (does not error, strips no one else). **Every other tag — every other `p` tag with its full `["p", hex, relayHint?, petname?]` payload, and every non-`p` tag — is preserved byte-identically in its original position.** `null` tags (viewer had no kind-3) + `follow` ⇒ `[["p", targetHex]]`; `null` + `unfollow` ⇒ `[]`.
   - `buildKind3Template(tags, content, createdAt): NostrEventTemplate` — `{ kind: 3, created_at: createdAt, content, tags }`. **`content` is preserved verbatim from the fetched event** (kind-3 content is occasionally a legacy relay-list JSON; never clobber it; `""` when there was no event). Not `toWireTemplate` (DList-only). `created_at` bumped strictly past the fetched event via the existing `nextCreatedAt` helper so replacement wins.
   - Target hex is derived server-side from the request via `toHex` (npub or hex accepted); a self-follow (target === session pubkey) is rejected before any merge.

2. **Three-tier write endpoints** (mirror `profile-substack.ts`), in a new `apps/api/src/routes/profile-follow.ts` via `buildProfileFollowRouter(deps)` (DI: `config`, `sessionUser`, `publish`, `fetchRaw`, optional `custodialSign`):
   - `POST /api/profile/follow/template` — **session-gated** (401 `no_session`). Body `{ target, action: "follow" | "unfollow" }`. Resolve target via `toHex` (400 `invalid_target` if unresolvable); **self-follow → 400 `self_follow`** (`target === user.pubkeyHex`); `fetchRaw(user.pubkeyHex)`; `mergeFollow`; return `{ template }` (unsigned kind-3, `created_at` bumped). Sovereign clients sign this.
   - `POST /api/profile/follow` — tier-branched submit:
     - **Custodial:** body `{ target, action }`. Resolve + self-follow guard (400) as above. `fetchRaw` + `mergeFollow` + `buildKind3Template`; `custodialSign(sessionIdHex, template)` → `null` ⇒ **401 `reauth_required`** (no publish); else `publish(signed)`; `!ok` ⇒ 502 `publish_failed`; else 200 `{ following: action === "follow" }` (optimistic echo of the settled state).
     - **Sovereign:** body `{ event }` (client-signed) **+ a redundant `{ target, action }` hint**. `validateSignedKind3(event, user.pubkeyHex)` (kind 3 / hex pubkey / pubkey matches session / `verifyEvent` / `tags` is an array) → 403 on `pubkey_mismatch`, 400 otherwise; self-follow guard against the hinted target (400 `self_follow`); `publish(event)`; 502 on `!ok`; 200 `{ following: action === "follow" }`. The server does not re-derive membership from the signed event's tags for the echo — it echoes the requested action (optimistic; AC-8/Q6). (Like kind-0, the signed event is the source of truth on the wire; the server's guard pins identity + structure, not the full merge.)
     - **Anonymous** ⇒ 401 `no_session`.
   - Empty kind-3 / unfollow-when-not-following / follow-when-already-following are all idempotent no-op merges that still publish a valid (bumped) event and echo the requested settled state.

3. **Follow-status + following-count reads (F2-A).**
   - **Status:** `GET /api/profile/follows/:target` in `profile-follow.ts`, **session-gated** (401 when signed-out — the web treats signed-out as "render the sign-in affordance," it does not call this). Resolve `:target` via `toHex` (404 `not_found` if unresolvable). Self (`:target === session pubkey`) ⇒ `{ following: false }`. Else read the **viewer's** freshest kind-3 (`fetchRaw(user.pubkeyHex)`) and return `{ following: <a p tag with tag[1] === targetHex exists> }`. No cache (viewer-scoped).
   - **Following-count:** add `followingCount?: number` to the `GET /api/profile/:npub/stats` response in `profile-stats.ts`. Inside `statsFor(author)`, run a fourth parallel, independently-wrapped read of the **author's** kind-3; on success set `followingCount` = count of **distinct** `p`-tag `tag[1]` hex values (a present 0 when they have a kind-3 with no follows, or no kind-3); omit `followingCount` on throw (same omit-on-throw as the other cells). The count is honest and **uncapped** — it is one user's own bounded follow list in a single event, well under any relay event-size limit. (See "single-event size" note in Consequences.) The web renders it as a "Following" stat cell.

4. **Publish — `publishKind3` (mirror `publishKind0`, F2-A).** In `index.ts`, add `publishKind3` identical to `publishKind0`: `await publishEvent(config.strfryUrl, event)` first (gates the response + read-back), then on local success `void publishToMany(config.profileRelays, event)` fire-and-forget (logs failures, never blocks). dcosl is **excluded** (it rejects kind-3); `config.profileRelays` already carries the four public relays (+ dcosl appended, which simply NACKs kind-3 harmlessly). Reuse `publishToMany` and `publishEvent` unchanged. Wire `buildProfileFollowRouter({ config, sessionUser: resolveSessionUser, publish: publishKind3, fetchRaw: (hex) => fetchRawKind3(config.profileRelays ?? [], hex), custodialSign: userEventDeps.custodialSign })`. (`publishKind0` and `publishKind3` are byte-identical bodies differing only in the log prefix; factor a single `publishPublicRelayKind(label)` helper in `index.ts` if the Implementer prefers — a local, low-risk DRY that does not touch the routers.)

5. **Web — the crafted `FollowButton` (high design bar; no wireframe).**
   - New `apps/web/src/components/FollowButton.tsx` + `FollowButton.css`, rendered in `Profile.tsx`'s identity header (`me-id` block, beside the npub/nip05/substack line). Props: the target npub/hex (and the resolved hex once known).
   - **Render rules (AC-1):** signed-out → a labeled sign-in affordance (`<Link to="/auth">Sign in to follow</Link>`, no follow action). Viewing **own** profile (path npub resolves to session pubkey) → **no control**. Otherwise the follow control.
   - **States (the canonical crafted pattern):**
     - **Follow:** filled amber (`--u-amber`, hover `--u-amber-hover`) — the affirmative primary action. Label "Follow". `aria-pressed={false}`.
     - **Following:** a quiet confirmed state (outline / `--u-surface`, `--u-border`) with a **hand-authored SVG check glyph** (a short two-segment polyline, `stroke="currentColor"`, `aria-hidden`) — no icon library. Label "Following". `aria-pressed={true}`. On **hover/focus** it reveals the **Unfollow** affordance in a destructive treatment (`--signal-negative` text/border) so the consequence reads clearly; activating it while in this revealed state performs the unfollow. (Implement as a single button whose hover/focus state swaps the visible label "Following" → "Unfollow" and the color to negative, with the accessible name updating accordingly — keyboard users reach the Unfollow state via `:focus`, not hover-only.)
     - **Pending/optimistic:** on click, immediately flip to the target state optimistically and show a subtle busy/disabled affordance ("…" or reduced emphasis, `disabled` during the in-flight request). On failure, **revert** to the prior state and show an honest inline message (no fabricated success).
   - **Accessibility (AC-10):** real `<button>`, full keyboard operation (Enter/Space), `aria-pressed` reflecting follow status, an accessible label that states action + target (e.g. "Follow {displayName}" / "Following {displayName}, activate to unfollow"), and a visible `:focus-visible` ring derived from tokens.
   - **Tier branch (mirror `Settings.tsx` / `RatingControl.tsx`):** `isSovereign = user.email === null`. Sovereign → `api.profile.followTemplate({ target, action })` → `window.nostr.signEvent(template)` (no extension ⇒ honest message, nothing published) → `api.profile.follow(signed, { target, action })`. Custodial → `api.profile.followCustodial({ target, action })`. On success, settle to the echoed state. (No profile-cache bust needed; follow status is its own read, not part of `useProfileMeta`.)
   - **Following count:** `Profile.tsx` already calls `api.profile.stats(npub)`; surface the new `followingCount` as a "Following" cell in `statCells` (present-number → cell, absent → no cell, exactly like the other stats; a true 0 renders 0). No new fetch.
   - `apps/web/src/lib/api.ts` — add to `api.profile`: `followTemplate({ target, action })`, `follow(event, hint)`, `followCustodial({ target, action })`, `followStatus(target)` → `{ following: boolean }`. `ProfileStatsResponse` gains optional `followingCount`.
   - **Copy** (reviewed against `memory/feedback_unbnd_copy_and_visual.md`): "Follow", "Following", "Unfollow", "Sign in to follow", and an honest error ("Could not update your follow. Try again." — no em dash, no "Seamlessly", no exclamation CTA). No emoji-as-icon (the check is hand-authored SVG).

6. **Concurrency (accepted limitation, larger than kind-0).** kind-3 is globally replaceable, latest-`created_at` wins across every client, and follow lists change more often and from more clients than kind-0. Merge-from-freshest mitigates but does not eliminate a cross-client clobber. **Guard:** fetch the freshest kind-3 **at template-build / sign time** (immediately before signing), not from a stale cache — already inherent in the design (custodial fetches inside the submit; sovereign fetches inside `/template` right before the client signs). No locking, no re-read-after-sign retry at this scope. Named as an accepted limitation; a future re-read-and-rebuild-on-conflict guard is out of scope.

## FOLLOWERS COUNT — deferred; future direction recorded (NIP-85 / GrapeRank, not a `#p` relay scan)

Followers-count is **out of scope for this story** (PO call, honored). When it is added in a follow-up story, this ADR records the **chosen future direction** so the follow-up honors it:

- **Do NOT compute followers-count by scanning standard relays for kind-3 events whose `#p` tag includes the target.** That is an unbounded fan-out over the entire network's contact lists and is dishonest-by-construction against the relay 500-cap (the same honesty problem ADR 0021 fixed for author-scoped stats). The current `NostrFilter` (`apps/api/src/nostr/query.ts`) has no `#p` wiring today, and adding `#p`-filtered paginated reads only buys a per-relay-coverage lower bound, not a true global count.
- **Instead, pull "verified followers" from GrapeRank / Brainstorm via NIP-85 `kind:30382`** (the same trust source already wired for trust-weighting, ADR 0014/0017 — `config.brainstormApiUrl` / `config.trustRelays`). A NIP-85 follower attestation set is a bounded, trust-anchored count that is honest to display, and it engages the POV-first invariant correctly (followers "that this POV trusts" rather than a raw, gameable global tally). The follow-up story should source followers-count from the 30382 path, not from a raw `#p` relay scan.

This keeps following-count (this story: the target's own bounded kind-3, cheap + exact + honest) cleanly separated from followers-count (future: trust-anchored via 30382).

## Consequences

- **Enables** the in-app follow graph for all three tiers — the prerequisite that unblocks custodial GrapeRank personalization (phase2-prd §2.6) — plus an honest following-count, surfaced as a crafted, accessible control on the public profile.
- **Constrains / reuses:** kind-3 rides the same external-public-relay write path as kind-0 (ADR 0022) — best-effort propagation, no guarantee every public relay took the event; the optimistic echo covers the UI. dcosl is intentionally not a kind-3 target.
- **Debt / follow-ups:**
  - The multi-client clobber window remains (documented, larger than kind-0; not closed).
  - **Followers-count** is a separate story, to be sourced from NIP-85 `kind:30382` (recorded above), not a `#p` relay scan.
  - **Follow buttons on rating/review bylines** are deferred — a thin follow-up reusing `FollowButton` once it exists.
  - **Generalize-the-replaceable-write-skeleton** is deferred to the *third* replaceable-kind write (e.g. NIP-51 mute list / NIP-65 relay list); at N=2 the small shared primitives (newest-by-`created_at` selector, `publishToMany`, cookie reader, `nextCreatedAt`) are the right amount of sharing.
- **Affects existing fixtures?** No production fixtures change. `Profile.tsx` reuses the existing `me-head`/`me-id`/`ProfileStats` surface; the new `followingCount` is additive to the `/stats` response (omit-on-absent, so existing stats consumers are unaffected). Tests mock the new `fetchRaw` (kind-3) / `publish` / `custodialSign` deps the same way the ratings + substack suites do.
- **New dependency?** No. Uses existing `nostr-tools/pure` (`finalizeEvent`, `verifyEvent`), `publishEvent` / `publishToMany`, the ADR 0006 ephemeral wrap, `toHex`, and NIP-07 in the browser.
- **PRD section change required?** No. In phase2-prd §2.6 scope; does not touch §11.3.
- **Brand tokens / copy:** `FollowButton` uses only `tokens.css` (`--u-amber`, `--u-amber-hover`, `--u-surface`, `--u-border`, `--signal-negative`, the radius/focus tokens). No new hex literal, no new icon library (the check is hand-authored SVG). All strings reviewed against `memory/feedback_unbnd_copy_and_visual.md`.
- **Single-event size note (AC-9 honesty):** following-count reads one kind-3. A pathological follow list could in principle approach a relay's per-event size limit; in practice a single user's contact list (even thousands of follows) is well under typical relay limits and is returned as one event by the `limit: 1` newest-wins read. We display the real count of distinct `p` tags on that event, uncapped. If a deployment ever sees a relay truncate a kind-3, that is a relay-side failure that surfaces as the read throwing → the cell is omitted (omit-on-throw), never a silently-capped number.

## Implementation notes

Concrete files and boundaries for the Implementer. Mirror the ADR-0022 kind-0 path; the deltas from kind-0 are called out.

### API — raw kind-3 read + merge

- **File: `apps/api/src/nostr/profile.ts`** — add, alongside the kind-0 helpers:
  - Factor the newest-by-`created_at` reducer to a kind-parametric selector (or add `pickNewestKind3`) — same logic as `pickNewestKind0`, filtered to `kind === 3`.
  - `fetchRawKind3(relays, pubkeyHex, queryFn?)` — mirror `fetchRawKind0`'s fan-out + 3s timeout + `limit: 1`; return `{ tags: string[][] | null; content: string; createdAt: number | null }` (the freshest event's `tags` and `content` untouched; `tags: null`, `content: ""`, `createdAt: null` when no event). Do **not** parse content.
- **File: `apps/api/src/profile/follow-template.ts`** (new) — pure, mirrors `substack-template.ts`:
  - `FollowError` (codes `invalid_target` | `self_follow`) typed like `SubstackError`.
  - `mergeFollow(rawTags: string[][] | null, targetHex: string, action: "follow" | "unfollow"): string[][]` — clone-not-mutate; add/remove only the one `p` tag by `tag[1]`; preserve all other tags' full arrays + positions verbatim; idempotent both directions (see Decision 1).
  - `buildKind3Template(tags: string[][], content: string, createdAt: number): NostrEventTemplate` → `{ kind: 3, created_at: createdAt, content, tags }`.
- **File: `apps/api/src/profile/validate-kind3.ts`** (new) — `validateSignedKind3(event, sessionPubkeyHex)`: mirror `validate-kind0.ts`. Check `kind === 3`, hex pubkey, `pubkey === session` (else `pubkey_mismatch`), `verifyEvent` passes, `Array.isArray(tags)`. (No content-field guard — kind-3 content is free-form/legacy and preserved as-is.)

### API — routes + wiring

- **File: `apps/api/src/routes/profile-follow.ts`** (new) — `buildProfileFollowRouter(deps)`, DI identical to `buildProfileSubstackRouter` (`config`, `sessionUser`, `publish`, `fetchRaw`, optional `custodialSign`). Reuse `readSessionCookie`, `tokenToId`, `nextCreatedAt` (lift the latter two-or-three into a shared `profile/replaceable-write.ts` if clean, else duplicate — low-risk plumbing). Routes:
  - `POST /api/profile/follow/template` — session-gated; resolve target (`toHex`, 400 `invalid_target`); self-follow → 400 `self_follow`; `fetchRaw` + `mergeFollow` + `buildKind3Template(nextCreatedAt(createdAt))`; `{ template }`.
  - `POST /api/profile/follow` — tier-branch (custodial intent-signs server-side, `reauth_required` 401 when key gone; sovereign `validateSignedKind3` then publish); anon 401; 502 on publish failure; 200 `{ following: action === "follow" }`.
  - `GET /api/profile/follows/:target` — session-gated; `toHex` (404 `not_found`); self → `{ following: false }`; else read viewer's kind-3, `{ following: <p-tag membership> }`.
- **File: `apps/api/src/routes/profile-stats.ts`** — add a fourth parallel read in `statsFor`: the author's kind-3 (via a kind-3 read; either an injected `fetchRaw`-style dep or a `query({ kinds:[3], authors:[author], limit:1 })`), count distinct `p`-tag hexes → present `followingCount` (incl. 0) or omit-on-throw. Extend the `Stats` type with `followingCount?: number`. Keep the 60s TTL + present-vs-omit discipline.
- **File: `apps/api/src/index.ts`** — add `publishKind3` (mirror `publishKind0`; or factor a shared `publishPublicRelayKind(label)`). Wire `buildProfileFollowRouter({ config, sessionUser: resolveSessionUser, publish: publishKind3, fetchRaw: (hex) => fetchRawKind3(config.profileRelays ?? [], hex), custodialSign: userEventDeps.custodialSign })`. If `profile-stats` needs a kind-3 read dep, inject `(hex) => fetchRawKind3(config.profileRelays ?? [], hex)` (or reuse the existing `query`).
- **File: `apps/api/src/nostr/publish.ts`** — unchanged; reuse `publishEvent` + `publishToMany`.

### Web

- **File: `apps/web/src/lib/api.ts`** — add to `api.profile`: `followTemplate({ target, action })` → `POST /api/profile/follow/template` `{ template }`; `follow(event, { target, action })` → `POST /api/profile/follow` `{ event, target, action }`; `followCustodial({ target, action })` → `POST /api/profile/follow` `{ target, action }`; `followStatus(target)` → `GET /api/profile/follows/:target` `{ following }`. Add `followingCount?: number` to `ProfileStatsResponse`.
- **File: `apps/web/src/components/FollowButton.tsx`** (new) + `FollowButton.css` (new) — the crafted control (Decision 5). `useSession` for tier + own-profile detection; render rules + states + a11y + tier branch as specified. Hand-authored SVG check; tokens-only styling.
- **File: `apps/web/src/routes/Profile.tsx`** — render `<FollowButton target={npub} />` in the `me-id` block (after the substack line); add a "Following" cell to `statCells` from `stats.followingCount` (present-number → cell, absent → no cell).
- **Styling:** `FollowButton.css` reuses the established button/token patterns (`rate-submit` / `set-save` shape); amber accent for Follow, `--u-surface`/`--u-border` for Following, `--signal-negative` for the revealed Unfollow, a `:focus-visible` ring. No new hex literal, no icon library.

### DList shapes

None. kind-3 is an existing NIP-01 replaceable event; no new kind, d-tag, word-wrapper, or concept header. The kind-39999 ratings/tags/shelves paths and the kind-0 Substack path are untouched and referenced only as structural models.

## Out of scope

- **Followers count** — deferred; future direction is NIP-85 `kind:30382` (GrapeRank/Brainstorm), **not** a `#p` relay scan (recorded above). No `NostrFilter` `#p` wiring in this story.
- **Follow buttons on rating/review bylines** — profile-only this story; a thin follow-up once `FollowButton` exists.
- **A following/followers list page** — this story shows a *count* and a *button*, not a roster.
- **Custodial GrapeRank personalization itself** — this builds the kind-3 graph that unblocks it; the personalization trigger/prompt is a separate story.
- **NIP-65 relay lists (kind 10002)** — we *preserve* relay-hints already present on `p` tags; we do not author NIP-65 or use it for routing.
- **Petname editing** — we *preserve* petnames on existing `p` tags; no UI to set/edit them.
- **Eliminating the multi-client clobber risk** — merge-from-freshest is the mitigation; full conflict resolution is deferred.
- **Generalizing the replaceable-write skeleton into a generic factory** — deferred to the third replaceable-kind write.
- PRD §11.3 Phase-2+ items this does not touch: payments, Blossom, ebook sales, federation, email notifications, social feed.
