# ADR 0028: Custodial display-name rename — `POST /api/profile/display-name`

**Status:** Accepted
**Date:** 2026-06-01
**Story:** `engineering-team/stories/done/27b-custodial-displayname-rename.md`

> **Relationship to ADR 0027.** ADR 0027 (`0027-custodial-kind0-bootstrap.md`) is the
> design-of-record for the rename's *machinery*: its Decision §6 ("Rename (AC-6) — DEFERRED to
> Story 27b") and the "Deferred to Story 27b" implementation subsection already sketch the route,
> the DB lockstep, and the file list. This ADR does **not** restate that machinery; it **pins** the
> 27b-specific contract that §6 left open — the exact endpoint body/responses/error codes, the
> DB↔kind-0 ordering, and the failure posture — and confirms the seams Story 27 actually shipped
> (which differ in one detail from 0027's pre-merge sketch: `resolveSessionUser` already carries
> `displayName`). 0027's `buildProfileKind0Content` seam is reused verbatim. **No new merge logic,
> no new whitelist, no new template builder.** A separate short ADR (rather than amending 0027)
> keeps one-artifact-per-story traceability — 0027 is `Accepted` and closed; 27b gets its own
> `Proposed` record that can be reviewed and accepted on its own merits.

## Context

After Story 27 (merged to main as `1e90c0f`), a custodial user's chosen display name is resolvable
on nostr: signup publishes a `name`-bearing kind-0, login reconciles a missing/name-less one, and
the Substack write carries the DB `displayName` as the kind-0 `nameFloor`. But the name is still
**write-once** — it is set at signup (`validateDisplayName`, `apps/api/src/auth/passwords.ts`
lines 51–59) and never editable afterward. The story's survey confirms the rename surface does not
exist: `apps/web/src/routes/Settings.tsx` edits only the Substack URL (one field, lines 127–142);
`apps/web/src/lib/api.ts` has no rename method (`profile` block, lines 372–398); `apps/api/src/auth/users.ts`
has no `updateDisplayName`.

A rename must keep two stores in lockstep (Story 27 / ADR 0027 §3): kind-0 is canonical for
**display** (the product reads names from kind-0 everywhere via `parseKind0`), while Postgres
`displayName` is the **recovery/audit copy and the republish seed**. So a rename has to both
re-publish a merge-preserving kind-0 carrying the new name (with a strictly-newer `created_at` so
the replacement wins) **and** update Postgres `displayName`.

**Seams Story 27 shipped that 27b builds on (verified against current `main`, cite line numbers):**

- **`apps/api/src/profile/kind0.ts`** — `buildProfileKind0Content(rawPrev, patch, nameFloor?)`
  (lines 48–84): clones `rawPrev` (or `{}`), copies patch fields ONLY from `PROFILE_KIND0_FIELDS`
  (lines 14–24, the privacy whitelist), and a `displayName` in the patch sets **both** `name` and
  `display_name` (lines 70–74). `hasResolvableName` (lines 87–91); `buildKind0Template(content, createdAt)`
  (lines 98–108, flat JSON, `tags: []`). The rename calls
  `buildProfileKind0Content(rawPrevContent, { displayName: D2 }, D2)` — patch sets the new name and
  the `nameFloor` is redundant-but-harmless (the patch already fills `name`), exactly as the story
  specifies in AC-1.

- **`apps/api/src/index.ts`** —
  - `publishKind0` (lines 114–127): awaits the LOCAL relay (gates + read-back), then fans out
    best-effort to `config.profileRelays` (fire-and-forget); never dcosl. **Hoisted above
    `buildAuthRouter`** so it can be passed to the new router (the same way it is passed to the
    Substack router at line 390).
  - `custodialSign(sessionIdHex, template)` (lines 131–144): signs via `useSessionKey` →
    `finalizeEvent`; returns `null` on `NoSessionKeyError` (post-restart / evicted). Exposed as
    `userEventDeps.custodialSign` (line 371).
  - `resolveSessionUser` (lines 346–356): **already returns `displayName`** (line 354 —
    `displayName: resolved.user.displayName`), added by Story 27 for the Substack `nameFloor`
    thread. **So 27b does NOT need to modify `resolveSessionUser`.** It returns `{ id, pubkeyHex,
    tier, displayName }` — exactly the fields the rename route needs (target = session user id; tier
    branch; the prefill/floor name).
  - The Substack router registration (lines 387–393) is the DI shape the new router mirrors.

