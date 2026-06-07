# ADR 0067: Vouch control + the Curate surface

**Status:** Accepted
**Date:** 2026-06-06
**Story:** `engineering-team/stories/done/68-vouch-control-curate-surface.md`

## Context

Story #68 is the write-side UI for the #67 curator mechanism. It needs: a gated "Vouch as curator" control on a profile (with withdraw), an "N trusted people vouched" count, and a "Curate" nav entry for curators. #67 already shipped the write (`POST /api/curator-roles/template` + `POST /api/curator-roles`, gated to asserters with house-weight ≥ `CURATOR_THRESHOLD`, self-vouch rejected) and the subject read (`GET /api/profile/:id/curator` → `{ isCurator }`). The established UI pattern for a tier-branched, optimistic, status-driven action is `FollowButton` (`apps/web/src/components/FollowButton.tsx`: `useSession`, sovereign `template→window.nostr.signEvent→submit` / custodial server-signed, optimistic + revert, `aria-pressed`).

Two viewer signals are needed (PO open Q1): the viewer's **vouch-eligibility** (their own house-weight ≥ threshold — the #67 write gate) for the control, and the viewer's **curator status** for the Curate nav. The "N vouched" count (open Q2) needs a trusted-asserter count the #67 read does not yet expose. And the #67 review logged a follow-up: the sovereign vouch submit should validate the event shape.

## Options considered

### Option A — A session `me/curator` read + an extended subject read + a FollowButton-shaped control (chosen)
- `GET /api/me/curator` → `{ isCurator, canVouch }` (session-scoped; `canVouch` = `houseWeightOf(me) ≥ threshold`, `isCurator` = seed OR vouched OR emergent for me). Drives the Curate nav (`isCurator`) and the Vouch control visibility (`canVouch`).
- Extend `GET /api/profile/:id/curator` → `{ isCurator, vouchCount }` (vouchCount = the subject's trusted-apply-vouch count). Backward compatible.
- `GET /api/profile/:id/vouch-status` (session) → `{ vouched: boolean }` (does the session user currently net-apply-vouch this subject) — the control's initial state, mirroring `followStatus`.
- Parameterize the #67 `template`/submit with `polarity` (vouch = +1, withdraw = −1) and add `validateSignedCuratorRole` to the sovereign submit (the #67 follow-up).
- `VouchButton` clones `FollowButton`; the Curate entry lives in `Nav`, gated on `me/curator.isCurator`, linking to the existing `/submissions` (which already carries the promotion tools).
- **Pros:** reuses the FollowButton + author-verified read patterns; the session vs subject split is clean; backward-compatible reads.
- **Cons:** three small read endpoints. Acceptable — each is a distinct question (my status, this subject's count, do-I-vouch-this-subject).

### Option B — One combined endpoint returning session + subject data
- **Cons:** conflates session-scoped (`canVouch`) and subject-scoped (`vouchCount`) reads; awkward caching and per-viewer leakage. Rejected.

## Decision

**Option A.** No new DList concept (reuses #67's `curator-roles`). The Curate nav = `isCurator`; the Vouch control = `canVouch`; both from `GET /api/me/curator`.

## Consequences
- Completes the curator loop UI; the trust graph is now growable end-to-end from the product.
- Resolves the #67 review follow-up (sovereign submit event-shape validation).
- **New endpoints:** `GET /api/me/curator`, `GET /api/profile/:id/vouch-status`; `GET /api/profile/:id/curator` gains `vouchCount`; `POST /api/curator-roles[/template]` gains an optional `polarity`/`action`.
- **New dependency?** No. **New DList shape?** No. **New config?** No.
- **Affects fixtures?** The profile visual baseline is signed-out → no control, no Curate nav, no badge → unchanged.

## Implementation notes
- **`apps/api/src/curator-roles/status.ts`** — add `trustedVouchCount(events, subjectHex, house, floor, trust): Promise<number>` (the distinct above-floor latest-apply asserter count; reuses the #67 parse + batched weights). `computeCuratorStatus` may delegate to a shared counted-map helper (no behavior change to its tests).
- **`apps/api/src/routes/curator-roles.ts`** — add `GET /api/me/curator` (`{ isCurator, canVouch }`), `GET /api/profile/:id/vouch-status` (`{ vouched }`, the session user's latest polarity for the subject), and `vouchCount` to the existing `GET /api/profile/:id/curator`. Parameterize `buildTemplate` with `polarity` (read `action: "vouch" | "withdraw"` → +1 / −1 on `/template` + custodial submit). Add `validateSignedCuratorRole(event, asserterHex)` (event is a well-formed `curator-roles` assertion, `pubkey === asserter`, subject ≠ asserter) on the sovereign submit.
- **`apps/web/src/lib/api.ts`** — `api.profile.meCurator()`, `vouchStatus(npub)`, `vouchTemplate({ subject, action })`, `vouch(event, hint)`, `vouchCustodial({ subject, action })`; extend `curatorStatus` to return `vouchCount`.
- **`apps/web/src/components/VouchButton.tsx`** (new) — clone `FollowButton`: render only when signed-in, `canVouch`, and viewing another profile; read `vouchStatus`; vouch/withdraw via the tier-branched write; optimistic + revert; `aria-pressed`. Placed in `Profile.tsx`.
- **`apps/web/src/routes/Profile.tsx`** — render the "N trusted people vouched" count (from `curatorStatus().vouchCount`, only when > 0) and the `VouchButton`.
- **`apps/web/src/components/Nav.tsx`** — a "Curate" entry gated on `meCurator().isCurator`, linking to `/submissions`.

## Out of scope
- The curator-role mechanism + gate knobs (#67).
- Any new curator capability beyond surfacing `/submissions`.
- The `roleScore` generalization (deferred since #66/#67).
