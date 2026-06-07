# Review: Story 74 — Followers count via NIP-85

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff main...HEAD` (impl commit `ed4ec76`)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0, no failing files). Story suites: trust 40/40, api profile-stats 10/10, web profile-followers-count 3/3.
- [x] `pnpm --filter @unbnd/web build` — **pass**.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1: a "Followers" cell renders with the count (web), served from `trust.followers(house, [target])` (api).
- [x] AC-2: the count comes from the trust seam (the NIP-85 attestation); Brainstorm parses the `followers` tag off the same trusted-assertion read as `weights()`. The profile-stats route adds **no `#p` filter** — asserted by scanning every `query` call.
- [x] AC-3: no followers → "No followers yet." (web), `followersCount` omitted (api).
- [x] AC-4: unavailable / 0 / degrade → "No followers yet."; the trust seam is best-effort/never-throws and the read is independently wrapped.
- [x] No criterion dropped; behavior is additive.

## ADR adherence (0072)
- [x] Option A built as decided: `followers()` added to the `TrustProvider` seam (symmetric with `weights()`), Brainstorm + Fixture implement it, profile-stats reads it from the **house** vantage, web renders count / empty state.
- [x] POV reconciliation honored: read from `config.houseObserverPubkey` — one stable number per profile, shown to all viewers.
- [x] Honest-empty falls out of the seam contract; `FixtureSpec.followers` is additive/optional.
- [x] **Architecture guard green:** the backend event-kind literal stays inside the adapter; the new comments say "NIP-85 attestation" (the guard tripped on a first pass and was corrected).

## DList integrity
- [x] No event written. The followers count is a trust-seam read; the kind/relay specifics live only in `brainstorm.ts`. No `#p` relay scan introduced (the deferral's whole point).

## UI integrity
- [x] Brand tokens only (`--u-muted`, `--u-font-size-13`, `--u-space-8`) for the new `.profile-followers-empty`; no new hex.
- [x] Copy: "No followers yet." — plain, no slop, no em dash; "Followers" cell label mirrors the existing "Following".
- [x] No icon library; the count renders via the existing `ProfileStats` cell.

## Things tests can't catch
- [x] No secrets, no `console.log`, no commented-out code.
- [x] Security: read-only, bounded by `targetHexes`; the count is a number rendered via `toLocaleString` — no injection surface.
- [x] Concurrency: the followers read is a fifth independent parallel cell; a failure omits only its field (never blocks the rest of stats).
- [x] The fixture-fallout (10 api inline trust mocks + the librarian mock) is purely additive single-line `followers` stubs — behavior-neutral; all suites green.

## House rules check
- [x] PRD scope: count only (no follower list, no realtime); no out-of-scope surface.
- [x] POV-first: an explicit house-anchored count, never a claimed global truth.
- [x] No new lint/typecheck/build tooling; no new dependency.

## Findings

### Blocking
_None._

### Non-blocking
1. **Duplication between `weights()` and `followers()` in `brainstorm.ts`.** The two methods share ~30 lines (cache check → `#serviceKey` → relay union → `query` → per-event parse/union), differing only in the tag parsed (`rank` vs `followers`) and the value transform (`/100` clamp vs `Math.trunc`). ADR 0072 explicitly chose to mirror the read path and earmarked a shared read as a "future optimization." *Suggestion: extract a private `#readAssertion(observer, targets, pick)` helper that returns the union map for a caller-supplied per-event picker; both methods become thin. Small and clean, but it touches the proven `weights()` hot path — fine to do now if desired, or as a focused follow-up. Flagging so the duplication is on the record, not silent.*
2. **Availability dependency (honest-empty until the source is live).** Until the Brainstorm backend publishes the `followers` datum, `followers()` returns empty and every profile shows "No followers yet." — correct by construction, but note AC-4 deliberately conflates "zero followers" and "no datum yet" into the same line. Recorded in the book's Deploy/ops notes alongside #72's `PUBLIC_ORIGIN`.
3. **Stale-cache carry (inherited).** Like `weights()`, the `fresh` merge keeps a previously-cached count for a target whose datum later disappears, until the TTL expires. Matches the existing weights behavior; acceptable.

## Verdict
**PASS** — all gates green, all ACs covered, ADR 0072 + house rules adhered to, the trust agnosticism guard green. The duplication (finding 1) is the only real quality item and is ADR-acknowledged; recommend the shared-read extraction as a small follow-up (or now, on request).
