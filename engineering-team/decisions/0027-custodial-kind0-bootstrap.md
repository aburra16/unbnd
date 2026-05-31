# ADR 0027: Custodial kind-0 bootstrap — publish a name-bearing profile at signup

**Status:** Proposed
**Date:** 2026-05-31
**Story:** `engineering-team/stories/27-custodial-kind0-bootstrap.md`

## Context

A custodial (email-signup, Tier-2) user's chosen display name never reaches nostr, so the product shows them as a string of `npub1…` characters everywhere identity is rendered, and so does every other nostr client. The break is at signup.

`buildAuthRouter`'s `signup:` dep (`apps/api/src/index.ts` lines 99–145) creates the user inside a single DB transaction — `createCustodialUser` (`apps/api/src/auth/users.ts` lines 24–50) writes `displayName` to **Postgres only** (line 38) — then, immediately after the transaction commits, establishes the ephemeral signing wrap (`index.ts` lines 126–139: decrypt the just-stored nsec with the signup password, `rememberSessionKey(sessionIdHex, secret)`, wipe). **No kind-0 is ever published.** The user gets a keypair, a DB row, and a live signing session, but no profile event on any relay.

Every name and badge in the product resolves from **kind-0 on relays**, not from our DB: `GET /api/profile/:id` (`apps/api/src/routes/profile.ts` lines 22–36) → `fetchProfileMeta` → `parseKind0` (`apps/api/src/nostr/profile.ts` lines 85–105), which reads `name`, then `display_name`/`displayName`, `picture`, `nip05`, `about`, `substack`. With no kind-0, `parseKind0` returns `null`, `displayNameOf` falls back to the short npub, and `Avatar.initialsOf` renders npub-derived initials. Sovereign (NIP-07) users are unaffected — they already own a kind-0 on relays from their existing nostr life.

**Latent ordering bug folded in (AC-7).** The Story-22 Substack write is today the *only* code path that publishes a custodial kind-0, and it is merge-preserving (`apps/api/src/routes/profile-substack.ts` lines 128–130 / `mergeSubstack` in `apps/api/src/profile/substack-template.ts` lines 51–62). Because a custodial user has no baseline kind-0, `fetchRaw` returns `{ content: null }`, `mergeSubstack(null, url)` starts from `{}` (line 55), and the first Substack save publishes a kind-0 carrying `substack`/`website` but **no `name`**. Bootstrapping a name-bearing kind-0 at signup gives every later merge-preserve write a correct base.

**Machinery this reuses (named so the design inherits the seam):**

- **`publishKind0`** (`index.ts` lines 236–249, ADR 0022 F2-A): awaits the LOCAL relay (gates + read-back), then fans out best-effort to `config.profileRelays`. Deliberately NOT dcosl (which rejects kind-0). Already wired into the Substack router (line 333).
- **Custodial server-signing** via the ephemeral wrap: `useSessionKey` (`apps/api/src/auth/ephemeral.ts` lines 50–64) and the `custodialSign(sessionIdHex, template) → SignedNostrEvent | null` dep built in `userEventDeps` (`index.ts` lines 301–314; returns `null` on `NoSessionKeyError`).
- **The merge-preserve helpers** (`apps/api/src/profile/substack-template.ts`): `mergeSubstack`, `buildKind0Template` (lines 68–78, flat metadata JSON, `tags: []`, NOT `toWireTemplate` which appends a DList `["json",…]` tag), and the raw fetch `fetchRawKind0` (`apps/api/src/nostr/profile.ts` lines 137–152) returning `{ content, createdAt }`.

**Two facts the survey established that shape this ADR:**

1. **There is no displayName rename endpoint today.** `apps/web/src/routes/Settings.tsx` edits only Substack; `displayName` is set at signup (`validateDisplayName`, `apps/api/src/auth/passwords.ts` lines 51–59) and is never editable afterward. `apps/web/src/lib/api.ts` has no rename method, and `apps/api/src/auth/users.ts` has no `updateDisplayName`. **AC-6 therefore requires a new server endpoint + a new web field + a new DB update fn.**
2. **The bootstrap/reconcile logic cannot live in the route.** `apps/api/test/routes/auth.test.ts` mocks the `signup:`/`login:` deps at the `buildAuthRouter` boundary (lines 34–49), so it never exercises the dep bodies in `index.ts`. The kind-0 work lives *inside* those deps, which are not directly unit-testable through the auth router. The design must therefore put the bootstrap and reconciliation behind **small, separately-unit-testable helpers** that `index.ts` wires with injected `publish` / `fetchRaw` / `sign` deps — never `vi.mock` of an intra-module call (the prior-stories gotcha).

