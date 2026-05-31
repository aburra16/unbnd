# Story 26: Custodial personalization — the server-signed "Personalize" trigger

**Status:** Done
**Created:** 2026-05-31
**Type:** Feature

## Background

Today only **sovereign** (NIP-07) users can get the personalized "Yours" trust-weighted view. The Personalize trigger (ADR 0014, Phase B) is a four-step round-trip: `GET /api/trust/challenge` → the user **NIP-07-signs** a kind-27235 challenge with their own key → `POST /api/trust/personalize` → the server verifies + queues the user's own GrapeRank calc. That signing step needs the user's own private key, which a **custodial** (email-signup) user does not hold in the browser. The current trust route hard-rejects custodial users at both `/api/trust/challenge` and `/api/trust/personalize` with `not_supported` (`apps/api/src/routes/trust.ts` lines 53–54, 70–71), and `useTrustView` collapses every non-sovereign session to `house-only` (`apps/web/src/hooks/useTrustView.ts` line 60).

The prerequisites are now in place:

- **Custodial follow graph is DONE (Story 23, ADR 0023):** custodial users follow/unfollow via a **server-signed kind-3** using the session's ephemeral-wrapped key (`custodialSign` in `apps/api/src/index.ts`, wired through `buildProfileFollowRouter`). So a custodial user can already build the Web-of-Trust input GrapeRank needs.
- **The decision of record (ADR 0022 "option b" / phase2-prd §2.6):** the SERVER may sign the Brainstorm auth challenge with the session's ephemeral-wrapped custodial key. This is **not** a new sovereignty compromise — the custodial contract already has the server sign on the user's behalf for every write (ratings, tags, shelves, kind-0 Substack, kind-3 follows). It also removes the external dependency on Brainstorm whitelisting an Unbnd key (no admin/whitelist path needed).
- **The trust seam already exposes the trigger:** `TrustProvider.authChallenge(observerHex)` + `TrustProvider.personalize(observerHex, signedEvent)` (real `BrainstormProvider`; deterministic `FixtureTrustProvider` that returns a canned challenge and, on `personalize`, marks the observer scored). The House⇄Yours `PoVBar` + `useTrustView` already exist.

**PRD anchor:** phase2-prd **§2.6 "Custodial personalization (in-app follow graph)"**, specifically the two unfilled acceptance lines: *"Custodial users with a sufficient follow graph can trigger personalization in-session via NIP-98 signed by their key"* and *"Personalized view and the House↔Yours toggle work identically for custodial and sovereign users."* The follow-mechanism line of §2.6 is already shipped (Story 23). This story fills the trigger + parity lines. Does **not** touch PRD §11.3 out-of-scope (no payments, federation, social feed, email notifications).

