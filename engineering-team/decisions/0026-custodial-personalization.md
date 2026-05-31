# ADR 0026: Custodial personalization — the server-signed "Personalize" trigger

**Status:** Proposed
**Date:** 2026-05-31
**Story:** `engineering-team/stories/26-custodial-personalization.md`

## Context

Today only **sovereign** (NIP-07) users can trigger the personalized "Yours" view. ADR 0014 Phase B made the Personalize trigger a four-step round-trip: `GET /api/trust/challenge` → the user **NIP-07-signs** a kind-27235 challenge with their own key → `POST /api/trust/personalize` with `{ event }` → the server calls `trust.personalize(observerHex, signedEvent)` to queue the user's own GrapeRank calc. That signing step needs the user's private key in the browser, which a **custodial** (email-signup) user does not hold. The current trust route hard-rejects custodial users at both `/api/trust/challenge` and `/api/trust/personalize` with `not_supported` (`apps/api/src/routes/trust.ts` lines 53–54, 70–71), `/api/trust/status` returns `canPersonalize: false` for every custodial user (line 40), and `useTrustView` collapses every non-sovereign session to `house-only` (`apps/web/src/hooks/useTrustView.ts` line 60).

The prerequisites are in place:

- **Custodial server-side signing (ADR 0006):** the session's decrypted nsec is re-wrapped under a process-local ephemeral key (`apps/api/src/auth/ephemeral.ts`); `useSessionKey(sessionIdHex, fn)` unwraps it in memory, signs, wipes, and throws `NoSessionKeyError` when the wrap is gone (restart/eviction). `index.ts` wires this into a `custodialSign(sessionIdHex, template) → SignedNostrEvent | null` dep (returns `null` on `NoSessionKeyError`) shared by every custodial write (ratings, tags, shelves, kind-0 Substack, kind-3 follows). The write routes tier-branch on `user.tier === "custodial"` and map `null` → `401 reauth_required` (`apps/api/src/routes/profile-follow.ts` lines 151–167).
- **Custodial follow graph (Story 23 / ADR 0023):** a custodial user already builds the kind-3 contact list GrapeRank needs, server-signed via the same ephemeral wrap. `distinctFollowCount(events)` (`apps/api/src/routes/profile-stats.ts` line 41) is the canonical count of the user's own kind-3 `p`-tags, already surfaced as `followingCount`. `fetchRawKind3(relays, hex)` (`apps/api/src/nostr/profile.ts` line 163) returns the freshest raw kind-3.
- **The decision of record (ADR 0022 "option b" / phase2-prd §2.6):** the SERVER may sign the Brainstorm auth challenge with the session's ephemeral-wrapped custodial key. Not a new sovereignty compromise — the custodial contract already has the server sign for every write. It removes the external dependency on Brainstorm whitelisting an Unbnd key (no admin/whitelist path).
- **The trust seam (ADR 0014 / 0017):** today `TrustProvider.authChallenge(observerHex) → Promise<string | null>` and `TrustProvider.personalize(observerHex, signedChallenge) → Promise<boolean>` (`apps/api/src/trust/types.ts` lines 57, 62–65). `BrainstormProvider` is the only backend-aware file; its `authChallenge` `GET`s `/authChallenge/{observer}` and returns just the challenge **string** (`apps/api/src/trust/brainstorm.ts` lines 141–150). `FixtureTrustProvider` returns a deterministic challenge string (`fixture-challenge:<observer>`) and, on `personalize`, flips the observer to `hasScores: true` (`apps/api/src/trust/fixture.ts` lines 50–64). A repo-wide architecture guard fails CI if Brainstorm/NIP-85 specifics leak outside `trust/brainstorm.ts`.

**The load-bearing detail — the challenge-EVENT construction lives in the WEB today, and that is the seam this amendment moves.** `useTrustView.personalize()` (`apps/web/src/hooks/useTrustView.ts` lines 102–108) fetches the challenge string from `/api/trust/challenge`, then **constructs and NIP-07-signs** the kind-27235 event itself:

```
kind: 27235,
created_at: Math.floor(Date.now() / 1000),
tags: [["challenge", challenge], ["t", "brainstorm_login"]],
content: "",
```

