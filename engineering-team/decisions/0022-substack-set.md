# ADR 0022: Set your Substack link — the first kind-0 profile write (safe merge)

**Status:** Proposed
**Date:** 2026-05-30
**Story:** `engineering-team/stories/22-substack-set.md`

## Context

Story 20 (ADR 0020) added a **read-only** "Writes on Substack" link to `/profile/me` and `/profile/:npub`. The display reads a dedicated `substack` field off the user's kind-0 metadata via `parseKind0` (`apps/api/src/nostr/profile.ts`), light-validated as an http(s) URL by `httpUrl`. Story 22 delivers the **write**: a signed-in user can set, change, or clear that URL from inside Unbnd, and the existing display then reflects it.

This is the app's **first kind-0 (NIP-01 user metadata) write**. Every prior kind-0 interaction has been read-only (ADR 0012, ADR 0020). All prior *writes* have been kind-39999 DList events (ratings, tags, shelves, submissions — ADRs 0005/0006/0009/0011/0016/0018). kind-0 differs from those in three architecturally load-bearing ways:

1. **kind-0 is a single replaceable event holding the user's *whole* profile** (name, picture, about, website, nip05, lud16, banner, and any field set by other clients). The write must touch only `substack` and preserve everything else. This is NOT a DList word-wrapper payload — kind-0 `content` is a flat JSON object and `tags` is `[]`.
2. **kind-0 lives on the profile relays, not dcosl.** Reads fan out over `config.profileRelays` (damus / primal / nos.lol / nostr.band, plus dcosl appended). Story 20 observed a user's freshest kind-0 living on damus/primal and *not* dcosl. The kind-39999 write path (ADR 0011) dual-publishes to **local + dcosl**, which is the wrong target for kind-0 — the change would be stranded where nobody reads it.
3. **`parseKind0` is lossy.** It projects kind-0 down to a known `ProfileMeta` (`name`, `displayName`, `picture`, `nip05`, `about`, `substack`) and silently drops `lud16`, `banner`, `website`, and anything else. A merge built on `parseKind0` would clobber the user's other metadata. This is the central hazard the story flags (Architect Question 1).

**Constraints carried in:**

- PRD anchor: phase2-prd **Appendix C-1 "External writing link"**. In phase-2 scope; does not touch PRD §11.3 out-of-scope (no payments, no federation, no OAuth identity-mapping — the separate C-3 note).
- **Not a profile editor.** This story sets/clears ONLY `substack`. No name/bio/picture/nip05/lud16/website editing (story Out of scope).
- **No hand-rolled crypto** (CLAUDE.md). NIP-07 `signEvent` for sovereign; the ADR 0006 ephemeral-wrap (`useSessionKey` + `finalizeEvent`) for custodial. kind-0 is signed like any other event.
- **npub-display / hex-internal**; **honest save states** (no fabricated success).
- **No new tooling, no new runtime dependency, no new DList shape.** kind-0 is an existing NIP-01 kind.
- This story does not touch any POV / GrapeRank / trust path — kind-0 is the user's own self-asserted metadata, not a trust-weighted aggregate. The three architecture invariants are not engaged (a user's own profile is true for everyone who reads it; there is nothing to filter per-POV).

This ADR does not contradict any prior ADR. It *extends* ADR 0012's read surface with a write, and deliberately uses a **different propagation target** than ADR 0011 (profile relays, not dcosl-only) — called out explicitly below rather than silently diverging.

## Options considered

The three real forks are: **(F1)** where the merge happens and the endpoint shape; **(F2)** how the merged kind-0 reaches the profile relays (publish fan-out mechanism); **(F3)** the UI surface. Each is presented as A/B.

### F1 — Merge location and endpoint shape

#### Option A — Server fetches + merges; tier-branched single endpoint (chosen)

Mirror the ratings/shelves shape exactly:

- `POST /api/profile/substack/template` — server resolves the session user, fetches the user's **freshest raw kind-0** from the profile relays, validates the input URL, merges `substack` into the raw content (or deletes the key when clearing), and returns an **unsigned kind-0 template** with `created_at = now`. Used by sovereign clients.
- `POST /api/profile/substack` — tier-branched:
  - **Sovereign:** body `{ event }` (a client-signed kind-0). Server validates (kind 0, pubkey matches session, valid signature, and — critically — that the **signed content still carries the server-merged fields**, see Implementation notes) → publishes.
  - **Custodial:** body `{ url }` (the intent; empty/absent = clear). Server fetches + merges + signs via the ephemeral wrap → publishes.
  - **Anonymous:** 401 `no_session`.