The three architecture invariants are engaged the same way they already are for sovereign personalization: a custodial user's "Yours" view is `(events from anyone) × (that observer's GrapeRank)`, computed per-POV at read time — this story adds a second way to *trigger* that POV's calc, not a new stored aggregate.

## User-facing description

As a **Reader** (PRD §3) who signed up with email (a custodial Tier-2 account) and has followed some curators, I want to tap "Personalize" and have Unbnd build my own web of trust, so that my "Yours" view weights ratings by the people *I* trust — the same experience a Nostr-extension user already gets.

## Acceptance criteria

Testable from the outside, verifiable against the **`FixtureTrustProvider`** (no Brainstorm, no relays). "the server signs the challenge" means the route builds the kind-27235 challenge template and signs it with the session's ephemeral-wrapped key via the existing `custodialSign`/`useSessionKey` path — never hand-rolled crypto.

- [ ] **Custodial trigger, happy path.** Given a custodial session whose ephemeral key is live and whose follow count is at or above the gate threshold (see Open Question 1), when the client calls the personalize endpoint with no client-signed event, then the server fetches the challenge via `trust.authChallenge(observerHex)`, signs a kind-27235 challenge event with the session's wrapped key, calls `trust.personalize(observerHex, signedEvent)`, and responds `200 { ok: true, building: true }`. Against the fixture provider, the observer is now `hasScores: true`.
- [ ] **Custodial status reports eligibility.** Given a custodial session with trust enabled, when the client calls `GET /api/trust/status`, then the response reports the custodial user as able to personalize once their follow count meets the gate (`canPersonalize` true at/above the threshold, false below — or per the Open-Question-1 resolution), and `hasScores` reflects whether their calc has landed. (Today this endpoint returns `canPersonalize: false` for every custodial user.)
- [ ] **Reauth-required when the key is gone.** Given a custodial session whose ephemeral-wrapped key is absent (server restarted / session evicted — the wrap fails closed by design), when the client triggers personalize, then the server responds `401 reauth_required` and does **not** call `trust.personalize`. (Mirrors the custodial write paths: `apps/api/src/routes/profile-follow.ts` lines 159–167.)
- [ ] **Follow-count gate before the prompt.** Given a custodial user below the follow-count gate, when they view the `PoVBar`, then the "Personalize" affordance is not offered and an honest prompt explains what unlocks it (e.g. "Follow a few curators to personalize your view."); given a custodial user at/above the gate with no scores yet, the "Personalize" affordance is offered. (Threshold value: Open Question 1.)
- [ ] **Personalize-flow parity in the UI.** Given a custodial user at/above the gate, when they tap "Personalize", then the same in-session trigger fires (no NIP-07 prompt — the server signs), the `PoVBar` moves to the honest in-between "building" state (Open Question 2), and when scores land the House⇄Yours switcher appears and "Yours" weights their ratings **identically** to a sovereign user (same `?observer=<their npub>` weighting path, ADR 0014). No fabricated trust numbers — "Yours" shows honest weighted-or-fallback.
- [ ] **Sovereign path unchanged.** Given a sovereign session, when they personalize, then the existing NIP-07 client-signed flow is used exactly as today (the server does **not** server-sign for sovereign users); all current sovereign trust tests still pass.
- [ ] **Architecture guard stays green.** No Brainstorm/NIP-85 specifics (`/setup/`, `/authChallenge`, `/user/graperank`, `graperankResult`, kind `30382`) leak outside `apps/api/src/trust/brainstorm.ts`; the custodial trigger goes through the neutral `TrustProvider` seam only.
- [ ] **Fixture-verifiable end to end.** With `TRUST_PROVIDER=fixture`, the custodial trigger → status → House⇄Yours flow is exercised in CI with no Brainstorm round-trip: `authChallenge` returns the deterministic challenge, the server signs it with a test session key, `personalize` returns true and flips the observer to scored, and a subsequent status read reports `hasScores: true`.

## DList shapes touched

None. This story signs a **kind-27235** NIP-98-style auth challenge (an ephemeral, non-stored authentication event consumed by the trust provider), not a DList record. No new `kind:39998`/`kind:39999` header or item, no kind-0/kind-3 write. The kind-3 follow graph it depends on was delivered by Story 23.

## Out of scope

State explicitly — do not build:

- **The house-observer swap.** The active house observer stays **nosfabrica** (ADR 0014). Swapping it to a real Unbnd librarian observer is DEFERRED to a future phase.
- **Sovereign personalization.** Already shipped (ADR 0014 Phase B). This story does not change the sovereign NIP-07 trigger except to confirm it still works.
- **The follow mechanism.** Done (Story 23 / ADR 0023). This story consumes the kind-3 graph; it does not add follow buttons, a following list, or followers-count.
- **Admin / whitelist triggering of OTHER pubkeys.** ADR 0022 option b is chosen precisely so we never need the Brainstorm admin/whitelist path. Triggering a GrapeRank calc for any pubkey other than the session user's own is out of scope.
- **Trust-weighted search ranking / homepage trust shelves (Block D).** Separate phase-2 stories (phase2-prd §2.9), depend on the house-observer swap.
- PRD §11.3 Phase-2+ items this does not touch: payments, Blossom, ebook sales, federation, email notifications, social feed.

## Recommendations (PO)

These are recommendations for the Architect/user to confirm; they live in the Open Questions below as the decisions to lock.

1. **Follow-count gate — recommend gating at a threshold, default ~10.** The PRD's POV-first language (CLAUDE.md §1; PRD §9.5 "ten follows") already names ten follows as the sovereign personalization bar, and §2.6 says the prompt appears "once a custodial user has enough follows for a non-trivial graph." A custodial user with zero or one follow would trigger an expensive GrapeRank calc that produces a near-empty, useless "Yours" view — a bad first impression and wasted compute. **Recommendation: gate the prompt at the same ~10-follow bar already established for sovereign in §9.5, sourced from the user's own kind-3 `p`-tag count (the same honest count Story 23 surfaces as `followingCount`).** Apply the gate to custodial *and* (newly, for consistency) sovereign, or custodial-only — see Open Question 1.

2. **Post-trigger UX — recommend honest in-between states, identical to sovereign.** GrapeRank is not instant (the sovereign flow already tells users "~5–6 min"). **Recommendation: reuse the existing `PoVBar` "building your web of trust / this takes a few minutes" state and the `useTrustView` poll** (`hasScores` polling, then "Yours" lights up when scores land). Do not fabricate a score or pretend "Yours" is ready before it is. The custodial flow should be indistinguishable from sovereign once triggered — same "building" copy, same poll, same House⇄Yours switch on completion. See Open Question 2.

## Open questions

1. **Follow-count gate threshold (and who it applies to).** Recommend **≥10 follows** (matching PRD §9.5), counted from the user's own kind-3. Confirm: (a) the exact threshold (10? a different N? configurable?); (b) whether the gate applies to **custodial only** or is unified across custodial **and** sovereign (today sovereign can Personalize with any follow count — unifying would be a small behavior change to the sovereign path, which AC "Sovereign path unchanged" currently forbids). PO leans: gate custodial at 10; leave sovereign as-is to honor "sovereign path unchanged," and revisit a unified gate as a follow-up.

2. **Post-trigger UX states.** Recommend reusing the existing sovereign "building (~few minutes) → poll → Yours lights up" states verbatim. Confirm whether that is sufficient, or whether the custodial first-run wants an extra one-time explainer (e.g. a short line that this is *their* personalized view, computed from who they follow). PO leans: reuse the existing states unchanged; no extra custodial-only copy beyond the gate prompt.

3. **Endpoint shape — extend `/api/trust/personalize` with a custodial server-sign branch, or add a sibling.** PO leans **extend the existing route** by tier-branching exactly as the substack/shelves/follow routes do (sovereign sends `{ event }`; custodial sends an empty/no-event body and the server signs), so the seam, the tests, and the `PoVBar`/`useTrustView` wiring stay singular. The Architect owns the final shape; flagging it so the decision is explicit rather than assumed. Note: the custodial branch must also relax the `not_supported` guard in `GET /api/trust/challenge` **and** `GET /api/trust/status` for custodial users at/above the gate.

4. **Gate enforcement location for the trigger itself (defense in depth).** Should the *server* re-check the follow-count gate before signing/triggering (not just the UI), to avoid a wasted calc from a hand-crafted request? PO leans yes — the UI hides the prompt, and the endpoint enforces the same threshold (read the session user's kind-3 count server-side) so the gate is honest end to end. Confirm.

## Linked artifacts
- ADR: `engineering-team/decisions/0026-custodial-personalization.md`
- Test plan: `engineering-team/stories/26-custodial-personalization.test-plan.md`
- Review: (filled in after Review phase)