**Constraints carried in:**

- **PRD anchor:** phase2-prd §2.4 ("Identity header … initials for custodial; display name, handle, bio") presumes a custodial display name is resolvable; §2.6 (custodial personalization, Story 26) wants a named byline; Appendix C-1 needs a name-bearing base for the kind-0 merge-preserve writes. This is a **bug** in shipped custodial behavior, not new scope. Touches none of §11.3 out-of-scope.
- **Privacy (non-negotiable):** kind-0 is a public, unencrypted, broadcast event. The user's email — and any password / internal user id / session token — must NEVER appear in it, in content or tags (AC-3).
- **No hand-rolled crypto** (ADR 0002 / crypto-policy): sign only via `custodialSign` → `useSessionKey` → `finalizeEvent` (nostr-tools/pure, `@noble` floor). No new key/sig math.
- **No image** (Story Out-of-scope, §2.4 "initials for custodial"): set `name`/`display_name` only, never `picture`.
- **Architecture invariants:** kind-0 is the user's own self-asserted metadata, true for everyone who reads it — not a trust-weighted aggregate. POV-first / filter-at-view-time / decentralized-first are not engaged (same as ADR 0022). npub-display / hex-internal preserved. AC-8: the sovereign path is never touched.
- **No new tooling, no new runtime dependency, no new DList shape.** kind-0 is an existing NIP-01 replaceable kind.

This ADR does not contradict any prior ADR. It extends ADR 0022's kind-0 write machinery to two new triggers (signup bootstrap, displayName rename) and adds a best-effort reconciliation read; it uses the ADR 0006 ephemeral wrap and the ADR 0022 `publishKind0` propagation target verbatim.

## Resolved open questions (the PO's four)

1. **`name` only, or `name` + `display_name`? → BOTH.** Write the chosen string to **both** `name` and `display_name`. `parseKind0` already reads both (`profile.ts` lines 96–97), modern clients prefer NIP-24 `display_name`, and the cost is zero. Confirmed (the story flags this for veto; recommend keeping).

2. **Reconciliation trigger (AC-5) → primary: next custodial LOGIN; secondary: next merge-preserve write.** The key is freshly wrapped in-session at login (`index.ts` line 169), so login is the natural, always-available repair point. **Detection:** fetch the freshest raw kind-0 (`fetchRawKind0`); if it is **missing** OR its parsed content **lacks a non-empty `name`**, publish/repair a name-bearing kind-0 seeded from the DB `displayName`. **Best-effort + idempotent:** if a good name-bearing kind-0 already exists, do nothing (no needless republish, no `created_at` churn). The merge-preserve writes (Substack/rename) are the secondary catch because the shared builder always carries the DB `displayName` as the name floor (see Decision §3, which also closes AC-7). Reconciliation **never blocks login** and never fails it.

3. **Source of truth → kind-0 canonical for DISPLAY; Postgres `displayName` kept in lockstep.** The product reads the name from kind-0 everywhere, so kind-0 is canonical for display. Postgres `displayName` is kept updated on rename (AC-6) and is the seed used to (re)publish at signup and reconciliation — i.e. the recovery/audit copy and the republish source. Accepted limitation: a manual relay edit could drift them; we don't reconcile *back* into Postgres (out of scope).

4. **Posture → mirror `publishKind0`: await LOCAL, fire-and-forget the fan-out; AC-4 fail-open governs.** Await the local publish so the event is read-back-able and AC-2 holds immediately in tests; the profile-relay fan-out stays fire-and-forget. Crucially, the entire publish is wrapped so that a throw or a failed local publish is **logged and swallowed** — it must never roll back the account or fail the signup response (AC-4). Confirmed.