- **`apps/api/src/nostr/profile.ts`** — `fetchRawKind0(relays, pubkeyHex, queryFn?)`
  (lines 137–152) returns `{ content: Record<string,unknown> | null, createdAt: number | null }`,
  the freshest raw kind-0; wired in `index.ts` as `(hex) => fetchRawKind0(config.profileRelays ?? [], hex)`
  (line 391). This is the raw the rename must fetch before merge.

- **`apps/api/src/routes/profile-substack.ts`** — the EXACT tier-branched DI shape to MIRROR:
  `ProfileSubstackDeps` (lines 34–53: `config`, `sessionUser`, `publish`, `fetchRaw`, optional
  `custodialSign`); `SessionUser` (lines 26–32: `id`, `pubkeyHex`, `tier`, optional `displayName`);
  the cookie read (lines 55–59); `nextCreatedAt(fetchedCreatedAt)` (lines 61–68, the strictly-newer
  bump); the custodial branch (lines 118–162) with `tokenToId(cookie).toString("hex")` →
  `custodialSign` → `null` ⇒ `401 reauth_required`, `publish` → `!ok` ⇒ `502 publish_failed`. The
  new router reuses these patterns verbatim (and adds the `updateDisplayName` lockstep step the
  Substack route does not have).

- **`apps/api/src/auth/passwords.ts`** — `validateDisplayName(name)` (lines 51–59): rejects
  empty/whitespace, caps at `DISPLAY_NAME_MAX`. Reused as-is.

- **`apps/api/src/auth/users.ts`** — the drizzle update site for the new `updateDisplayName`.
  `users.displayName` is `text("display_name").notNull()` (`apps/api/src/db/schema.ts` line 30);
  `PublicUser` already carries `displayName` (lines 70–84). Existing update patterns: the file uses
  `tx.insert(users).values({...}).returning()` (lines 34–44) and `db.select().from(users).where(eq(...))`
  (lines 52–58); the new fn follows the drizzle `eq`/`returning` idiom.

- **`apps/web/src/routes/Settings.tsx`** + **`apps/web/src/lib/api.ts`** — the Substack field's
  state machine (`idle | saving | saved | error`, lines 44–47, 69–106), `isSovereign = user.email === null`
  (line 67), `invalidateProfileMeta(user.npub)` on success (line 97), and the `Settings.css` token
  classes (`set-field`, `set-hint`, `set-error`, `set-saving`, `set-saved`, `set-save`,
  `set-actions`). The display-name field mirrors this exactly, custodial-only.

**Constraints carried in:**

- **PRD anchor:** phase2-prd §2.4 ("Identity header … display name") presumes the custodial name is
  editable in the product surface; §2.6 (custodial personalization). First editable kind-0 field
  beyond Substack. Touches no §11.3 out-of-scope item.
- **Privacy (non-negotiable, AC-4):** kind-0 is a public, unencrypted, broadcast event. Only the new
  display name (`name`/`display_name`) is permitted in. Structurally enforced by reusing the closed
  `PROFILE_KIND0_FIELDS` patch surface — `email`/`password`/`userId`/session token cannot enter.
- **No hand-rolled crypto** (ADR 0002 / crypto-policy): sign only via `custodialSign` →
  `useSessionKey` → `finalizeEvent`. No new key/sig math.
- **No image, no general profile editor, no sovereign-side change** (story Out-of-scope).
- **Architecture invariants:** kind-0 is the user's own self-asserted metadata, not a trust-weighted
  aggregate — POV-first / filter-at-view-time / decentralized-first are not engaged (same posture as
  ADR 0022 / 0027). npub-display / hex-internal preserved. Sovereign path untouched (AC-6).
- **No new tooling, no new runtime dependency, no new DList shape.** kind-0 is an existing NIP-01
  replaceable kind, published via `publishKind0` (local + `profileRelays` fan-out, never dcosl).

This ADR does not contradict any prior ADR. It is the deferred §6 of ADR 0027, made concrete.

## Options considered

The forks 27b actually faces are narrow (the big forks were settled in 0027 §F3): **(F1)** the
DB↔kind-0 ordering + transactionality; **(F2)** the local-publish-failure posture.

### F1 — Ordering of the merge-publish and the Postgres update