The merge always happens **server-side**, for both tiers. The sovereign client only signs the bytes the server produced.

**Pros:**
- Identical to the rating/tag/shelf pattern (`/template` + tier-branched submit), so the Tester, Implementer, and Reviewer all recognize it; the web `api.profile.setSubstack` method parallels `api.ratings`.
- The server is the only place that can authoritatively fetch the freshest kind-0 (it has the profile-relay fan-out already; the browser would have to re-implement relay reads). Putting the merge server-side keeps the lossy-merge hazard in **one** audited place.
- The clear path (delete the key) is identical server-side for both tiers.

**Cons:**
- The sovereign flow is two round-trips (template, then submit). Already true for ratings; accepted.
- The server fetches the kind-0 twice for a sovereign user (once to build the template, the client signs, then the server must trust the returned content). Mitigated by re-validating the signed content server-side rather than re-fetching+re-merging.

#### Option B — Client fetches its own kind-0 and does the whole merge in the browser

The web reads the user's kind-0 directly from relays (new browser-side relay read), merges `substack`, signs (sovereign) or POSTs the merged content for the server to sign (custodial).

**Pros:** one fewer server round-trip for sovereign; no template endpoint.

**Cons:**
- Forces a **second relay-read implementation in the browser** (we have none today; all reads go through the API). New surface, new failure modes, duplicated fan-out/timeout logic.
- The lossy-merge hazard would live in the browser *and* the server (custodial still merges server-side), doubling the place a regression could drop fields.
- Custodial would have to POST the *entire* merged kind-0 content (all the user's fields) up to the server, which then signs it blind — the server can no longer guarantee it didn't drop a field, because it didn't do the merge.

Rejected: it spreads the single most dangerous operation (the merge) across two codebases and invents a browser relay-read layer the project deliberately doesn't have.

### F2 — Publish fan-out to the profile relays

#### Option A — A dedicated best-effort `publishToMany` over `config.profileRelays`, local first (chosen)

kind-0 publish does **not** reuse the shared `publish` wrapper (which is local + dcosl). Instead:

1. Publish to the **local relay** (`config.strfryUrl`) first, via the existing `publishEvent`. This is the source of truth that gates the API response and the writer's read-back (same role local plays in ADR 0011).
2. On local success, **fan out** the same signed event to **every relay in `config.profileRelays`** best-effort, in parallel, via a thin `publishToMany(urls, event)` helper that wraps `publishEvent` per URL. `config.profileRelays` already includes the four public relays *and* dcosl (config appends it), so a single set covers both "where kind-0 is read" and the shared backbone. Failures are logged, never block the response (mirrors `withUpSync`'s fire-and-forget discipline).

The local publish is awaited (gates the 200); the profile-relay fan-out is **not** awaited.

**Pros:**
- Sends the updated kind-0 exactly where the read path (`fetchProfileMeta`) looks for it — the change becomes visible to clients reading the user's kind-0.
- Reuses `publishEvent` unchanged (single-relay primitive); the new code is a trivial `Promise.all(urls.map(publishEvent)).catch`.
- Local-first preserves the ADR 0011 invariant that the local relay gates the response and read-back.

**Cons:**
- **This is the app's first WRITE to external public relays.** Until now Unbnd has only *read* them. The public relays may rate-limit, reject (e.g. PoW / paid-relay requirements), or accept-then-drop. Because the fan-out is best-effort and not awaited, a public-relay rejection does not fail the user's save — but it does mean a save can report success while one or more public relays didn't take it. The optimistic echo (F3) covers the UI; eventual propagation is best-effort, matching how kind-0 propagation works on nostr generally. **This is the headline item for the user to weigh in on (see "Decisions for the user").**

#### Option B — Reuse the shared `publish` wrapper (local + dcosl only)

Publish the kind-0 through the same `publish` used for ratings.

**Pros:** zero new publish code; never writes to external relays (no new hazard).

**Cons:** Story-20 showed kind-0 frequently lives on the public profile relays and **not** dcosl. A kind-0 written only to local + dcosl is invisible to any client (including a fresh `fetchProfileMeta` from another instance) that reads the user's kind-0 from damus/primal. This **fails AC-8** ("propagates where it will be seen"). Rejected.

### F3 — UI surface

#### Option A — Dedicated `/settings` route, reached from a "Settings" item in `AccountMenu` (chosen)

A new gated route `/settings` (gated like `/profile/me`: signed-out → `<Navigate to="/auth">`). It hosts a minimal Substack-only settings form. A "Settings" `<Link>` is added to the `AccountMenu` dropdown.

**Pros:**
- Keeps `/profile/me` a clean read-only *display* surface; the write lives in its own place.
- It is the honest home for a write that will plausibly grow (a later story may add name/bio/avatar on the same page, reusing the merge-preserve machinery this story builds). The route name doesn't over-promise — it holds exactly one field today.
- Matches the PO recommendation and the user gate.

**Cons:** one more route + one more `AccountMenu` item for a single field today. Accepted — the alternative (inline edit on `/profile/me`) muddies the display surface with edit state.

#### Option B — Inline edit on `/profile/me`

Add an edit affordance to the existing profile header.

**Cons:** turns the read-only profile view into a stateful editor, and `/profile/me` already carries shelves/submissions/stats. Mixing a write form into it is the wrong altitude for a surface that will grow. Rejected.

## Decision

We chose **F1-A, F2-A, F3-A.**

1. **Raw kind-0 read + merge (server-side).** Add a **raw** fetch to `apps/api/src/nostr/profile.ts` that returns the freshest kind-0's parsed `content` object **untouched** (all fields, including unknown ones), distinct from the lossy `parseKind0`. The merge sets `content.substack = url`, or **deletes** the key when clearing, preserves every other field, and builds a kind-0 event template with `created_at = now` (must be strictly newer than the existing event so it wins NIP-01 replacement). The merge never routes through `parseKind0`/`ProfileMeta`.

2. **Three-tier write.** `POST /api/profile/substack/template` (sovereign) + `POST /api/profile/substack` (tier-branched submit), mirroring ratings. Sovereign signs the server-built template via NIP-07; custodial signs server-side via the ephemeral wrap (ADR 0006), returning `reauth_required` 401 when the live key is gone; anonymous → 401. URL validated server-side (reuse the `httpUrl` shape) before building the template; a malformed URL → 400, no publish.

3. **Propagation.** Local relay first (gates the response), then best-effort parallel fan-out to `config.profileRelays` (which already includes the public relays + dcosl) via a new `publishToMany` helper. This is the app's first external-relay write; the fan-out is fire-and-forget and never fails the save.

4. **Web.** A gated `/settings` route with a minimal Substack form (prefilled from current kind-0 `substack`, Save, Clear, inline http(s) validation, honest idle/saving/saved/error states, sovereign "no extension" message), a "Settings" item in `AccountMenu`, and an **optimistic echo**: on save success, reflect the saved value locally and **bust the Story-19 `useProfileMeta` cache** for the user's npub so the link shows without waiting on a public-relay re-read.

5. **Concurrency (accepted limitation).** kind-0 is globally replaceable, latest-`created_at` wins across all clients. Merge-from-freshest mitigates but does not eliminate a cross-client clobber. No locking. To narrow the window, the merge fetches the freshest kind-0 **at template-build / sign time** (immediately before signing), not from a stale cache.

## Consequences

- **Enables** the first kind-0 write and lays the merge-preserve + external-relay-publish machinery a future full-profile-editor story can extend.
- **Constrains:** Unbnd now writes to external public relays. Those relays are outside our control (rate limits, paid/PoW policies, accept-then-drop). We accept best-effort propagation; we do not guarantee every public relay took the event.
- **Debt / follow-ups:** the multi-client clobber window remains (documented, not closed). A future story could add a re-read-and-rebuild-on-conflict guard if it proves to matter. The `/settings` route is single-field today; extending it to other kind-0 fields is a separate story.
- **Affects existing fixtures?** No production fixtures change. The Story-20 read display (`me-substack` link, `ProfileMeta.substack`) is reused unchanged. Tests will mock the new fetch/merge/publish deps the same way the ratings suite mocks `publish`/`query`/`custodialSign`.
- **New dependency?** No. Uses existing `nostr-tools/pure` (`finalizeEvent`, `verifyEvent`), the existing `publishEvent`, the existing ephemeral wrap, and NIP-07 in the browser.
- **PRD section change required?** No. In phase-2 Appendix C-1 scope; does not touch §11.3.
- **Brand tokens / copy:** the `/settings` form uses existing tokens (`tokens.css`); no new hex literal, no new icon library. All strings (labels, save states, the "no extension" message, validation message) are reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

## Implementation notes

Concrete files and boundaries for the Implementer.

### API — raw kind-0 read + merge

- **File: `apps/api/src/nostr/profile.ts`** — add, alongside `parseKind0`/`fetchProfileMeta`:
  - `pickNewestKind0(events: SignedNostrEvent[]): SignedNostrEvent | null` — the newest-by-`created_at` selector (factor out of `parseKind0`, which can reuse it).
  - `parseRawKind0Content(event: SignedNostrEvent | null): Record<string, unknown> | null` — `JSON.parse(event.content)` with a try/catch; returns the **raw object untouched** (no projection, no field drop). Returns `null` on no event / parse failure.
  - `fetchRawKind0(relays, pubkeyHex, queryFn?)` — same fan-out as `fetchProfileMeta` but returns `{ content: Record<string, unknown> | null; createdAt: number | null }` (the raw content of the freshest event + its `created_at`, so the caller can guarantee a strictly-newer template). Reuses `queryRelayUrl` and the 3s timeout. Do NOT call `parseKind0`.
- **File: `apps/api/src/profile/substack-template.ts`** (new) — pure, testable, mirrors `apps/api/src/ratings/template.ts`:
  - `validateSubstackUrl(input: unknown): string | null | "clear"` — trims; empty/absent ⇒ `"clear"`; runs the same http(s) `new URL()` check as `httpUrl` in `profile.ts` (accept `http:`/`https:`, reject `ftp:`, `javascript:`, `notaurl`); returns the normalized URL or signals invalid (throw a typed `SubstackError("invalid_url")`).
  - `mergeSubstack(rawContent: Record<string, unknown> | null, url: string | "clear"): Record<string, unknown>` — clone the raw content (or `{}` when null, the **custodial-with-no-kind-0** case → fresh minimal kind-0 holding just `substack`); if `"clear"`, `delete result.substack`; else `result.substack = url`. **Never** touches any other key.
  - `buildKind0Template(content, createdAt): NostrEventTemplate` — `{ kind: 0, created_at: createdAt, content: JSON.stringify(content), tags: [] }`. **Note: do NOT use `toWireTemplate`** — that helper is DList-specific (it appends a `["json", …]` payload tag); kind-0 content is the flat metadata JSON and `tags` is `[]`.
- **File: `apps/api/src/profile/validate-kind0.ts`** (new) — `validateSignedKind0(event, sessionPubkeyHex, expectedSubstack)`: mirror `apps/api/src/ratings/validate.ts`. Check `kind === 0`, hex pubkey, `pubkey === session`, `verifyEvent(event)` passes, `content` parses as an object, and the parsed `content.substack` **matches the server-intended value** (the merged URL, or absent when clearing). This last check is the guard that the sovereign client signed *the server's merge* and didn't smuggle a different content blob; it does **not** re-verify every preserved field (the client could legitimately have a newer kind-0), but it pins the one field this story owns.

### API — routes + wiring

- **File: `apps/api/src/routes/profile-substack.ts`** (new) — `buildProfileSubstackRouter(deps)`, dependency-injected exactly like `buildRatingsRouter` (`config`, `sessionUser`, `publish`, a `fetchRaw` fn, optional `custodialSign`). Routes:
  - `POST /api/profile/substack/template` — session-gated (401 `no_session`); validate URL (400 on invalid); `fetchRaw(user.pubkeyHex)`; merge; return `{ template }` with `created_at = floor(Date.now()/1000)` (and, if the fetched kind-0's `created_at >= now`, bump to `fetched.createdAt + 1` so replacement is guaranteed to win).
  - `POST /api/profile/substack` — tier-branch on `user.tier`:
    - custodial: read `{ url }`, validate, fetch+merge+build, `custodialSign(sessionIdHex, template)` → `null` ⇒ 401 `reauth_required`; else `publish(signed)`; on `!ok` ⇒ 502 `publish_failed`; else 200 `{ substack: <url|null> }`.
    - sovereign: read `{ event }`, `validateSignedKind0(event, user.pubkeyHex, expectedSubstack)` (400/403 like ratings), then `publish(event)`; 502 on failure; 200 `{ substack }`.
    - anonymous ⇒ 401.
  - The `expectedSubstack` the sovereign submit validates against: the client tells the server nothing it can't re-derive — the server re-runs `validateSubstackUrl` on the *original* `{ url }` the client also sends (send both `{ event, url }`), or simpler: the server reads `content.substack` from the signed event and only verifies it is a valid http(s) URL or absent (light check, matching the read side). Tester/Implementer pick the tighter of the two; the ADR requires at minimum: kind 0, pubkey match, valid signature, and `substack` is a valid http(s) URL or absent.
- **File: `apps/api/src/nostr/publish.ts`** — add `publishToMany(relayUrls: readonly string[], event): Promise<PublishResult[]>` = `Promise.all(relayUrls.map((u) => publishEvent(u, event).catch((e) => ({ ok: false, reason: … }))))`. Single-relay `publishEvent` is unchanged.
- **File: `apps/api/src/index.ts`** — build a **kind-0-specific publisher** distinct from the shared `publish`:
  ```
  const publishKind0 = async (event) => {
    const local = await publishEvent(config.strfryUrl, event);   // gates response
    if (local.ok && config.profileRelays?.length) {
      void publishToMany(config.profileRelays, event)            // fire-and-forget
        .then((rs) => rs.forEach((r) => !r.ok && console.warn(`[profile-publish] ${r.reason}`)));
    }
    return local;
  };
  ```
  Then `app.use("/", buildProfileSubstackRouter({ config, sessionUser: resolveSessionUser, publish: publishKind0, fetchRaw: (hex) => fetchRawKind0(config.profileRelays ?? [], hex), custodialSign: userEventDeps.custodialSign }));`

### Web

- **File: `apps/web/src/lib/api.ts`** — add `api.profile.setSubstack`:
  - `substackTemplate(url: string)` → `POST /api/profile/substack/template` → `{ template }` (sovereign).
  - `setSubstack(event)` → `POST /api/profile/substack` `{ event }` (sovereign).
  - `setSubstackCustodial(url: string)` → `POST /api/profile/substack` `{ url }` (custodial; empty string = clear).
- **File: `apps/web/src/routes/Settings.tsx`** (new) — gated like `ProfileMe` (`useSession`; `loading` → status; `signed-out` → `<Navigate to="/auth" replace />`). One labeled input prefilled from `useProfileMeta(npub)?.substack`, a Save button, a Clear action, inline http(s) validation before submit, and honest `idle | saving | saved | error` states. Tier branch identical to `RatingControl`: `isSovereign = user.email === null` → NIP-07 `window.nostr.signEvent(template)` (no extension ⇒ honest message, nothing published); else custodial intent. On success: optimistic echo (set the field's saved state to the entered value) **and** bust the profile cache.
- **File: `apps/web/src/hooks/useProfileMeta.ts`** — add an exported `invalidateProfileMeta(idOrNpub)` that deletes the mem-cache + sessionStorage entry and clears `fetchedThisSession` for that id, so the next mount of `/profile/me` (and `AccountMenu`) re-reads. `Settings` calls it on save success with `user.npub`. (The optimistic echo updates `/settings` immediately; the cache-bust makes the link appear on `/profile/me` without forcing a hard reload.)
- **File: `apps/web/src/components/AccountMenu.tsx`** — add a `<Link className="acct-item" to="/settings">Settings</Link>` between "Your shelves" and "Sign out".
- **File: `apps/web/src/App.tsx`** — add `<Route path="/settings" element={<Settings />} />` (before the `*` catch-all).
- **Styling:** reuse existing form/token classes (see `AuthEmailSignup`/`Submit` form CSS for the established input + button + inline-error pattern). No new hex literals; amber accent only.

### DList shapes

None. kind-0 is an existing NIP-01 replaceable event; no new kind, d-tag, word-wrapper, or concept header. The kind-39999 ratings/tags/shelves paths are untouched and referenced only as the structural model.

## Out of scope

- A full profile editor (name/display_name/about/picture/banner/nip05/lud16/website). The merge-preserve machinery here is the foundation; none of those fields are editable in this story.
- Other external links (the broader C-1 set; a general `website` editor).
- OAuth / identity-mapping between Substack and the Nostr identity (C-3, phase 3). This sets a self-asserted URL; it does not verify publication ownership.
- nip05 setting / verification.
- Eliminating the multi-client clobber risk (merge-from-freshest is the mitigation; a full conflict-resolution scheme is deferred).
- Any change to the kind-39999 write/propagation path (ADR 0011) — kind-0 deliberately uses its own propagation target.