## Options considered

The real forks: **(F1)** where the reusable kind-0 builder lives and its shape; **(F2)** where the signup bootstrap is invoked (in-transaction vs. after-commit); **(F3)** the AC-6 rename surface (extend the Substack router vs. a dedicated profile route).

### F1 — The reusable kind-0 builder seam

#### Option A — A new `apps/api/src/profile/kind0.ts` with a generic merge-preserve builder; refactor `mergeSubstack` to call it (chosen)

One DRY seam all three paths (signup, rename, reconciliation) and the Story-22 Substack write go through:

```ts
// apps/api/src/profile/kind0.ts  (new, pure, no I/O)

/** The ONLY profile fields permitted into a published kind-0 (privacy whitelist). */
export const PROFILE_KIND0_FIELDS = ["name", "display_name", "about",
  "picture", "nip05", "lud16", "website", "banner", "substack"] as const;

export type ProfilePatch = {
  /** Sets BOTH name and display_name (Open Question 1). */
  readonly displayName?: string;
  readonly substack?: string | "clear";
  // future fields land here, still whitelisted
};

/**
 * Merge-preserve a kind-0 content object. Clones rawPrev (or {} when null),
 * applies the patch, and — when `nameFloor` is provided and the merged content
 * has no non-empty `name` — injects the floor into BOTH name and display_name.
 * NEVER copies any key outside PROFILE_KIND0_FIELDS off the patch; rawPrev's
 * own unknown fields are preserved untouched (lossless), patch fields are
 * whitelisted on the way in.
 */
export function buildProfileKind0Content(
  rawPrev: Record<string, unknown> | null,
  patch: ProfilePatch,
  nameFloor?: string,
): Record<string, unknown>;

/** Returns true if content has a non-empty string `name`. Drives reconciliation. */
export function hasResolvableName(content: Record<string, unknown> | null): boolean;
```

`buildKind0Template(content, createdAt)` (flat JSON, `tags: []`) is **lifted from `substack-template.ts` into `kind0.ts`** so it is the single template builder; `substack-template.ts` re-exports or imports it. `mergeSubstack` becomes a thin wrapper over `buildProfileKind0Content(raw, { substack: url }, nameFloor)`, which is exactly what fixes AC-7 — the Substack save now carries the DB `displayName` as the `nameFloor`, so a Substack-first custodial user gets `name` + `substack` together.

**Pros:** one audited merge-preserve path; AC-7 falls out of the `nameFloor` mechanic for free; the privacy whitelist is structurally enforced in one place; signup/rename/reconcile/Substack cannot drift. Pure and trivially unit-testable.

**Cons:** touches the shipped `substack-template.ts` (a small, test-covered refactor). Mitigated: `mergeSubstack`'s public signature can be preserved (delegating internally), and `apps/api/test/profile/substack-template.test.ts` keeps asserting the same outputs (plus a new name-floor case).

#### Option B — A standalone signup-only kind-0 builder, leave `mergeSubstack` as-is

A `buildSignupKind0(displayName)` that hand-rolls `{ name, display_name }`, with the rename path duplicating it and the Substack bug fixed separately.

**Cons:** three near-identical builders, three places to keep the privacy whitelist correct, and AC-7 needs its own fix instead of falling out of the shared floor. Directly violates the story's DRY mandate ("ONE code path"). Rejected.

### F2 — Where the signup bootstrap runs

#### Option A — After the DB commit AND after the wrap is established, outside the transaction, fully swallowed (chosen)

In the `signup:` dep, slot the bootstrap **after** lines 126–139 (the `rememberSessionKey` block) and **before** the `return` (line 140). The key must be wrapped first (the bootstrap signs with it); the DB row must be committed first (AC-4 — the account survives a publish failure). Wrap the whole thing in `try { await bootstrap… } catch { log; swallow }` so nothing it does can reach the signup response.

**Pros:** satisfies AC-4 by construction (commit + session already durable before a single relay byte is sent); the wrap exists, so no second password prompt; awaiting the *local* publish keeps AC-2 deterministic without coupling to the fan-out.

