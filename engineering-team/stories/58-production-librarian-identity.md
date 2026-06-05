# Story 58: Production librarian identity (adopt + secure) and the house-observer swap enablers

**Status:** In progress
**Created:** 2026-06-05
**Type:** Feature / Ops

## Background

This is the keystone for Lane 2 (PRD §2.0, §2.1). Every trust-consuming feature reads GrapeRank from the *house point of view*, and the hard ordering rule is that **the house-observer swap precedes every trust-consuming feature** (PRD §2.0). The active house observer today is the interim nosfabrica pubkey (`HOUSE_OBSERVER_PUBKEY` default `be7bf5de…09420d0a`), a large borrowed Web of Trust used so the trust display could be built. The remaining work is to stand up Unbnd's **own** librarian identity and move the house trust graph onto it.

The trust-weighting machinery is already built and is not in scope to change. A survey established the exact gap, which this story treats as ground truth:

- **§2.5 is already built and CI-verified** against the fixture provider: trust-weighted tag/genre consensus (`apps/api/src/tags/aggregate.ts` `aggregateBookTagsWeighted`) and the "community vs trusted" labeling (`RatingsPanel` / `GenrePill`). The **only** unmet §2.5 acceptance criterion is *"Active house observer is the production librarian pubkey."* That criterion is unblocked purely by a config swap — the swap this story enables.
- The seams already exist: the `TrustProvider` adapter (`apps/api/src/trust/`, guarded by the CI architecture test), the `BrainstormProvider` (NIP-85: `/setup`, kind-30382 read, `/authChallenge`→`/verify`→`/user/graperank`) in `@unbnd/trust` (`packages/trust`), the `FixtureTrustProvider`, the staging seed harness (`ops/trust-seed-harness.md`), and `HOUSE_OBSERVER_PUBKEY` config (read across `apps/api`, `apps/shelves`).
- **What is missing is the librarian's real identity plus the swap.** There is a user kind-0 publisher (`apps/api/src/profile/`) and a user kind-3 follow publisher (`apps/api/src/routes/profile-follow.ts` + `apps/api/src/profile/follow-template.ts`) — but **no librarian kind-0 and no librarian kind-3 publisher**. `LIBRARIAN_NSEC` is deliberately held **off** the API (workers only — seeder/promoter), enforced by the ADR-0031 architecture test (`apps/api/test/security/no-librarian-nsec-in-api.test.ts`).

**Decision of record (PRD §2.1):** the existing staging librarian key is unmanaged, not compromised, so we **adopt it as the production identity**. We do **not** generate a new key and we do **not** re-sign the catalog. A new pubkey would change every `kind:pubkey:dtag` address and orphan every `#a` and z-tag cross-reference; adoption avoids that migration entirely.

**The activation reality (by design, not a regression):** swapping from nosfabrica (a large borrowed WoT) to the librarian (following a small seed set) makes the trusted-consensus view start sparse, so most book-detail signals fall to the **raw fallback labeled "community consensus"** until the seed graph and real ratings grow. This is exactly the PRD §2.5 raw-fallback-labeled decision of record. Unbnd's own curators are the correct trust source; a thin starting graph is the honest starting state, not a defect.

This story builds the **engineering mechanisms** so the operator can stand up the production librarian and perform the swap. It does not choose the seed curators, store the secret, or execute the live swap — those are operator actions (see Out of scope).

## User-facing description

There is no end-user-facing screen change in this story. The user-visible effect is downstream and by design: once the operator performs the swap, book-detail tag/genre signals begin reflecting Unbnd's own house point of view, starting mostly as labeled "community consensus" and shifting toward "trusted consensus" as the seed graph and ratings grow (PRD §2.5).

As the **operator**, I want the engineering mechanisms to (1) publish the librarian's identity (kind-0 profile + kind-3 seed-follow list) and register it for GrapeRank, (2) manage the librarian secret safely, and (3) swap and verify the house observer — so that I can move the house trust graph onto Unbnd's own librarian (PRD §2.1) and thereby satisfy §2.5's last unmet criterion.

## The four deliverables

1. **Librarian kind-3 seed-follow publisher + GrapeRank trigger (the core enabler).** A worker that builds a kind-3 contact list from **a configurable set of seed-curator pubkeys** (env, e.g. `SEED_CURATORS`), signs it with `LIBRARIAN_NSEC`, and publishes it to the trust relays (the nip85 / `TRUST_RELAYS` set — note dcosl rejects kind-3) plus sensible general relays; then triggers Brainstorm GrapeRank for the librarian observer (the `/authChallenge`→sign kind-27235→`/verify`→`/user/graperank` flow, signed by the librarian, reusing the `@unbnd/trust` `BrainstormProvider` logic). It is idempotent / re-runnable, merging into any existing kind-3 the way `follow-template.ts` does (no follows dropped on re-run).

2. **Librarian kind-0 profile publisher.** A worker that builds the librarian's kind-0 (display name, avatar/logo, role description — all from config), signs it with `LIBRARIAN_NSEC`, and publishes it to dcosl plus the profile relays. It verifies the event lands and is resolvable.

