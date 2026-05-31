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
- **The trust seam (ADR 0014 / 0017):** `TrustProvider.authChallenge(observerHex) → string | null` and `TrustProvider.personalize(observerHex, signedChallenge) → boolean` (`apps/api/src/trust/types.ts`). `BrainstormProvider` is the only backend-aware file; `FixtureTrustProvider` returns a deterministic challenge (`fixture-challenge:<observer>`) and, on `personalize`, flips the observer to `hasScores: true` (`apps/api/src/trust/fixture.ts` lines 50–64). A repo-wide architecture guard fails CI if Brainstorm/NIP-85 specifics leak outside `trust/brainstorm.ts`.

**The load-bearing detail — the challenge-event construction lives in the web today.** `useTrustView.personalize()` (lines 102–108) builds the kind-27235 event the sovereign client signs:

```
kind: 27235,
created_at: Math.floor(Date.now() / 1000),
tags: [["challenge", challenge], ["t", "brainstorm_login"]],
content: "",
```

For the custodial path the **server** must build this *same* template (so Brainstorm's `/authChallenge/{pk}/verify` accepts it) and sign it with the session's ephemeral key. The construction must be extracted into one shared builder so the two tiers cannot drift.

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

1. **Custodial trigger flow + endpoint.** `POST /api/trust/personalize` tier-branches. Sovereign is unchanged (`{ event }` → validate pubkey → `trust.personalize`). Custodial posts no event; the server re-checks the gate, fetches the challenge via `trust.authChallenge(observerHex)`, builds the **kind-27235** challenge template with the **shared builder** (reused verbatim from what the sovereign client signs today: `tags: [["challenge", challenge], ["t", "brainstorm_login"]]`, `content: ""`, `created_at = now`), signs it via `custodialSign(sessionIdHex, template)` (`null` ⇒ `401 reauth_required`, no `personalize` call), and calls `trust.personalize(observerHex, signed)`. Response on success: `200 { ok: true, building: true }` (identical to sovereign). `trust.authChallenge` returning `null` ⇒ `502 challenge_failed`; `trust.personalize` returning `false` ⇒ `502 trigger_failed`.

2. **The follow-count gate.** A new config constant **`PERSONALIZE_MIN_FOLLOWS`** (env-overridable, **default 10**, matching PRD §9.5's "ten follows"). The server reads the session user's own freshest kind-3 and counts distinct `p`-tags; below the threshold the custodial trigger returns **`403 below_follow_gate`** (typed, not a silent no-op) and does **not** sign or call `personalize`. `/api/trust/status` reports custodial `canPersonalize = (gate met)`; `/api/trust/challenge` relaxes `not_supported` for custodial at/above the gate. **Staging override:** set `PERSONALIZE_MIN_FOLLOWS=1` (or `2`) so the custodial trigger is exercisable without recruiting ten real follows. **Gate scope: custodial only.** Sovereign keeps its current behavior (any follow count) to honor the "sovereign path unchanged" AC; a unified gate is a documented follow-up (Open Question 1 in the story).

3. **Web parity + below-gate prompt.** `useTrustView` stops collapsing custodial to `house-only`: for a custodial session it calls `api.trust.status()` like sovereign. Above the gate with no scores → `none` (offers Personalize); at/above gate after trigger → `building` → poll `hasScores` → `ready`. The `personalize()` callback branches on tier: sovereign keeps the NIP-07 sign path; **custodial calls a new `api.trust.personalizeCustodial()` that POSTs an empty body — no NIP-07 prompt, the server signs.** Below the gate, a new `TrustStatus` value **`gated`** renders an honest prompt in `PoVBar` ("Follow a few curators to personalize your view.") instead of the trigger. Everything else — the "building" copy, the `hasScores` poll, the House⇄Yours switcher, and `?observer=<their npub>` weighting — is reused verbatim from sovereign. No custodial-specific explainer; no new components beyond the `gated` branch in the existing `PoVBar`.

4. **Fixture verification.** With `TRUST_PROVIDER=fixture`, the whole path is CI-testable with no Brainstorm round-trip: `authChallenge` returns the deterministic `fixture-challenge:<observer>`, the route signs it with a test session key (the route's `custodialSign`/follow-count deps are injected and mocked), `personalize` returns `true` and flips the observer to scored, and a subsequent `/status` read reports `hasScores: true`. The gate is tested by varying the mocked kind-3 count across the threshold. The ADR 0014 architecture guard stays green — the route touches only the neutral `TrustProvider` seam and never names Brainstorm specifics.

5. **Invariants honored.** No hand-rolled crypto (sign via the existing `custodialSign` → `useSessionKey` → `finalizeEvent`). No fake trust numbers ("building" is honest; "Yours" is the existing honest weighted-or-fallback). Provider seam reused (no Brainstorm specifics outside the adapter; the route is provider-neutral). npub-display / hex-internal. In-session-only, fail-closed (`reauth_required` when the wrap is gone). No new tooling, no new runtime dependency. The house-observer swap is explicitly NOT here (deferred, ADR 0014).

## Consequences

- **Enables** custodial (email) users to trigger their own GrapeRank personalization in-session, reaching full House↔Yours parity with sovereign. Fills the two open §2.6 acceptance lines.
- **Constrains:** custodial triggering now depends on a live ephemeral wrap (in-session only); a server restart forces re-login before a custodial user can personalize (same property as every custodial write, by design). The trigger does one extra kind-3 read for the gate.
- **Debt / follow-ups:** (a) a *unified* follow gate across both tiers (currently custodial-only) is deferred; (b) the house-observer swap (nosfabrica → a real Unbnd librarian observer) stays deferred per ADR 0014; (c) the challenge-event construction is now shared between web and server — if Brainstorm changes the expected kind/tags, both consumers update through the one builder.
- **Affects existing fixtures?** No DList fixtures. The `FixtureTrustProvider` already supports this flow (no change). Route-test deps gain a follow-count reader + the existing `custodialSign` shape (test-only wiring). The web `TrustStatus` union gains `gated`.
- **New dependency?** No. Uses existing `nostr-tools/pure` (`finalizeEvent`), the ADR 0006 ephemeral wrap, `fetchRawKind3` + `distinctFollowCount`, and the existing `TrustProvider` seam.
- **PRD section change required?** No. Implements phase2-prd §2.6 as written; does not touch §11.3.
- **Brand tokens / copy:** the only new UI string is the below-gate prompt ("Follow a few curators to personalize your view." — wording owned by the Implementer/Tester) in the existing `PoVBar`, using existing `PoVBar.css` tokens. No new hex literal, no new icon library. The string is reviewed against `memory/feedback_unbnd_copy_and_visual.md` (no em dashes, no slop).

## Implementation notes

Concrete files and boundaries for the Implementer.

### API — shared challenge builder (extract, don't duplicate)

- **File: `apps/api/src/trust/challenge-event.ts`** (new, or a small exported helper colocated with the route) — `buildPersonalizeChallengeTemplate(challenge: string, createdAt: number): NostrEventTemplate` returning exactly `{ kind: 27235, created_at: createdAt, tags: [["challenge", challenge], ["t", "brainstorm_login"]], content: "" }`. This is the **same** event the sovereign client builds in `useTrustView.ts` lines 102–108. Provider-neutral (it's a NIP-98-style auth template; the `"brainstorm_login"` `t`-tag value is the only Brainstorm-flavored string — verify against the guard's allowlist; if the guard flags `brainstorm_login`, keep the literal inside `brainstorm.ts` and have the provider expose the full template via `authChallenge`, or widen the guard for this token. The cleanest seam: `authChallenge` returns the challenge **string** as today and the kind/tags are the generic NIP-98 shape — confirm `brainstorm_login` is acceptable in neutral code; if not, move the tag construction behind the provider). Pure + unit-testable.

### API — follow-count gate

- **File: `apps/api/src/config.ts`** — add `PERSONALIZE_MIN_FOLLOWS` (default `10`), parsed like `PORT` (`Number`, must be a non-negative integer; throw on garbage), surfaced as `config.personalizeMinFollows`. Document the staging override (`=1`/`=2`) in the config comment.
- Reuse the kind-3 count: lift `distinctFollowCount` (`apps/api/src/routes/profile-stats.ts` line 41) into a shared module (e.g. `apps/api/src/profile/follow-count.ts`) so both the stats route and the trust route use the one counter; the trust route reads the user's freshest kind-3 via the same `query`/`fetchRawKind3` primitive (`{ kinds: [3], authors: [user.pubkeyHex], limit: 1 }`).

### API — routes (`apps/api/src/routes/trust.ts`)

- Extend `TrustRouteDeps` with the deps the custodial branch needs (DI, test-hermetic): `config` (for `personalizeMinFollows`), a `followCount(pubkeyHex) → Promise<number>` reader, and `custodialSign(sessionIdHex, template) → Promise<SignedNostrEvent | null>` (the same dep `index.ts` already builds for the other custodial writes). Resolve `sessionIdHex` from the cookie via `tokenToId` (mirror `profile-follow.ts` line 157).
- `GET /api/trust/status`: for custodial, replace `canPersonalize = user.tier !== "custodial"` with `canPersonalize = (await followCount(user.pubkeyHex)) >= config.personalizeMinFollows`. Sovereign unchanged.
- `GET /api/trust/challenge`: relax the `not_supported` guard — for custodial at/above the gate, proceed; below the gate, return the gated signal (`403 below_follow_gate`, or keep `not_supported` if the web never calls challenge for custodial — the custodial trigger does NOT need this endpoint since the server fetches the challenge itself; relaxing it is for symmetry/defense, the Tester decides whether the custodial web path hits it).
- `POST /api/trust/personalize`: tier-branch.
  - **sovereign** (unchanged): `{ event }` → `event.pubkey === user.pubkeyHex` check → `trust.personalize`.
  - **custodial**: `if ((await followCount(user.pubkeyHex)) < config.personalizeMinFollows)` → `403 below_follow_gate` (no sign, no personalize). Else `const challenge = await trust.authChallenge(user.pubkeyHex)` (`null` ⇒ `502 challenge_failed`); `const template = buildPersonalizeChallengeTemplate(challenge, Math.floor(Date.now()/1000))`; `const signed = await custodialSign(sessionIdHex, template)` (`null` ⇒ `401 reauth_required`, no personalize); `const ok = await trust.personalize(user.pubkeyHex, signed)` (`false` ⇒ `502 trigger_failed`); else `200 { ok: true, building: true }`.

### API — wiring (`apps/api/src/index.ts`)

- `buildTrustRouter({ sessionUser: resolveSessionUser, trust, config, custodialSign: userEventDeps.custodialSign, followCount: (hex) => /* freshest kind-3 → distinctFollowCount */ })`. The `followCount` reader uses the existing `queryEvents`/`fetchRawKind3` path (`config.profileRelays`), mirroring how `profile-stats` reads kind-3.

### Web

- **File: `apps/web/src/lib/api.ts`** — add `api.trust.personalizeCustodial()` → `POST /api/trust/personalize` with an empty body (`{}`), returning `{ ok: true; building: boolean }` (same response type as the sovereign `personalize`).
- **File: `apps/web/src/hooks/useTrustView.ts`** — (1) stop early-returning `house-only` for non-sovereign; compute `custodial = signed-in && user.email !== null` and let custodial run the same `api.trust.status()` resolution; (2) add a `gated` `TrustStatus` (custodial, `canPersonalize: false` → `gated`; today that maps to `house-only`); (3) `personalize()` branches: sovereign keeps the NIP-07 sign path; custodial calls `api.trust.personalizeCustodial()` (no `window.nostr`, no signing) then `setStatus("building")`. The `building` poll and `?observer` weighting are unchanged. `npub` already comes from the session for both tiers.
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
