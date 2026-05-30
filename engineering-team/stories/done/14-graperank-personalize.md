# Story 14: GrapeRank trust-weighting ("Personalize")

**Status:** Approved
**Created:** 2026-05-29
**Type:** Feature (the core "weighted by people you trust" pillar)

## Background

Ratings and tag consensus are shown as **raw counts** today (honest, but un-weighted). GrapeRank gives each reader a personal Web-of-Trust score over other pubkeys; weighting our consensus by it delivers the product's core promise and lights up the inert **"Personalize"** control in the `PoVBar`.

Trust scores are **NIP-85 kind-30382** events on the Brainstorm nip85 relay. Per the research (see ADR 0014):
- A 30382's `rank` (0–100) ÷ 100 is the trust weight of its `d`-tag target, **from one observer's vantage**.
- Events are authored by a **per-observer Brainstorm service key**, resolved via the Brainstorm API (`GET /brainstormPubkey/{observer}`).
- Scores require the observer's **kind-3 follow graph**; a fresh npub with no follows yields nothing.

## Decisions (locked with operator, after live verification)

- **House observer = nosfabrica** (`npub1health…` = hex `be7bf5de…09420d0a`); verified 94,807-pubkey trust set. The **house (nosfabrica-weighted) view is the default** for signed-out + custodial. Eventually the house becomes a real librarian (deferred).
- **v1 weights RATINGS + review ordering only.** Genre/tag consensus stays **raw** — it is almost entirely librarian-seeded and nosfabrica gives our (throwaway) librarian weight 0, so weighting it would empty the genres. Tag-weighting + the sensitive-tag role gate come later, once community tagging has mass.
- **Sovereign toggle:** House ⇄ Yours. Custodial = house only (no follow graph).
- **Reads are fully public** (verified): `GET {brainstormApi}/setup/{observer}` → the `30382:rank` service key + relay hint; then query the nip85 relay(s) for `kinds:[30382], authors:[serviceKey], #d:[targets]`. **Union both relays** (`nip85.nosfabrica.com` + `nip85.brainstorm.world`) — different observers' data lives on different relays.
- **Phase B trigger = redirect to brainstorm.nosfabrica.com** (no public trigger endpoint deployed; only admin/NIP-98+whitelist). In-app admin triggering deferred (would need an Unbnd key whitelisted).
- **Provider seam:** a swappable `TrustProvider` (Brainstorm adapter is the only Brainstorm-aware file; guard-enforced like `@unbnd/search`).

## User-facing description

As a **sovereign** reader, I want to switch a book's ratings and genre/style consensus from the Unbnd house view (raw counts) to **my perspective** — weighted by the readers my Web of Trust vouches for — so the numbers reflect people I actually trust. If I don't have a trust profile yet, "Personalize" computes one (a few minutes), then my view turns on.

## Acceptance criteria

- [ ] AC-1: A `TrustProvider` resolves, for an observer pubkey + a set of target pubkeys, a weight ∈ [0,1] per target (from kind-30382 `rank`/100), via the Brainstorm service-key → nip85 relay path. Targets with no score → weight 0. Provider-swappable; backend specifics isolated (guard like search).
- [ ] AC-2: With a sovereign session that **has** scores, a book's **ratings summary** and **tag consensus** can be shown **trust-weighted** (weighted average / weighted applies-disputes) in addition to the raw house view. Reviews can be ordered by reviewer trust.
- [ ] AC-3: The `PoVBar` reflects state: signed-out/custodial → **house (raw)**, no toggle; sovereign with scores → **House ⇄ Yours** toggle; sovereign without scores → **Personalize** action.
- [ ] AC-4 (Phase B): "Personalize" with no scores triggers a Brainstorm calculation for the user's npub, shows a **building** state, and flips to the personalized toggle once scores land (poll/relay-watch). Honest messaging about the wait.
- [ ] AC-5: **No fake trust numbers** anywhere — weighting only applies when real scores exist; otherwise raw counts. Weighted figures are clearly labelled "your perspective". Custodial/signed-out unaffected.
- [ ] AC-6: Resilient — Brainstorm API / relay unavailable degrades to the raw house view, never an error wall.
- [ ] AC-7: Verified live on staging with a real sovereign npub that has a follow graph: toggle changes the numbers in a way that reflects trust; a no-score npub can trigger a calc and eventually personalize.

## Open questions (for the ADR)

1. **Relay host** — `wss://nip85.nosfabrica.com` (deployed config) vs `wss://nip85.brainstorm.world` (operator-stated). Confirm / treat as alias.
2. **Service-key resolution + caching** — `GET /brainstormPubkey/{O}` returns the signing key; cache it (per user) and the resulting weights (TTL) to avoid hammering the API/relay.
3. **Trigger auth** — public `GET /brainstormPubkey` (auto-trigger) vs admin `POST /trigger_graperank` (NIP-98 JWT, whitelisted). Pick the path; if admin, the librarian/an Unbnd key must be whitelisted.
4. **Weighting math** — weighted average for ratings; weighted applies/disputes for tags; how to present (alongside raw, or toggle-replace). Minimum-weight / minimum-rater thresholds to avoid a single high-trust voice dominating.
5. **Build-completion signal** — poll `/admin/brainstormRequest/{id}` vs watch the nip85 relay for the observer's first 30382. Latency (~5–6 min) unconfirmed in source.
6. **Graph sync** — does triggering for npub O also ensure O's follow graph is ingested into Brainstorm's Neo4j, or must O already be "in the network"? Affects obscure npubs.

## Out of scope / carry-forward

- **Custodial personalization** (needs a follow-graph mechanism) — deferred.
- **House observer** / trust-weighted default view — deferred (house stays raw).
- **Sensitive-tag (accusatory) gate** — still hidden; the trust+**role** gate is a separate concern (GrapeRank is half of it; role assertions are the other half).
- **Trust-weighted search ranking**, trust shelves on the homepage, follow management — later.

## Linked artifacts
- ADR: `engineering-team/decisions/0014-graperank-personalize.md`
- Research: nosfabrica org (brainstorm_server, brainstorm_graperank_algorithm, NIP-85 spec).