#### Option A — Validate → fetch raw → build+sign → **publish local (await)** → **then** `updateDisplayName` → fan-out (chosen)

Publish the kind-0 first; only update Postgres after the local publish succeeds. kind-0 is canonical
for display (0027 §3), so the canonical store is written first; the DB copy follows. There is no
cross-store transaction (one is a relay, one is Postgres — no shared tx is possible), so "lockstep"
means **ordered, both-or-surface-the-failure**, not atomic.

- If **`custodialSign` returns `null`** (no live signing session): `401 reauth_required`, before any
  publish or DB write. Nothing changes.
- If the **local publish fails** (`publish().ok === false` or throws): `502 publish_failed`, and the
  DB is **left unchanged**. Postgres still holds the old name, kind-0 still holds the old name → the
  two stores stay consistent (both old). The user sees an error and can retry. (Justification under F2.)
- If **`updateDisplayName` fails** *after* a successful publish: the kind-0 is already published with
  the new name (canonical for display wins), but Postgres still holds the old name. We **`502`** and
  log; the next reconciliation/merge-preserve write reseeds from the (stale) DB name as a floor, but
  since the published kind-0 already has a non-empty name, the floor never fires and the new name
  stays live. The drift (DB old, kind-0 new) is the **less-bad** direction: display is correct
  everywhere; only the recovery/seed copy lags, and it self-heals to non-interference because the
  floor only fills an *absent* name. This residual is documented, matching 0027 §3's accepted
  "DB↔kind-0 can drift" limitation, now bounded to a rare post-publish DB failure.

**Pros:** canonical-first; consistent-on-failure for the common (publish-fails) case; mirrors the
Substack route's await-local-publish-gates-response shape; the `updateDisplayName` is one obvious
post-publish step. **Cons:** the rare publish-succeeds-then-DB-fails case leaves a bounded,
self-limiting drift (DB stale). Accepted and documented.

#### Option B — Update Postgres first, then publish; roll back the DB row if publish fails

DB-first with a compensating update on publish failure.

**Cons:** writes the non-canonical store first; a compensating "undo" update is itself a write that
can fail, so it does not actually buy atomicity — it just moves the drift window and adds a code path.
And on the happy path the product still reads the name from kind-0, so DB-first gains nothing for
display. Rejected.

### F2 — Posture on a failed LOCAL publish: fail-open (like signup) vs. surface the error

#### Option A — Surface the failure: `502 publish_failed`, DB unchanged (chosen)

The signup bootstrap (0027 §4 / Open Question 4) is **fail-open**: a failed publish is swallowed so
it never rolls back the account, because the user did not ask to publish — they asked to sign up. The
rename is the opposite intent: the user **explicitly asked to change their name**. Silently swallowing
a failed publish would tell the user "Saved." while nothing changed — a lie the copy rules forbid and
a real correctness bug. So the rename **surfaces** a failed local publish as `502 publish_failed`
(exactly as the Substack write does, `profile-substack.ts` lines 151–160), leaves the DB unchanged,
and the UI shows the `error` state. The fan-out remains fire-and-forget (a profile-relay failure
never fails the save — it is best-effort inside `publishKind0`).

**Pros:** honest; consistent-on-failure (both stores keep the old name); matches the established
Substack custodial-write contract; aligns with the no-slop "surface state in place, no fake Saved
toast" rule. **Cons:** a transient local-relay blip surfaces as a user-visible error rather than a
silent retry. Acceptable — it is the truthful state, and retry is one click.

#### Option B — Fail-open like signup (swallow, return 200)

**Cons:** would report success on a no-op; contradicts the user's explicit rename intent and the
copy rules. Rejected.

## Decision

We chose **F1-A and F2-A.** Concretely, the 27b contract is pinned as follows.

### 1. Endpoint contract — `POST /api/profile/display-name`

**Request body:** `{ displayName: string }`. The target is **always the session user** — there is
**no** request-body user id (AC-3). The session is read from the `session` cookie via
`deps.sessionUser(cookie)`, identical to the Substack route.

**Tier branching (AC-3, AC-6):**