**Cons:** signup latency now includes one local-relay publish (and a raw kind-0 read is **not** needed at signup — a fresh user has no prior kind-0, so we build from `{}` directly; see notes). Acceptable: local publish is fast and the fan-out is not awaited.

#### Option B — Inside the signup transaction

**Cons:** a relay publish inside a DB transaction is wrong on two counts: a publish failure would roll back the account (violates AC-4), and the wrap isn't established until after the transaction. Rejected.

### F3 — The AC-6 rename surface

#### Option A — A dedicated `POST /api/profile/display-name` in a small new router, plus a name field on the existing `/settings` page (chosen)

Mirror the Substack router's tier-branch shape exactly, but for the displayName field: custodial fetches the freshest raw kind-0, merges `name`+`display_name` via the shared builder, signs server-side, publishes via `publishKind0`, **and** updates Postgres `displayName` in lockstep. Sovereign is rejected for this route (sovereign owns their own profile — AC-8; a name field is hidden/disabled for them in the UI). Add the field to `Settings.tsx`.

**Pros:** clean separation from the Substack write; reuses the shared builder and `publishKind0`; the DB lockstep update lives in one obvious handler; matches the established tier-branched custodial-write pattern.

**Cons:** a new route + a new web field + a new `users.ts` update fn. Unavoidable — none exist today (survey fact 1).

#### Option B — Fold displayName into the Substack router as a second field

