# ADR 0014: GrapeRank trust-weighting ("Personalize")

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/14-graperank-personalize.md`

## Context

Deliver the "weighted by people you trust" pillar by weighting **ratings** with GrapeRank trust scores (NIP-85 kind-30382) and lighting up the `PoVBar` "Personalize" control. Contracts verified live against the deployed nosfabrica stack (not just the repo):

- **Resolve observer → score source (public, no auth):** `GET {BRAINSTORM_API}/setup/{observerHex}` returns NIP-85 provider tuples, incl. `["30382:rank", <serviceKeyHex>, <relayHint>]`. The service key is the **author** of that observer's 30382s.
- **Read scores:** query the nip85 relay(s) for `kinds:[30382], authors:[serviceKey], "#d":[targetHex…]`; `rank` (0–100) ÷ 100 = trust weight ∈ [0.02,1]. Absent → weight 0.
- **Union both relays** (`wss://nip85.nosfabrica.com`, `wss://nip85.brainstorm.world`) — verified nosfabrica's scores live on the former, other observers on the latter.
- **House observer = nosfabrica** (`be7bf5de…09420d0a`, 94,807-pubkey set). It does **not** trust our seeded librarian (weight 0) → only ratings are weighted, tag/genre consensus stays raw.
- **In-app self-serve trigger (confirmed live, no whitelist):** `GET /authChallenge/{userPk}` → user signs a kind-27235 with their own NIP-07 key → `POST /authChallenge/{userPk}/verify` → JWT → `POST /user/graperank` (Bearer) queues their own calc (`status:"waiting"`); poll `GET /user/graperankResult` / `/user/{pk}/overview` (`influence`) or watch the relay for their first 30382. The admin trigger (`POST /admin/.../trigger_graperank`, NIP-98 + whitelist) is only needed for triggering *other* pubkeys (e.g. custodial) — deferred.

## Decision

### Trust module (`apps/api/src/trust/`, provider seam)
- `TrustProvider` interface (neutral): `weights(observerHex, targetHexes[]) → Promise<Map<hex, number>>` (0–1), `resolveProfileRelays?` etc.
- `BrainstormProvider` — the ONLY Brainstorm/nip85-aware file: `/setup/{observer}` → service key (+ relay hints), then `queryRelayUrl` each configured relay (union), parse `rank`/100. Caches the service-key lookup and the per-(observer) weight map with a short TTL. Raw HTTP + the existing WS read; no SDK.
- `resolveTrustProvider(config)` factory. **Architecture guard** test (repo-wide, like search) fails CI if `brainstorm`/`nip85`/`30382`/`/setup/` specifics appear outside `trust/brainstorm.ts`.
- Config: `BRAINSTORM_API_URL` (default `https://brainstormserver.nosfabrica.com`), `TRUST_RELAYS` (default both nip85 relays), `HOUSE_OBSERVER_PUBKEY` (default nosfabrica hex). Unset/blank → trust disabled (fail-safe; raw everywhere).

### Weighting (ratings only)
- `GET /api/books/:slug/ratings` gains an optional `?observer=<npub|hex>`:
  - Always returns the **raw** summary (count, average, ratings) as today.
  - When trust is enabled, also returns a **weighted** view for the resolved observer: `weightedAverage = Σ(wᵢ·scoreᵢ)/Σ(wᵢ)` over raters with `wᵢ>0`; `trustedCount = #{wᵢ>0}`; reviews ordered by `wᵢ` desc. `Σw==0` → `weighted: null` (honest "no ratings from this view yet").
  - **Default observer (no param) = `HOUSE_OBSERVER_PUBKEY`** (nosfabrica). Sovereign "Yours" passes their own pubkey. Min-rater guard: weighted shown only with ≥1 positive-weight rater.
- Weighting is **server-side** (the API holds rater hex pubkeys; avoids exposing them + N relay calls from the browser).

### Web (`PoVBar` + BookDetail ratings)
- Default (everyone): **house** (nosfabrica-weighted) ratings + reviews; PoVBar shows "Unbnd house view".
- **Sovereign** users: PoVBar offers **House ⇄ Yours**. "Yours" requests `?observer=<my npub>`. If they have no scores yet, PoVBar shows **Personalize** → the **in-app self-serve trigger** (Phase B): NIP-07 signs the Brainstorm auth challenge → our API verifies + `POST /user/graperank` → "building (~5–6 min)" → poll until scores land → "Yours" turns on. No redirect, no whitelist.
- Genre/tag chips + the catalog are **unchanged** (raw). No fake numbers — weighted figures labelled; raw remains the substrate.

### Phases
- **A (this story):** the trust module + provider + guard + `?observer=` weighting + house default + sovereign toggle + Personalize redirect. Verifiable live with a real sovereign npub that has scores.
- **B (next, no external dependency):** in-app **self-serve** trigger (NIP-98 self-auth → `POST /user/graperank`) + "building" poll state. (Custodial triggers — needing the admin/whitelist path — and a real librarian house observer remain deferred.)

## Options considered
- **House = nosfabrica (chosen)** vs raw default — operator chose a real trust vantage as default; ratings-only weighting keeps the seeded catalog intact.
- **Weight ratings only (chosen)** vs also tags — tags are single-author librarian seed (nosfabrica-weight 0); weighting would empty genres for no signal gain yet.
- **Server-side weighting (chosen)** vs client — keeps rater hexes private, one place to cache, provider isolated.
- **Public `/setup` read path (chosen)** vs the admin API — reads need no auth; only triggering does (deferred to a UI redirect).

## Consequences
- Sovereign readers get a real trust-weighted rating view; the default is nosfabrica-curated. Books with no trusted ratings honestly show none in a weighted view (raw still available to the toggle/Yours-less states as the substrate).
- New outbound dependency on the Brainstorm API + nip85 relays (best-effort; failure → raw). New config. No schema/migration. Adapter-isolated; the provider is swappable.
- Index/tag weighting, custodial personalization, in-app trigger, real librarian house — all deferred.

## Out of scope
Tag/genre trust-weighting; the sensitive-tag (accusatory) **role** gate; trust-weighted search ranking; homepage trust shelves; in-app Brainstorm trigger; custodial follow-graph onboarding.

## Implementation notes (staged sub-PRs)
1. **trust module** — `trust/types.ts` (neutral) + `TrustProvider` + `BrainstormProvider` (raw HTTP `/setup` + WS relay union, cache) + `resolveTrustProvider` + config + repo-wide **architecture guard** + unit tests (mock fetch/relay: setup→serviceKey, rank→weight, union, absent→0, disabled→empty).
2. **ratings weighting** — `?observer=` on the ratings route → raw + weighted (weighted avg, trustedCount, ordered reviews); tests (mock provider).
3. **web** — `PoVBar` wired to session/scores; BookDetail requests house by default, Yours on toggle; Personalize → brainstorm.nosfabrica.com; RatingsBlock/ReviewsList render the weighted view + labels; smoke/component tests.
Then verify live on staging with a real sovereign npub that has scores (house vs yours differ); confirm degrade-to-raw when trust is disabled.