3. **Secret-management runbook.** Move `LIBRARIAN_NSEC` from a bare `.env` value to **encrypted at rest** with a documented backup/rotation procedure and a confirmed **offline redundant copy held out of band** (the PRD §2.1 "initial target"; KMS/Vault is explicitly deferred). Engineering provides the runbook and any minimal mechanism; the operator executes it.

4. **House-observer-swap + verify runbook.** The operator procedure to set `HOUSE_OBSERVER_PUBKEY` → the librarian and verify the weighted-vs-raw divergence via the existing seed harness — including the **sequencing**: publish the kind-3 and register GrapeRank for the librarian *before* the swap, otherwise every trust read falls to raw fallback prematurely.

## Reuse (call out so the Architect and Implementer do not reinvent)

- **Story-57 resilient relay client** (`apps/seeder/src/resilient-relay.ts` / `apps/seeder/src/publish.ts`) — for the workers' relay publishing (auto-reconnect + bounded retry).
- **`apps/api/src/profile/follow-template.ts`** — for the kind-3 merge-preserving logic (mirror, do not move it onto a worker in a way that puts `LIBRARIAN_NSEC` near the API).
- **`@unbnd/trust` `BrainstormProvider`** (`packages/trust`) — for the GrapeRank trigger (authChallenge→verify→graperank), reused or mirrored worker-side.
- **The seeder/promoter profile-gated worker pattern** — a compose `profiles:[…]`-gated worker that holds `LIBRARIAN_NSEC` and never runs with the normal stack; this is how the new publisher(s) stay off the API.
- The user kind-0 publisher (`apps/api/src/profile/bootstrap-kind0.ts`, `kind0.ts`, `validate-kind0.ts`) and the user kind-3 publisher (`apps/api/src/routes/profile-follow.ts`) exist as **patterns to mirror**, not paths to extend (they live on the API; the librarian publishers must not).

## Acceptance criteria

Testable from the outside. The real test surface is the **pure builders** (kind-3 contact-list builder, kind-0 profile builder) plus the GrapeRank-trigger flow (mocked), all deterministic with no real network; the publisher placement, relay routing, secret hygiene, and config swap are operator-observable and/or guard-enforced.

**Librarian kind-3 seed-follow builder + publisher (deliverable 1)**
- [ ] Given a configured set of seed-curator pubkeys (e.g. `SEED_CURATORS`), when the kind-3 builder runs, then it produces a valid kind-3 contact list with **exactly one `p` tag per configured seed curator** (deterministic, no I/O), unit-tested over a fixture seed set.
- [ ] Given an existing librarian kind-3 already on the relays, when the builder runs again, then the result is **merge-preserving**: previously-followed pubkeys are retained and the configured seed set is unioned in (mirroring `follow-template.ts`), so a re-run drops no follows and the publisher is idempotent.
- [ ] Given the signed kind-3, when published, then it is sent to the **trust relays** (the nip85 / `TRUST_RELAYS` set) plus the configured general relays, and **not** to dcosl (dcosl rejects kind-3). Relay routing is asserted in tests.

**GrapeRank trigger (deliverable 1)**
- [ ] Given the librarian kind-3 is published, when the GrapeRank trigger runs, then it performs the `/authChallenge`→sign kind-27235→`/verify`→`/user/graperank` sequence **signed by the librarian** (reusing `@unbnd/trust` `BrainstormProvider` logic), verified via mocked Brainstorm endpoints in tests (no live network in CI).
- [ ] Given the GrapeRank trigger, when the NIP-98 / kind-27235 challenge is signed, then it is signed via the **existing librarian signing path** (`finalizeEvent` / applesauce-or-nostr-tools) — no hand-rolled crypto.

**Librarian kind-0 profile builder + publisher (deliverable 2)**
- [ ] Given librarian profile fields from config (display name, avatar/logo, role description), when the kind-0 builder runs, then it produces a **valid kind-0 profile event** (deterministic, no I/O), unit-tested over fixture config.
- [ ] Given the signed kind-0, when published, then it is sent to **dcosl + the profile relays**, and the worker verifies the event lands / is resolvable. Relay routing is asserted in tests.

**Worker placement + secret hygiene (deliverables 1 & 2)**
- [ ] Given the new publisher(s), when deployed, then they are **profile-gated workers** that read `LIBRARIAN_NSEC` and **do not run with the normal stack** (mirroring the seeder/promoter pattern).
- [ ] Given the change, when the ADR-0031 architecture guard runs (`apps/api/test/security/no-librarian-nsec-in-api.test.ts`), then it stays **green**: the string `LIBRARIAN_NSEC` appears **nowhere under `apps/api/src`**. The guard is not weakened.

**Secret management + swap runbooks (deliverables 3 & 4)**
- [ ] Given the secret-management runbook, when read, then it documents moving `LIBRARIAN_NSEC` to **encrypted-at-rest** storage with a **backup/rotation procedure** and a confirmed **offline redundant copy held out of band**, and it is accurate against the actual mechanism provided.
- [ ] Given the house-observer-swap + verify runbook, when read, then it documents the operator procedure to set `HOUSE_OBSERVER_PUBKEY` → the librarian and to verify the weighted-vs-raw divergence via the existing seed harness (`ops/trust-seed-harness.md`), including the required **sequencing** (publish kind-3 + register GrapeRank **before** the swap).