| Caller | Outcome |
|---|---|
| No session / anonymous | `401 { error: { code: "no_session", message: "Not signed in." } }` |
| Custodial, no live signing key (`custodialSign` ⇒ `null`) | `401 { error: { code: "reauth_required", message: "Please sign in again to update your profile." } }` |
| Custodial, live key | publish + DB lockstep (below) ⇒ `200 { displayName: D2 }` |
| Sovereign | `403 { error: { code: "sovereign_self_signed", message: "Update your display name with your own nostr client." } }` — no kind-0 is built, signed, or published on a sovereign's behalf |

**Validation (AC-4):** run `validateDisplayName(req.body?.displayName)` (reused from `passwords.ts`)
**before** any fetch/sign/publish. On failure: `400 { error: { code: "invalid_display_name", message: <validator message> } }`.

**Success response:** `200 { displayName: D2 }` (the trimmed/accepted name). The web client echoes
this into the session/badge.

**Error codes (house codes, reused):** `no_session` (401), `reauth_required` (401),
`invalid_display_name` (400), `sovereign_self_signed` (403), `publish_failed` (502). Copy reviewed
against `memory/feedback_unbnd_copy_and_visual.md` (no em dashes, no declarative-negative slop, no
emoji).

### 2. Rename ordering (custodial branch) — the lockstep

```
1. user = sessionUser(cookie)            → null ⇒ 401 no_session
2. validateDisplayName(displayName)      → invalid ⇒ 400 invalid_display_name
3. if user.tier !== "custodial"          → 403 sovereign_self_signed
4. { content, createdAt } = fetchRaw(user.pubkeyHex)
5. merged = buildProfileKind0Content(content, { displayName: D2 }, D2)
6. template = buildKind0Template(merged, nextCreatedAt(createdAt))   // strictly-newer created_at
7. signed = custodialSign(sessionIdHex, template)   → null ⇒ 401 reauth_required
8. published = await publish(signed)     // awaits LOCAL relay; fan-out fire-and-forget inside
   if !published.ok                      → 502 publish_failed   (DB UNCHANGED)
9. await updateDisplayName(user.id, D2)  // Postgres lockstep, AFTER the canonical publish
   if it throws                          → 502 publish_failed (logged); kind-0 already live (drift: DB stale, self-limiting)
10. → 200 { displayName: D2 }
```

`sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : ""` (verbatim from the Substack route).
`nextCreatedAt` is the Substack route's helper (bumps strictly past the fetched event so the
replacement wins, AC-1). Steps 1–3 happen before any I/O, so a sovereign/anon/invalid request never
touches a relay.

### 3. Failure posture (the two cases the gate asked for)

- **Local publish fails (step 8):** `502 publish_failed`, **DB left unchanged**. Both stores keep the
  old name → consistent. User retries. (F2-A.)
- **DB update fails after a successful publish (step 9):** `502 publish_failed` + log. kind-0 already
  carries `D2` (canonical for display, so the product shows the new name everywhere); Postgres lags
  at the old name. This drift is **self-limiting**: `displayName` is only ever used as a `nameFloor`,
  which fills an *absent* name and never clobbers a present one — and the published kind-0 already has
  a present name. The user sees an error; a retry re-publishes (idempotent in effect) and re-attempts
  the DB write. Bounded, documented, accepted. (F1-A.)

No cross-store atomicity is claimed or possible (relay + Postgres). "Lockstep" = ordered
canonical-first with both-old-on-the-common-failure.

### 4. `resolveSessionUser` already has `displayName`

Confirmed against current `main`: `index.ts` line 354 returns `displayName: resolved.user.displayName`
(Story 27 added it for the Substack `nameFloor`). **27b does not modify `resolveSessionUser`.** The
new router's `SessionUser` type reuses the same shape (`id`, `pubkeyHex`, `tier`, `displayName?`) —
it may import `SessionUser` from `profile-substack.ts` or redeclare the identical type.

### 5. Reuse confirmation (no new merge machinery)

27b adds **only**: the route, the `updateDisplayName` DB fn, the web client method, and the Settings
field. It makes **one** `buildProfileKind0Content(content, { displayName: D2 }, D2)` call and reuses
`buildKind0Template`, `nextCreatedAt`, `validateDisplayName`, `custodialSign`, `publishKind0`,
`fetchRawKind0`. **No new merge logic, no new whitelist, no new template builder, no new clock helper,
no hand-rolled crypto.** If the Implementer finds themselves writing merge/whitelist/template code in
27b, that is a **smell** — the shared `kind0.ts` seam already covers it, and the Reviewer should kick
it back.