So the Brainstorm-specific `["t","brainstorm_login"]` tag — and the whole kind-27235 shape Brainstorm's `/authChallenge/{pk}/verify` expects — leaks into neutral web code. (The literal `brainstorm_login` currently lives in exactly one file: `useTrustView.ts`. kind 27235 is the standard NIP-98 auth kind, NOT Brainstorm-specific.) For the custodial path the **server** must build this *same* template and sign it with the session's ephemeral key.

**User gate decision (this amendment): move the template construction BEHIND the provider.** Rather than extract a shared builder that still names `brainstorm_login` in neutral code, the Brainstorm-flavored event shape lives ONLY in the adapter. `TrustProvider.authChallenge` is changed to return the full **unsigned challenge template** (the kind-27235 event-to-sign), not just the challenge string. The `BrainstormProvider` builds that template (so `brainstorm_login` + the kind-27235 tag shape stay inside `brainstorm.ts`); both tiers then merely **sign** whatever the provider/route hands them. This makes sovereign and custodial symmetric (server builds template → client/server signs), mirroring the substack flow. See Decision (1) for the revised contract and the ADR 0014 guard amendment.

**PRD anchor:** phase2-prd **§2.6 "Custodial personalization (in-app follow graph)"** — the two unfilled acceptance lines (in-session trigger; House↔Yours parity). The follow-mechanism line shipped in Story 23. Does not touch PRD §11.3 out-of-scope.

**Architecture invariants (CLAUDE.md):** POV-first — "Yours" stays `(events from anyone) × (that observer's GrapeRank)`, computed per-POV at read time via `?observer=<npub>` (unchanged from ADR 0014). This story adds a second *trigger* path for the user's own POV calc, not a new stored aggregate. No hand-rolled crypto (sign via the audited `finalizeEvent` through `custodialSign`). No fabricated trust numbers ("building" is honest; "Yours" is honest weighted-or-fallback). npub-display / hex-internal. Fail-closed in-session-only trigger.

This ADR does not contradict any prior ADR. It extends ADR 0014's trigger to a second tier using the ADR 0006 signing mechanism and the ADR 0017 fixture seam, and lifts the `not_supported` guard ADR 0014 deferred. It honors ADR 0022 option b (server signs the Brainstorm auth challenge for custodial; no whitelist).

## Options considered

The two real forks are: **(F1)** the endpoint shape (tier-branch the existing route vs. a sibling custodial endpoint); **(F2)** where the follow-count gate is enforced.

### F1 — Endpoint shape for the custodial trigger

#### Option A — Tier-branch the existing `/api/trust/personalize` (chosen)

Mirror the substack/shelves/follow pattern exactly. `POST /api/trust/personalize` branches on `user.tier`:

- **sovereign** (today's path, **unchanged**): body `{ event }` — a client-signed kind-27235. The server validates `event.pubkey === user.pubkeyHex` and calls `trust.personalize(user.pubkeyHex, event)`.
- **custodial**: body carries **nothing to sign**. The server (1) re-checks the follow-count gate; (2) calls `trust.authChallenge(user.pubkeyHex)`; (3) builds the kind-27235 challenge template via a shared builder; (4) signs it with `custodialSign(sessionIdHex, template)` — `null` ⇒ `401 reauth_required`, never calls `personalize`; (5) calls `trust.personalize(user.pubkeyHex, signed)`. On success `200 { ok: true, building: true }` (identical response to sovereign).

`/api/trust/status` and `/api/trust/challenge` relax the `not_supported` guard for custodial users at/above the gate.

**Pros:**
- One endpoint, one web client method, one `PoVBar`/`useTrustView` wiring — the seam, the tests, and the UI stay singular. Identical in shape to `/api/profile/follow` and `/api/profile/substack`, which the Tester/Implementer/Reviewer already recognize.
- The `trust.personalize(observerHex, signedEvent)` provider call is identical for both tiers — only *who produced the signature* differs. The fixture provider verifies both branches with zero changes.
- The sovereign branch is byte-for-byte the current code; "sovereign path unchanged" is trivially satisfiable.

**Cons:**
- The route grows a tier branch and now reads the kind-3 follow count + signs server-side — more responsibility in one handler. Mitigated by extracting the challenge builder and the gate count into small pure/injected helpers (the route stays a dispatcher).

#### Option B — A sibling `POST /api/trust/personalize/custodial`

A separate endpoint for the custodial server-sign flow; leave `/api/trust/personalize` sovereign-only.

**Pros:** the sovereign handler is untouched; the custodial logic is isolated.

**Cons:** two endpoints, two web client methods, and `useTrustView` would branch on tier to pick the URL — duplicating the dispatch the tier-branch does in one place. It diverges from the established custodial-write pattern (every other custodial write reuses the sovereign route with a tier branch), so it reads as a special case for no benefit. The `trust.personalize` call and the `building` response are identical anyway; splitting the route splits nothing real. Rejected.

### F2 — Where the follow-count gate is enforced

#### Option A — Server enforces the gate before signing/triggering; UI also hides the prompt (defense in depth) (chosen)

The UI hides the Personalize affordance below the threshold (honest prompt instead), **and** the endpoint independently re-reads the session user's own kind-3 `p`-tag count and refuses to sign/trigger below the threshold with a typed `403 below_follow_gate`. `/api/trust/status` reports `canPersonalize` reflecting tier **and** the gate (custodial: eligible only at/above threshold).

**Pros:**
- Honest end to end: a hand-crafted request can't waste a GrapeRank calc (and a near-empty "Yours") by bypassing the UI. The gate is a real server invariant, not a cosmetic UI rule.
- Reuses the existing kind-3 read primitives (`fetchRawKind3` + a `distinctFollowCount`-equivalent), so the server already has everything it needs.

**Cons:**
- One extra kind-3 read on the trigger path (and on `/status` for custodial). Acceptable: it's a `limit:1` single-event read, the same one `/profile/me/stats` already does, and the trigger is a rare user action.

#### Option B — UI-only gate

Hide the prompt below threshold; the endpoint trusts the UI and signs whatever it's asked.

**Cons:** the server would queue an expensive calc for a user with zero/one follow from any crafted request, producing a useless "Yours" view and wasted compute — exactly the bad first impression the gate exists to prevent. The gate would be a suggestion, not an invariant. Rejected.

## Decision

We chose **F1-A** (tier-branch the existing `/api/trust/personalize`, relax `not_supported` on `/status` + `/challenge` for eligible custodial) and **F2-A** (server enforces the follow-count gate; UI also hides the prompt).

Concretely:

1. **Challenge-template seam: `authChallenge` returns the unsigned template; both tiers sign it (REVISED by the user gate decision — construction moves behind the provider).**

   **Revised provider contract.** `TrustProvider.authChallenge` changes from returning the challenge *string* to returning the full **unsigned challenge TEMPLATE to sign** — the kind-27235 NIP-98 event the backend expects, or `null`:

   ```ts
   // before: authChallenge(observerHex: string): Promise<string | null>
   // after:
   authChallenge(observerHex: string): Promise<NostrEventTemplate | null>
   // NostrEventTemplate = { kind: number; created_at: number; tags: string[][]; content: string }
   ```

   The **`BrainstormProvider`** owns the Brainstorm-flavored shape: it `GET`s `/authChallenge/{observer}` for the challenge string (as today), then builds and returns `{ kind: 27235, created_at: <now>, tags: [["challenge", <challenge>], ["t", "brainstorm_login"]], content: "" }` — so the `brainstorm_login` literal and the kind-27235 tag shape now live ONLY in `brainstorm.ts`. (`null` on a backend failure, unchanged best-effort semantics.)

   The **`FixtureTrustProvider`** returns a deterministic GENERIC template — a signable kind-27235 with just the challenge tag, e.g. `{ kind: 27235, created_at: <deterministic>, tags: [["challenge", "fixture-challenge:<observer>"]], content: "" }` — it does **not** include `brainstorm_login` (it is a stub; its `personalize` returns true regardless). After this amendment, `brainstorm_login` appears in **no file except `brainstorm.ts`**.

   **`personalize(observerHex, signedEvent)` is UNCHANGED** — it still verifies the signed kind-27235 and triggers the run.

   **Trust route + both client/server sign paths (symmetric, like substack).** The trust route's `/api/trust/challenge` returns the server-built **template** (the `authChallenge` result), not a bare string. Both paths then just SIGN that template:
   - **Sovereign (small refactor, behavior preserved):** `useTrustView.personalize()` STOPS constructing the kind-27235 itself. It fetches the server-returned template and NIP-07-signs it verbatim, then POSTs the signed event. Sovereign BEHAVIOR is preserved — still a NIP-07-signed kind-27235 with the same `["challenge",…]` + `["t","brainstorm_login"]` tags Brainstorm expects; only WHERE the template is constructed moves (web → provider).
   - **Custodial (this story's path):** `POST /api/trust/personalize` tier-branches. Custodial posts no event; the server re-checks the gate, calls `trust.authChallenge(observerHex)` (`null` ⇒ `502 challenge_failed`) to get the template, signs it via `custodialSign(sessionIdHex, template)` (`null` ⇒ `401 reauth_required`, no `personalize` call), and calls `trust.personalize(observerHex, signed)` (`false` ⇒ `502 trigger_failed`). Response on success: `200 { ok: true, building: true }` (identical to sovereign).

   Sovereign branch of `POST /api/trust/personalize` is otherwise unchanged (`{ event }` → validate `event.pubkey === user.pubkeyHex` → `trust.personalize`). No shared web/server "challenge-event builder" module is needed any more — the provider IS the single source of the template, so the two tiers cannot drift.

   **ADR 0014 guard amendment.** The repo-wide architecture guard (`apps/api/test/trust/architecture.test.ts`) gains the **`brainstorm_login`** literal in its forbidden-pattern list, so that string may appear only in `brainstorm.ts` going forward (enforcing this seam). The guard's existing patterns (`/setup/`, `/authChallenge`, `/user/graperank`, `graperankResult`, `30382`) are kept. **kind 27235 is the standard NIP-98 kind and is NOT added to the guard** — only `brainstorm_login`.

2. **The follow-count gate.** A new config constant **`PERSONALIZE_MIN_FOLLOWS`** (env-overridable, **default 10**, matching PRD §9.5's "ten follows"). The server reads the session user's own freshest kind-3 and counts distinct `p`-tags; below the threshold the custodial trigger returns **`403 below_follow_gate`** (typed, not a silent no-op) and does **not** sign or call `personalize`. `/api/trust/status` reports custodial `canPersonalize = (gate met)`; `/api/trust/challenge` relaxes `not_supported` for custodial at/above the gate. **Staging override:** set `PERSONALIZE_MIN_FOLLOWS=1` (or `2`) so the custodial trigger is exercisable without recruiting ten real follows. **Gate scope: custodial only.** Sovereign keeps its current behavior (any follow count) to honor the "sovereign path unchanged" AC; a unified gate is a documented follow-up (Open Question 1 in the story).

3. **Web parity + below-gate prompt.** `useTrustView` stops collapsing custodial to `house-only`: for a custodial session it calls `api.trust.status()` like sovereign. Above the gate with no scores → `none` (offers Personalize); at/above gate after trigger → `building` → poll `hasScores` → `ready`. The `personalize()` callback branches on tier: **sovereign keeps the NIP-07 sign path but now signs the SERVER-RETURNED template** — per Decision (1), `useTrustView` no longer constructs the kind-27235 itself; it fetches the template from `/api/trust/challenge` and NIP-07-signs it verbatim (same kind/tags, preserved behavior); **custodial calls a new `api.trust.personalizeCustodial()` that POSTs an empty body — no NIP-07 prompt, the server signs the template.** Below the gate, a new `TrustStatus` value **`gated`** renders an honest prompt in `PoVBar` ("Follow a few curators to personalize your view.") instead of the trigger. Everything else — the "building" copy, the `hasScores` poll, the House⇄Yours switcher, and `?observer=<their npub>` weighting — is reused verbatim from sovereign. No custodial-specific explainer; no new components beyond the `gated` branch in the existing `PoVBar`.

4. **Fixture verification.** With `TRUST_PROVIDER=fixture`, the whole path is CI-testable with no Brainstorm round-trip: `authChallenge` returns the deterministic GENERIC kind-27235 template (challenge tag only, no `brainstorm_login`), the route signs that template with a test session key (the route's `custodialSign`/follow-count deps are injected and mocked), `personalize` returns `true` and flips the observer to scored, and a subsequent `/status` read reports `hasScores: true`. The gate is tested by varying the mocked kind-3 count across the threshold. The ADR 0014 architecture guard stays green — the route touches only the neutral `TrustProvider` seam, signs whatever template the provider returns, and never names Brainstorm specifics (and after the guard amendment, `brainstorm_login` is forbidden outside `brainstorm.ts`).

5. **Invariants honored.** No hand-rolled crypto (sign via the existing `custodialSign` → `useSessionKey` → `finalizeEvent`). No fake trust numbers ("building" is honest; "Yours" is the existing honest weighted-or-fallback). Provider seam reused (no Brainstorm specifics outside the adapter; the route is provider-neutral). npub-display / hex-internal. In-session-only, fail-closed (`reauth_required` when the wrap is gone). No new tooling, no new runtime dependency. The house-observer swap is explicitly NOT here (deferred, ADR 0014).

## Consequences

- **Enables** custodial (email) users to trigger their own GrapeRank personalization in-session, reaching full House↔Yours parity with sovereign. Fills the two open §2.6 acceptance lines.
- **Constrains:** custodial triggering now depends on a live ephemeral wrap (in-session only); a server restart forces re-login before a custodial user can personalize (same property as every custodial write, by design). The trigger does one extra kind-3 read for the gate.
- **Debt / follow-ups:** (a) a *unified* follow gate across both tiers (currently custodial-only) is deferred; (b) the house-observer swap (nosfabrica → a real Unbnd librarian observer) stays deferred per ADR 0014; (c) the challenge-event construction now lives in ONE place — the provider (`authChallenge` returns the template). If Brainstorm changes the expected kind/tags, only `brainstorm.ts` updates; the route and both client/server sign paths are template-agnostic.
- **`authChallenge` return-type change (REVISED contract) ripples to:** the `TrustProvider` interface (`apps/api/src/trust/types.ts` — return type `string | null` → `NostrEventTemplate | null`; the `FixtureSpec.challenge` doc/type also shifts from a string to a template); the **`BrainstormProvider`** (`apps/api/src/trust/brainstorm.ts` — `authChallenge` now builds + returns the kind-27235 template incl. `brainstorm_login`); the **`FixtureTrustProvider`** (`apps/api/src/trust/fixture.ts` — returns a generic kind-27235 template, no `brainstorm_login`); the **trust route** (`apps/api/src/routes/trust.ts` — `/api/trust/challenge` returns the template; custodial `personalize` signs the template); **`useTrustView.ts`** (`apps/web/src/hooks/useTrustView.ts` — stops building the event, signs the server template); **`api.ts`** (`apps/web/src/lib/api.ts` line 353 — `/api/trust/challenge` response type `{ challenge: string }` → `{ template: NostrEventTemplate }` or equivalent, plus the new `personalizeCustodial()`); and **the existing trust tests/mocks** — `apps/api/test/routes/trust.test.ts` (`authChallenge` mock + the `/challenge` assertions), `apps/api/test/trust/fixture.test.ts` (`authChallenge` deterministic-default/override/null assertions), `apps/api/test/trust/brainstorm.test.ts` (`authChallenge returns the challenge string` → now returns a template), `apps/api/test/routes/ratings.test.ts` + `apps/api/test/routes/tags-weighted.test.ts` (their `authChallenge: vi.fn(async () => "c")` provider mocks), and `apps/web/test/hooks/use-trust-view.test.tsx` (sovereign now signs a server-returned template). The guard test (`apps/api/test/trust/architecture.test.ts`) gains the `brainstorm_login` pattern.
- **Affects existing fixtures?** No DList fixtures. The `FixtureTrustProvider`'s `authChallenge` changes shape (string → generic template) but its `personalize` behavior is unchanged. Route-test deps gain a follow-count reader + the existing `custodialSign` shape (test-only wiring). The web `TrustStatus` union gains `gated`.
- **New dependency?** No. Uses existing `nostr-tools/pure` (`finalizeEvent`), the ADR 0006 ephemeral wrap, `fetchRawKind3` + `distinctFollowCount`, and the existing `TrustProvider` seam.
- **PRD section change required?** No. Implements phase2-prd §2.6 as written; does not touch §11.3.
- **Brand tokens / copy:** the only new UI string is the below-gate prompt ("Follow a few curators to personalize your view." — wording owned by the Implementer/Tester) in the existing `PoVBar`, using existing `PoVBar.css` tokens. No new hex literal, no new icon library. The string is reviewed against `memory/feedback_unbnd_copy_and_visual.md` (no em dashes, no slop).

## Implementation notes

Concrete files and boundaries for the Implementer.

### API — challenge template lives behind the provider (the user gate decision)

The template construction is NOT a shared web/server builder; it moves INTO the provider via the revised `authChallenge` contract (Decision 1).

- **File: `apps/api/src/trust/types.ts`** — change `authChallenge(observerHex): Promise<string | null>` to `authChallenge(observerHex): Promise<NostrEventTemplate | null>` where `NostrEventTemplate = { kind: number; created_at: number; tags: string[][]; content: string }` (use the existing template type from `@unbnd/schemas` if one exists; otherwise add a small neutral type here). Update the `FixtureSpec.challenge` field/doc to carry a template (or keep a challenge-string knob and have the fixture wrap it into the generic template — implementer's call, but the returned type is a template).
- **File: `apps/api/src/trust/brainstorm.ts`** — `authChallenge` keeps the `GET /authChallenge/{observer}` fetch for the challenge string, then returns `{ kind: 27235, created_at: Math.floor(Date.now()/1000), tags: [["challenge", challenge], ["t", "brainstorm_login"]], content: "" }`. This is the ONLY file that may contain the `brainstorm_login` literal (and the guard now enforces that — see below). `null` on fetch/parse failure (unchanged).
- **File: `apps/api/src/trust/fixture.ts`** — `authChallenge` returns a deterministic GENERIC template: `{ kind: 27235, created_at: <fixed/deterministic>, tags: [["challenge", "fixture-challenge:<observer>"]], content: "" }` (NO `brainstorm_login`). `personalize` unchanged (returns true, flips to scored).
- **Guard amendment — `apps/api/test/trust/architecture.test.ts`**: add `brainstorm_login` to the rule's `pattern` (currently `/\/setup\/|\/authChallenge|\/user\/graperank|graperankResult|\b30382\b/`) so it becomes e.g. `/\/setup\/|\/authChallenge|\/user\/graperank|graperankResult|\b30382\b|brainstorm_login/`. Do NOT add `27235` (standard NIP-98 kind). After the `useTrustView.ts` refactor (it no longer contains the literal), the guard will be green.

### API — follow-count gate

- **File: `apps/api/src/config.ts`** — add `PERSONALIZE_MIN_FOLLOWS` (default `10`), parsed like `PORT` (`Number`, must be a non-negative integer; throw on garbage), surfaced as `config.personalizeMinFollows`. Document the staging override (`=1`/`=2`) in the config comment.
- Reuse the kind-3 count: lift `distinctFollowCount` (`apps/api/src/routes/profile-stats.ts` line 41) into a shared module (e.g. `apps/api/src/profile/follow-count.ts`) so both the stats route and the trust route use the one counter; the trust route reads the user's freshest kind-3 via the same `query`/`fetchRawKind3` primitive (`{ kinds: [3], authors: [user.pubkeyHex], limit: 1 }`).

### API — routes (`apps/api/src/routes/trust.ts`)

- Extend `TrustRouteDeps` with the deps the custodial branch needs (DI, test-hermetic): `config` (for `personalizeMinFollows`), a `followCount(pubkeyHex) → Promise<number>` reader, and `custodialSign(sessionIdHex, template) → Promise<SignedNostrEvent | null>` (the same dep `index.ts` already builds for the other custodial writes). Resolve `sessionIdHex` from the cookie via `tokenToId` (mirror `profile-follow.ts` line 157).
- `GET /api/trust/status`: for custodial, replace `canPersonalize = user.tier !== "custodial"` with `canPersonalize = (await followCount(user.pubkeyHex)) >= config.personalizeMinFollows`. Sovereign unchanged.
- `GET /api/trust/challenge`: now returns the **template** (`await trust.authChallenge(user.pubkeyHex)`), not a bare string — both tiers sign it. Response e.g. `{ template }` (`null` ⇒ `502 challenge_failed`). Relax the `not_supported` guard — for custodial at/above the gate, proceed (so the sovereign refactor and a symmetric custodial path share one endpoint); below the gate, return the gated signal (`403 below_follow_gate`). The sovereign web path now hits this endpoint to fetch the template it signs; the custodial server trigger fetches the template itself via `authChallenge`, so it does not strictly need to call `/challenge` — relaxing it is for symmetry/defense.
- `POST /api/trust/personalize`: tier-branch.
  - **sovereign** (behavior unchanged): `{ event }` → `event.pubkey === user.pubkeyHex` check → `trust.personalize`. (The event is now the server-template the web NIP-07-signed, but the route's validation + call are unchanged.)
  - **custodial**: `if ((await followCount(user.pubkeyHex)) < config.personalizeMinFollows)` → `403 below_follow_gate` (no sign, no personalize). Else `const template = await trust.authChallenge(user.pubkeyHex)` (`null` ⇒ `502 challenge_failed`) — the provider already returns the full unsigned kind-27235 template, so there is NO route-side builder; `const signed = await custodialSign(sessionIdHex, template)` (`null` ⇒ `401 reauth_required`, no personalize); `const ok = await trust.personalize(user.pubkeyHex, signed)` (`false` ⇒ `502 trigger_failed`); else `200 { ok: true, building: true }`.

### API — wiring (`apps/api/src/index.ts`)

- `buildTrustRouter({ sessionUser: resolveSessionUser, trust, config, custodialSign: userEventDeps.custodialSign, followCount: (hex) => /* freshest kind-3 → distinctFollowCount */ })`. The `followCount` reader uses the existing `queryEvents`/`fetchRawKind3` path (`config.profileRelays`), mirroring how `profile-stats` reads kind-3.

### Web

- **File: `apps/web/src/lib/api.ts`** — (a) change the `/api/trust/challenge` response type (line 353) from `{ challenge: string }` to the template the server now returns (e.g. `{ template: { kind: number; created_at: number; tags: string[][]; content: string } }`); (b) add `api.trust.personalizeCustodial()` → `POST /api/trust/personalize` with an empty body (`{}`), returning `{ ok: true; building: boolean }` (same response type as the sovereign `personalize`).
- **File: `apps/web/src/hooks/useTrustView.ts`** — (0) **sovereign refactor (template-sign):** `personalize()` STOPS constructing the kind-27235 object (current lines 103–108). It fetches the server template via `api.trust.challenge()` and NIP-07-signs THAT verbatim (`nostr.signEvent(template)`), then `api.trust.personalize(signed)`. The `brainstorm_login` literal is REMOVED from this file (now only in `brainstorm.ts`). Behavior is preserved — same kind/tags, just server-sourced. (1) stop early-returning `house-only` for non-sovereign; compute `custodial = signed-in && user.email !== null` and let custodial run the same `api.trust.status()` resolution; (2) add a `gated` `TrustStatus` (custodial, `canPersonalize: false` → `gated`; today that maps to `house-only`); (3) `personalize()` branches: sovereign uses the template-sign path above; custodial calls `api.trust.personalizeCustodial()` (no `window.nostr`, no signing) then `setStatus("building")`. The `building` poll and `?observer` weighting are unchanged. `npub` already comes from the session for both tiers.
- **File: `apps/web/src/components/PoVBar.tsx`** — add a `gated` branch: the honest "Follow a few curators to personalize your view." prompt (existing `pov`/`pov-hint` classes), no Personalize button. The `none`/`building`/`ready`/`house-only` branches are unchanged and shared across tiers.
- **Styling:** reuse `PoVBar.css`; no new hex literal, no new icon library; the one new string reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

### DList shapes

None. kind-27235 is an ephemeral NIP-98-style auth event consumed by the trust provider, not stored, not a DList record. No new `kind:39998`/`kind:39999` header or item, no kind-0/kind-3 write (the kind-3 graph it reads was delivered by Story 23).

## Out of scope

- **The house-observer swap** (nosfabrica → a real Unbnd librarian observer) — deferred per ADR 0014.
- **A unified follow gate across both tiers** — this story gates custodial only; sovereign keeps any-count to honor "sovereign path unchanged." Unifying is a follow-up.
- **Sovereign personalization** — shipped (ADR 0014 Phase B); only confirmed still working here.
- **The follow mechanism** — done (Story 23 / ADR 0023); consumed, not changed.
- **Admin / whitelist triggering of OTHER pubkeys** — ADR 0022 option b is chosen precisely to avoid the Brainstorm admin/whitelist path; triggering any pubkey but the session user's own is out.
- **Trust-weighted search ranking / homepage trust shelves (Block D)** — separate phase-2 stories that depend on the house-observer swap.
- PRD §11.3 Phase-2+ items untouched: payments, Blossom, ebook sales, federation, email notifications, social feed.