**The swap is config-only (deliverable 4)**
- [ ] Given the librarian pubkey, when set as `HOUSE_OBSERVER_PUBKEY`, then the trust reads use the **librarian vantage with no code change** (config only), verifiable via the seed harness producing a reproducible weighted-vs-raw divergence from the librarian PoV.

**No-slop / invariants**
- [ ] Given the change, when CI runs, then there are **unit tests for the pure builders** (kind-3 contact list, kind-0 profile) **and the GrapeRank-trigger flow** (mocked), and `pnpm -r typecheck` / `pnpm -r test` / the relevant builds are **green**.
- [ ] Given the change, when reviewed, then there is **no change to the already-built trust machinery** (`aggregateBookTagsWeighted`, the labeling, the `TrustProvider` adapter, the fixture provider) and **no change to the web app**; all runbook copy honors the quality bar (no AI-slop, no shortcuts/debt).

## DList shapes touched

- **`kind:0`** — librarian profile metadata (NEW publisher; display name / avatar / role description from config; published to dcosl + profile relays).
- **`kind:3`** — librarian contact list / seed-follow graph (NEW publisher; one `p` tag per configured seed curator, merge-preserving; published to the trust / nip85 relays, not dcosl).
- **`kind:27235`** — NIP-98 GrapeRank auth challenge, signed transiently by the librarian for the `/verify` step (not persisted to relays).
- **`kind:30382`** — Brainstorm trust attestation, **read** during the GrapeRank flow (unchanged; no write).
- **`kind:39999`** — librarian-signed BookRecords already on dcosl: **not re-signed, not touched** (the adopt decision keeps every address canonical).

No new DList shape or tag is introduced by this story.

## Out of scope

- **Choosing the actual seed curators.** Membership is a business/community decision configured **out of band** (the two-document firewall). This story never names a real curator and never embeds a pubkey list in the repo.
- **The actual secret storage + offline copy.** Engineering provides the runbook and any minimal mechanism; the operator performs the encryption and holds the offline copy.
- **Executing the live swap.** Setting the production `HOUSE_OBSERVER_PUBKEY` and running the verify is the operator's action; this story ships the procedure and the enablers.
- **Generating a new key or re-signing the catalog.** Explicitly rejected by the §2.1 adopt decision (a new pubkey orphans every address).
- **Changing the trust-weighting machinery (§2.5).** `aggregateBookTagsWeighted`, the community-vs-trusted labeling, the `TrustProvider` adapter, and the fixture provider are already built and CI-verified; this story does not touch them.
- **Automatic threshold promotion** of the seed graph, and **KMS/Vault** secret management — both explicitly deferred (PRD §2.1).
- **No web / UI / API behavioral change.** The publishers are off-API workers; the only API-adjacent effect is reading from the new house vantage once the operator flips `HOUSE_OBSERVER_PUBKEY`.

## Open questions

For the Architect to resolve during the Architecture phase (the PO does not answer these):

1. **Worker placement.** A new `apps/librarian`-style worker, vs extending an existing profile-gated worker (seeder/promoter), vs two separate workers (kind-3+trigger and kind-0). Whatever the choice, `LIBRARIAN_NSEC` must stay off the API and the publishers must be compose-profile-gated.
2. **Exact config keys.** The seed-curator set env (e.g. `SEED_CURATORS`), the librarian profile fields (display name / avatar / role description), and the target relay sets (trust/nip85 relays for kind-3, dcosl + profile relays for kind-0) — names, formats, and defaults.
3. **The precise GrapeRank-trigger sequence + worker-side signing.** How the librarian signs the NIP-98 / kind-27235 challenge inside a worker: reuse the `@unbnd/trust` `BrainstormProvider` directly, or a thin worker-side call that mirrors it. Pin the exact `/authChallenge`→`/verify`→`/user/graperank` ordering.
4. **`HOUSE_OBSERVER_PUBKEY` default.** Whether the repo default flips to the librarian pubkey, or stays nosfabrica with the operator overriding via env at swap time (and how that interacts with the swap-runbook sequencing).
5. **GrapeRank crawler reachability.** Which relays the librarian kind-3 must land on for Brainstorm's GrapeRank crawler to pick it up (the nip85 / `TRUST_RELAYS` set vs additional relays), so the trigger actually produces scores from the librarian vantage.

## Linked artifacts

- PRD: §2.0 (sequencing / trust-data decoupling), **§2.1 (production librarian identity — adopt + secure, the keystone)**, §2.5 (house-observer swap + trust-weighted consensus — its last unmet criterion is what this unblocks).
- Reuses: Story 57 / ADR 0056 (resilient relay client), Story 23 / ADR-0031 era kind-3 follow path (`follow-template.ts`, the ADR-0031 `LIBRARIAN_NSEC`-off-API guard), the fixture provider + seed harness (ADR 0017, `ops/trust-seed-harness.md`).
- ADR: `engineering-team/decisions/0057-production-librarian-identity.md` (Architect to write).
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