### 6. Sovereign untouched (AC-6)

The route returns `403` for `tier === "sovereign"` before building/signing/publishing anything. The
UI hides/disables the field for sovereign (`isSovereign = user.email === null`). No sovereign auth or
profile code path is modified; existing sovereign tests stay green.

### 7. Web field (AC-5)

A custodial-only display-name field on `/settings` (NOT `/profile/me` — "Settings only", per the
user's AS-IS approval). Prefilled from the current resolved name (`useProfileMeta(npub)?.name` with
`session.user.displayName` as the fallback seed). Honest `idle | saving | saved | error` states
mirroring the Substack field. On success: echo `D2` into the session and call
`invalidateProfileMeta(user.npub)` so the badge refreshes without a reload. Reuses existing
`Settings.css` token classes (`set-field`, `set-hint`, `set-error`, `set-saving`, `set-saved`,
`set-save`). **No new hex literal, no new icon library.** Hidden/disabled for sovereign. Strings
reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

## Testability seams (call out for the Tester)

The new router is unit-testable with **no live relay**, mirroring `apps/api/test/routes/profile-substack.test.ts`'s
`makeApp({ ...overrides })` pattern. **Inject deps; never `vi.mock` an intra-module call** (prior gotcha).

Injectable seams on `buildProfileDisplayNameRouter(deps)`:

- **`sessionUser: (cookie) => Promise<SessionUser | null>`** — `vi.fn` returning custodial / sovereign / `null`.
- **`publish: (event) => Promise<PublishResult>`** — `vi.fn` returning `{ ok: true, id }`, `{ ok: false, reason }`, or throwing.
- **`fetchRaw: (pubkeyHex) => Promise<{ content, createdAt }>`** — `vi.fn` returning prior content
  with `substack`/`website` (to assert merge-preserve), name-less content, or `{ content: null, createdAt: null }`.
- **`custodialSign?: (sessionIdHex, template) => Promise<SignedNostrEvent | null>`** — `vi.fn`
  returning a canned signed event (often capturing the template to assert the merged content) or `null`.
- **`updateDisplayName: (userId, name) => Promise<unknown>`** — `vi.fn` to assert it is called with
  `(user.id, D2)` exactly once on success, **not** called on 401/400/403/502-publish, and that a
  throw maps to 502.
- **`config`** — the test `Config` literal (same as the Substack test).

Assertions the Tester should cover (from the ACs): AC-1 (captured signed template's content has
`name == display_name == D2` AND retains prior `substack`/`website`; `created_at` strictly newer than
the fetched event); AC-2 (`updateDisplayName` called with `D2`; `200 { displayName: D2 }`); AC-3
(anon ⇒ 401 `no_session`; custodial `custodialSign`⇒`null` ⇒ 401 `reauth_required`; no body-id path);
AC-4 (email string appears nowhere in the signed event content/tags; invalid name ⇒ 400 before any
fetch/sign); AC-6 (sovereign ⇒ 403, `publish`/`custodialSign`/`updateDisplayName` never called).
Ordering/posture: publish-fails ⇒ 502 and `updateDisplayName` NOT called; updateDisplayName-throws
(after publish ok) ⇒ 502.

## Consequences

- **Enables** the first editable kind-0 field beyond Substack: a custodial user can fix a typo or
  rebrand from `/settings`, with the new name propagating to nostr and the DB recovery copy in
  lockstep. Closes the deferred §6 of ADR 0027.