**Cons:** conflates two distinct writes (one updates Postgres, one doesn't; one is custodial-only here, one is both tiers) into one handler and one endpoint. Muddies the Substack route's contract and its tests. Rejected.

## Decision

We chose **F1-A, F2-A, F3-A.** Concretely:

1. **One reusable kind-0 seam** in a new `apps/api/src/profile/kind0.ts` (pure, no I/O): `PROFILE_KIND0_FIELDS` (the privacy whitelist), `buildProfileKind0Content(rawPrev, patch, nameFloor?)`, `hasResolvableName(content)`, and `buildKind0Template(content, createdAt)` (lifted from `substack-template.ts`). Signup, rename, reconciliation, and the Story-22 Substack write all funnel through `buildProfileKind0Content`. `mergeSubstack` is refactored to delegate to it (preserving its public signature), passing the DB `displayName` as `nameFloor` — which closes AC-7.

2. **Privacy whitelist (hard, AC-3).** `buildProfileKind0Content` copies patch fields ONLY from `PROFILE_KIND0_FIELDS`; `email`, `password`, `userId`, and any session token are structurally unable to enter — they are not in the patch type and not in the field set. `rawPrev`'s own unknown keys are preserved (lossless merge) but the patch surface is closed. The signup bootstrap builds the patch from `displayName` alone. The Tester asserts the signup email string appears nowhere in the published event (content or tags).

3. **AC-7 name-floor.** Because the Substack save now passes the DB `displayName` as `nameFloor`, a custodial user who saves Substack first still gets a kind-0 carrying BOTH `name`/`display_name` AND `substack`. The latent "website-but-no-name" outcome is gone.

4. **Signup bootstrap (AC-1, 3, 4)** lives in a small injected helper `bootstrapCustodialKind0(deps)` (DI: `sign`, `publishKind0`, and a clock). `index.ts` wires it into the `signup:` dep **after** the `rememberSessionKey` block (lines 126–139) and **before** `return` (line 140), inside `try { … } catch (e) { console.warn("[kind0-bootstrap] …"); }` — a throw or failed local publish is logged and swallowed, never rolling back the account or failing the response. A fresh signup has no prior kind-0, so the helper builds content from `buildProfileKind0Content(null, { displayName }, displayName)` directly (no raw fetch needed), `buildKind0Template(content, now)`, `sign(sessionIdHex, template)` (`null` ⇒ log + skip, never throw to the caller), `publishKind0(signed)` (await local; fan-out fire-and-forget inside it). `display_name`==`name`==`D` (Open Question 1).

5. **Reconciliation (AC-5)** lives in a sibling injected helper `reconcileCustodialKind0(deps)` (DI: `fetchRaw`, `sign`, `publishKind0`, clock, and the user's `displayName`/`pubkeyHex`/`sessionIdHex`). **Primary hook: the `login:` dep** in `index.ts`, slotted **after** `rememberSessionKey` (line 169) and before `return` (line 170), best-effort and swallowed — never blocks or fails login, and only for `tier === "custodial"`. **Detection:** `const { content, createdAt } = await fetchRaw(pubkeyHex)`; if `hasResolvableName(content)` is already true, **do nothing** (idempotent). Otherwise merge `displayName` into `content` via `buildProfileKind0Content(content, { displayName }, displayName)` (preserving any `substack`/`website` already present), build with `created_at = max(now, createdAt+1)` so replacement wins, sign, publish. **Secondary catch:** the merge-preserve writes (rename, Substack) already carry the `nameFloor`, so any profile write also repairs a name-less kind-0.

6. **Rename (AC-6)** is a new `POST /api/profile/display-name` in a new `apps/api/src/routes/profile-display-name.ts`, DI-shaped like `buildProfileSubstackRouter` (`config`, `sessionUser`, `publish: publishKind0`, `fetchRaw: fetchRawKind0`, `custodialSign`, plus a new `updateDisplayName(userId, name)` DB dep). Custodial: `validateDisplayName` (reuse `passwords.ts`); `fetchRaw`; `buildProfileKind0Content(content, { displayName: D2 }, D2)` (merge-preserves `substack`/`website`/etc.); `buildKind0Template` with strictly-newer `created_at`; `custodialSign` (`null` ⇒ `401 reauth_required`); `publishKind0`; **then `updateDisplayName(user.id, D2)`** so Postgres and kind-0 agree; `200 { displayName: D2 }`. Sovereign ⇒ `403` (AC-8 — they own their profile). Anonymous ⇒ `401`. A `updateDisplayName` is added to `apps/api/src/auth/users.ts`. A name field is added to `Settings.tsx` (hidden/disabled for sovereign) and `api.profile.setDisplayName(name)` to `api.ts`.

7. **Sovereign untouched (AC-8).** No bootstrap, no reconciliation, no rename publish runs for `tier === "sovereign"` — each helper/route guards on tier. The `nostrVerify:` dep (`index.ts` lines 193–209) is not modified.

8. **Invariants honored.** No hand-rolled crypto (sign via `custodialSign`). No dcosl for kind-0 (uses `publishKind0`). No new dependency. No new DList shape. npub-display / hex-internal. Fail-open (signup) + best-effort (reconcile) + honest states (rename).

## Testability seams (call out for the Tester)

Everything is unit-testable with no live relay. **Inject, do not `vi.mock` intra-module calls** (prior gotcha).

- **`apps/api/src/profile/kind0.ts`** — pure; test `buildProfileKind0Content` (whitelist enforced; email/password/userId can't enter; `nameFloor` injects `name`+`display_name` only when absent; rawPrev fields preserved), `hasResolvableName`, `buildKind0Template`. No injection needed.
- **`bootstrapCustodialKind0`** — inject a fake `sign` (returns a canned signed event or `null`) and a fake `publishKind0` (captures the event, or throws / returns `{ ok: false }`). Assertions: AC-1 (captured event is `kind: 0`, `pubkey` = new user, parsed `name` == `display_name` == `D`); AC-3 (email string absent from content + tags); AC-4 (when `publishKind0` throws or returns `{ ok: false }` or `sign` returns `null`, the helper resolves without throwing — the caller's signup still returns 201).
- **`reconcileCustodialKind0`** — inject `fetchRaw` (returns missing / name-less / good-name content), `sign`, `publishKind0`. Assertions: AC-5 (missing or name-less ⇒ publishes a name-bearing kind-0 seeded from `displayName`; good-name ⇒ no publish call; any failure is swallowed; `created_at` strictly newer than the fetched event).
- **`apps/api/src/routes/profile-display-name.ts`** — DI `sessionUser`, `publish`, `fetchRaw`, `custodialSign`, `updateDisplayName` (all `vi.fn`), exactly as `profile-substack.test.ts` injects its deps. Assertions: AC-6 (merge preserves `substack`/`website`; published `name` == `D2`; `updateDisplayName` called with `D2`; `created_at` strictly newer); sovereign ⇒ 403; `custodialSign` `null` ⇒ 401; anonymous ⇒ 401.
- **`profile-substack.test.ts`** — add an AC-7 case: with no prior kind-0 but a `displayName` passed as floor, the Substack save's published kind-0 carries both `name` and `substack`.
- **`GET /api/profile/:id`** (AC-2) — verified through the existing `profile.test.ts` `resolve` injection returning the published kind-0; `name`/`display_name` == `D` ⇒ `displayNameOf` returns `D`.

## Consequences

- **Enables** a custodial user's chosen name to resolve in Unbnd and every nostr client immediately after signup, a name-bearing base for all later merge-preserve writes (AC-7), self-healing for missed publishes (AC-5), and a real rename path (AC-6) — the first editable kind-0 field beyond Substack.
- **Constrains:** signup now does one awaited local-relay publish (latency, bounded; fan-out is async). Reconciliation does one extra raw kind-0 read on each custodial login (a `limit:1` single-event read, same primitive `fetchProfileMeta`/profile-stats use; only repairs when needed). The DB↔kind-0 lockstep can drift if a user hand-edits their kind-0 on a relay (documented; we don't reconcile back into Postgres).
- **Debt / follow-ups:** the multi-client clobber window on kind-0 (ADR 0022, merge-from-freshest) is unchanged. A general profile editor (bio/nip05/lud16/picture) is still future scope; this story adds only the `displayName` field's propagation. Reconciliation does not retry on a failed login-repair (next login is the next chance) — acceptable per AC-5's best-effort framing.
- **Affects existing fixtures?** No DList fixtures. `substack-template.ts` is refactored to delegate to `kind0.ts` (its public `mergeSubstack` signature preserved); `substack-template.test.ts` keeps its assertions plus a name-floor case. No production fixture data changes.
- **New dependency?** No. Uses `nostr-tools/pure` (`finalizeEvent` via `custodialSign`), the ADR 0006 ephemeral wrap, `fetchRawKind0`, `publishKind0`, and `validateDisplayName` — all existing.
- **PRD section change required?** No. Implements §2.4 / §2.6 / C-1 as written; touches no §11.3 surface.
- **Brand tokens / copy:** the only new UI is a display-name field on `/settings` (reuses the existing form/token classes from `Settings.css`; no new hex literal, no new icon library). New strings (label, hint, save states, the reauth/error messages) are reviewed against `memory/feedback_unbnd_copy_and_visual.md` — no em dashes, no declarative-negative slop, no emoji.

## Implementation notes

Concrete files and boundaries for the Implementer.

### New files

- **`apps/api/src/profile/kind0.ts`** — `PROFILE_KIND0_FIELDS`, `ProfilePatch`, `buildProfileKind0Content(rawPrev, patch, nameFloor?)`, `hasResolvableName(content)`, `buildKind0Template(content, createdAt)` (lifted from `substack-template.ts`). Pure, no I/O. The privacy whitelist is the closed patch surface.
- **`apps/api/src/profile/bootstrap-kind0.ts`** (or co-located) — `bootstrapCustodialKind0({ sign, publishKind0, now }, { displayName, sessionIdHex })`: build from `buildProfileKind0Content(null, { displayName }, displayName)`, template at `now`, sign, publish; all internal failures logged + swallowed (returns `void`, never throws).
- **`apps/api/src/profile/reconcile-kind0.ts`** (or co-located) — `reconcileCustodialKind0({ fetchRaw, sign, publishKind0, now }, { displayName, pubkeyHex, sessionIdHex })`: fetch raw; `hasResolvableName` ⇒ early return; else merge + `created_at = max(now, createdAt+1)` + sign + publish; swallow failures.
- **`apps/api/src/routes/profile-display-name.ts`** — `buildProfileDisplayNameRouter(deps)`, DI like `buildProfileSubstackRouter` plus `updateDisplayName`. `POST /api/profile/display-name`, tier-branched (custodial: publish + DB lockstep; sovereign: 403; anon: 401).

### Ripple files (modified)

- **`apps/api/src/profile/substack-template.ts`** — `mergeSubstack` delegates to `buildProfileKind0Content(raw, { substack: url }, nameFloor)`; `buildKind0Template` re-exported from / imported from `kind0.ts`. Pass the caller's `displayName` as `nameFloor` (the route already has `user`; thread it through, or have the route read it). Public `mergeSubstack` signature may gain an optional `nameFloor` param.
- **`apps/api/src/routes/profile-substack.ts`** — thread the session user's `displayName` into the merge as the name floor (AC-7), for both the `/template` and custodial submit paths. (The router's `sessionUser` shape may need `displayName`; see `resolveSessionUser` below.)
- **`apps/api/src/auth/users.ts`** — add `updateDisplayName(tx-or-db, userId, name): Promise<UserRow>` (a `users` UPDATE on `displayName` by `id`); `PublicUser` already carries `displayName`.
- **`apps/api/src/index.ts`** —
  - `signup:` dep: after lines 126–139, before line 140 `return`, add `try { await bootstrapCustodialKind0({ sign: userEventDeps.custodialSign, publishKind0, now }, { displayName: input.displayName, sessionIdHex: tokenToId(user.session.token).toString("hex") }); } catch (e) { console.warn(...) }`. Note `publishKind0` and `userEventDeps` are defined *below* the auth router today (lines 236, 290) — the Implementer must reorder so the publisher + sign dep are constructed before `buildAuthRouter`, or pass them via a thunk. Call this out: the wiring order changes.
  - `login:` dep: after line 169 (`rememberSessionKey`), before line 170 `return`, add the best-effort `reconcileCustodialKind0(...)` call guarded on `row.tier === "custodial"`, swallowed. Same ordering caveat.
  - Register `buildProfileDisplayNameRouter({ config, sessionUser: resolveSessionUser, publish: publishKind0, fetchRaw: (hex) => fetchRawKind0(config.profileRelays ?? [], hex), custodialSign: userEventDeps.custodialSign, updateDisplayName: (id, name) => db.transaction((tx) => updateDisplayName(tx, id, name)) })`.
  - `resolveSessionUser` (lines 279–287): add `displayName: resolved.user.displayName` to the returned shape so the Substack and display-name routes can read the name floor / current name.
- **`apps/web/src/lib/api.ts`** — add `api.profile.setDisplayName(name) → POST /api/profile/display-name { displayName } → { displayName }`.
- **`apps/web/src/routes/Settings.tsx`** — add a display-name field (prefilled from `useSession().user.displayName` or `useProfileMeta(npub)?.name`), custodial-only (hidden/disabled for sovereign), Save with honest `idle|saving|saved|error` states; on success update the session/echo and `invalidateProfileMeta(user.npub)`. Reuse existing `Settings.css` tokens.

### Existing tests that change

- `apps/api/test/profile/substack-template.test.ts` — assertions preserved + a name-floor case (AC-7).
- New: `kind0.test.ts`, `bootstrap-kind0.test.ts`, `reconcile-kind0.test.ts`, `routes/profile-display-name.test.ts`.
- `apps/api/test/routes/auth.test.ts` — unchanged in shape; the bootstrap/reconcile are not in the route, so the auth-router suite stays green. (If the Implementer chooses to surface a hook through the dep for an integration assertion, that is optional and must not couple the route to a live relay.)
- `apps/api/test/routes/profile.test.ts` — reuse the injected `resolve` to assert AC-2.

### DList shapes

None. kind-0 is an existing NIP-01 replaceable metadata event (flat JSON content, `tags: []`), published via `publishKind0` to the local relay + `config.profileRelays` fan-out, never dcosl. No `kind:39998`/`kind:39999`, no kind-3.

## Out of scope

- Custodial avatar IMAGE / `picture` (no blob storage; §2.4 "initials for custodial").
- A general profile editor (bio/nip05/lud16/website/banner). The shared builder is the foundation; only `name`/`display_name` (and the existing Substack field) are written here.
- Reconciling a hand-edited relay kind-0 back into Postgres (one-directional: DB seeds kind-0, not vice versa).
- The C-5 profile-IA refactor, C-3 provider federation, any sovereign-side change (AC-8), and all §11.3 Phase-2+ items.
- Eliminating the multi-client kind-0 clobber window (ADR 0022 merge-from-freshest is the mitigation; unchanged).
