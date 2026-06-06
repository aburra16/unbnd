# ADR 0066: Curator status by trusted-user vouching — the `curator-roles` concept

**Status:** Accepted
**Date:** 2026-06-06
**Story:** `engineering-team/stories/67-curator-role-vouching.md`

## Context

Story #67 introduces the trust-graph growth mechanism: trusted users vouch for curators, and a count-gate of distinct trusted asserters confers curator status (PRD §6 Curator Role Assertion, §7 lifecycle, §5.1 badge). This is the first new DList concept of Phase 3.

The codebase already has the exact pattern, twice over: **`author-verified`** is a curator-signed, pubkey-targeted (`#p`), apply/dispute, per-(asserter, subject) replaceable assertion (`AuthorVerifiedAssertion`, concept header `author-verified`), resolved by a **count-gate** (`apps/api/src/author-verified/verify.ts` `computeVerification`: ≥ N distinct curators, each weight ≥ floor from the house vantage, self-excluded, latest-apply, one batched `weights` call, honest degrade). And the existing **curator gate** (`canPromote`) resolves a pubkey's own house-weight ≥ `CURATOR_THRESHOLD` (`submissions.ts` `houseWeightOf`). Curator-role vouching is `computeVerification` with the target being a *candidate curator* rather than a *claimed author*, and the badge ORs in the seed allowlist and the emergent gate.

Decisions of record from the story (PO-approved): the asserter count `N` and weight floor `W` are configurable; curator status = **seed allowlist OR vouched-count-gate OR emergent house-weight gate**.

## Options considered

### Option A — Clone the author-verified machinery into a `curator-roles` concept (chosen)
New `CuratorRoleAssertion` schema (kind-39999, `#p`-targets the subject pubkey, apply/dispute polarity, per-(asserter, subject) replaceable d-tag) z-tagged to a new `curator-roles` kind-39998 concept; a `computeCuratorStatus` resolver cloning `computeVerification`; a trust-gated write route cloning the author-verified route; a curator-status read; a `Curator` badge on the profile.
- **Pros:** reuses a shipped, CI-verified, count-gated, honest-degrade pattern almost verbatim; sybil-resistant by construction (below-floor asserters carry no weight); POV/decentralized-first (status derives from signed assertions + config, never a stored admin flag).
- **Cons:** a second near-duplicate of the verify machinery. Generalizing author-verified + curator-roles into one `roleScore(pubkey, role)` primitive is the right eventual move (the C-7 design note), but premature now — clone first, extract when the third consumer arrives.

### Option B — Generalize now into a single role-assertion primitive
Refactor author-verified + curator-roles onto one generic `roleScore`.
- **Cons:** premature generalization; refactors shipped, working author-verified under the guise of a new feature. Deferred (logged) until a third consumer justifies it.

### Option C — Store curator status in Postgres (admin table)
- **Cons:** violates POV-first / decentralized-first; curator status must derive from signed vouches + operator config, not a DB row. Rejected.

## Decision

**Option A.** `curator = inSeedAllowlist(pubkey) OR computeCuratorStatus(...) OR (houseWeight(pubkey) ≥ CURATOR_THRESHOLD)`. `W` reuses `CURATOR_THRESHOLD` (no new weight env, mirroring how verified-author reuses it). `N` is a new `CURATOR_VOUCH_MIN_ASSERTERS` (default 10, operator-tunable). The seed allowlist is a new `CURATOR_SEED_PUBKEYS` (comma-separated hex, default empty).

## Consequences
- Enables the graph to grow without operator list-editing; unblocks #68 (the vouch button + Curate nav reads this status).
- Constrains: count-gate (not weighted-sum) — "N trusted people vouched," legible and sybil-resistant. v1 has no contextual/role-specific weighting (general house weight), per the C-7 note.
- **New DList concept:** `curator-roles` (kind-39998) + `CuratorRoleAssertion` (kind-39999). Documented here per the DList-shape rule.
- **New dependency?** No.
- **New config:** `CURATOR_VOUCH_MIN_ASSERTERS` (int ≥ 1, default 10); `CURATOR_SEED_PUBKEYS` (hex list, default empty). `W` reuses `CURATOR_THRESHOLD`.
- **Affects fixtures?** No visual baseline change (the badge renders only for curators; the signed-out profile fixture has none). 
- **PRD section change required?** No (resolves PRD open Qs 2–3).
- **Debt logged:** the eventual `roleScore` generalization (Option B) is deferred to the third consumer.

## Implementation notes
- **`packages/schemas/src/CuratorRoleAssertion.ts`** (new): clone `AuthorVerifiedAssertion.ts`. Fields: `subjectPubkey` (the `#p` target, the candidate curator), `asserterPubkey` (the signer), `role: "curator"` (a `t` tag, reserved for future roles), `polarity`, `parentHeader`. D-tag `curatorrole--<subject8>--<asserter8>` (per-(asserter, subject) replaceable). `content:""`. Export from `packages/schemas/src/index.ts`.
- **`packages/schemas/src/concept-headers.ts`**: add `CURATOR_ROLES_HEADER_SLUG = "curator-roles"` + `buildCuratorRolesHeaderAddress`.
- **`apps/api/src/curator-roles/status.ts`** (new): `computeCuratorStatus(events, candidateHexes, houseObserverHex, floor, minAsserters, trust)` — clone `computeVerification` (dedupe per (asserter, subject), batched `weights(house, distinctAsserters)`, self-excluded, latest-apply, ≥ minAsserters). Pure modulo the injected trust, honest degrade.
- **`apps/api/src/routes/curator-roles.ts`** (new): `POST /api/curator-roles/template` + `POST /api/curator-roles` (tier-branched sign, cloning `routes/author-verified.ts`). Gated: the asserter's own house weight ≥ `CURATOR_THRESHOLD` (`houseWeightOf`); reject self-vouch. `GET /api/profile/:id/curator` → `{ isCurator }` = seed OR `computeCuratorStatus([subject])` OR emergent house-weight. Register all in `index.ts`.
- **`apps/api/src/config.ts`**: add `curatorVouchMinAsserters` (env `CURATOR_VOUCH_MIN_ASSERTERS`, default 10) and `curatorSeedPubkeys` (env `CURATOR_SEED_PUBKEYS`, comma-split hex, default `[]`).
- **`apps/web`**: `api.profile.curatorStatus(npub)` → `{ isCurator }`; a `CuratorBadge` (reuse the `@unbnd/ui` `Label`/`Pill`, token-only, the established badge treatment) rendered in the `Profile.tsx` header when `isCurator`. No vouch button here (#68).

## Out of scope
- The vouch button + Curate nav (#68).
- The `roleScore` generalization (Option B; deferred).
- Contextual/role-specific trust weighting (general house weight for v1).