- **Constrains:** a rename now does one raw kind-0 read + one awaited local publish + one Postgres
  UPDATE per save (bounded; fan-out async). A post-publish DB failure leaves a bounded, self-limiting
  DB-stale drift (documented above; same accepted class as 0027 §3's manual-relay-edit drift).
- **Debt / follow-ups:** the multi-client kind-0 clobber window (ADR 0022 merge-from-freshest) is
  unchanged. A general profile editor (bio/nip05/lud16/picture) remains future scope. Reconciling a
  hand-edited relay kind-0 back into Postgres stays out of scope (one-directional, per 0027).
- **Affects existing fixtures?** No DList fixtures, no production fixture data. The Substack
  route/tests are not modified by 27b (the `nameFloor` thread shipped in Story 27).
- **New dependency?** No. Reuses `publishKind0`, `fetchRawKind0`, `custodialSign`,
  `buildProfileKind0Content`, `buildKind0Template`, `validateDisplayName`, drizzle `eq` — all existing.
- **PRD section change required?** No. Implements §2.4 / §2.6 as written; touches no §11.3 surface.
- **Brand tokens / copy:** the only new UI is the `/settings` display-name field, reusing existing
  `Settings.css` classes (no new hex, no new icon library); strings reviewed against the copy/visual
  feedback file.

## Implementation notes

### New files

- **`apps/api/src/routes/profile-display-name.ts`** — `buildProfileDisplayNameRouter(deps)` and the
  exported `ProfileDisplayNameDeps` / `SessionUser` types. DI shape = `ProfileSubstackDeps`
  (`config`, `sessionUser`, `publish`, `fetchRaw`, optional `custodialSign`) **plus**
  `updateDisplayName: (userId: string, name: string) => Promise<unknown>`. `POST /api/profile/display-name`,
  tier-branched per Decision §1–§3. Reuse `readSessionCookie` and `nextCreatedAt` patterns from the
  Substack route (import or re-implement the small helpers; do not duplicate merge logic).
- **`apps/api/test/routes/profile-display-name.test.ts`** *(Tester-owned)* — DI-injected, no live
  relay; mirror `profile-substack.test.ts`'s `makeApp`.

### Ripple files (modified)

- **`apps/api/src/auth/users.ts`** — add
  `updateDisplayName(executor: DbOrTx, userId: string, name: string): Promise<UserRow>` — a drizzle
  `executor.update(users).set({ displayName: name }).where(eq(users.id, userId)).returning()`,
  following the existing `eq`/`returning` idiom (lines 34–58). `PublicUser` already carries
  `displayName` (no type change).
- **`apps/api/src/index.ts`** — register the router next to the Substack registration (after line 394):
  ```ts
  app.use(
    "/",
    buildProfileDisplayNameRouter({
      config,
      sessionUser: resolveSessionUser,                 // already returns displayName (line 354)
      publish: publishKind0,                            // hoisted, line 114
      fetchRaw: (hex) => fetchRawKind0(config.profileRelays ?? [], hex),
      custodialSign: userEventDeps.custodialSign,       // line 371
      updateDisplayName: (id, name) => db.transaction((tx) => updateDisplayName(tx, id, name)),
    }),
  );
  ```
  Add the `updateDisplayName` import from `./auth/users` and the router import. **No change to
  `resolveSessionUser`** (Decision §4). `publishKind0` / `userEventDeps` are already constructed
  above `buildAuthRouter`, so no reordering is needed (unlike Story 27's signup-bootstrap wiring).
- **`apps/web/src/lib/api.ts`** — add to the `profile` block (near lines 393–398):
  `setDisplayName(displayName: string) => authFetch<{ displayName: string }>("/api/profile/display-name", { method: "POST", body: JSON.stringify({ displayName }) })`.
- **`apps/web/src/routes/Settings.tsx`** — add the custodial-only display-name field per Decision §7,
  mirroring the Substack field's state machine; call `api.profile.setDisplayName(name)`, echo the
  returned name into the session, and `invalidateProfileMeta(user.npub)` on success.

### Existing tests that change

- **New:** `apps/api/test/routes/profile-display-name.test.ts` (Tester-owned).
- `apps/api/test/routes/auth.test.ts` — **unchanged** (rename is not in the auth router).
- `apps/api/test/routes/profile-substack.test.ts` — **unchanged** (separate route).
- `apps/web` Settings tests, if any, gain a display-name field case (Test Design will confirm).
- A web client unit/typecheck pass picks up the new `api.profile.setDisplayName` method.

### DList shapes

None. kind-0 is an existing NIP-01 replaceable metadata event (flat JSON content, `tags: []`),
published via `publishKind0` to the local relay + `config.profileRelays` fan-out, never dcosl. No
`kind:39998`/`kind:39999`, no kind-3.

## Out of scope

- Putting the rename field on `/profile/me` (the user chose "Settings only").
- Custodial avatar IMAGE / `picture`; a general profile editor (bio/nip05/lud16/website/banner).
- Reconciling a hand-edited relay kind-0 back into Postgres (one-directional, per ADR 0027 §3).
- Any sovereign-side change (AC-6 only guards the route off for sovereign).
- New lint/typecheck/build tooling (CLAUDE.md house rule).
