# Review: Story 71 — Hidden Gems homepage shelf

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff 93be160...HEAD` (impl commit `69a1f69`, + review nit fixup)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0, no failing files). Story suites: shelves 29/29, api homepage-shelves 8/8, web home-trust-shelves 10/10.
- [x] `pnpm --filter @unbnd/web build` — **pass** (`✓ built in 649ms`).
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] Every acceptance criterion has a passing test.
  - AC-1 (highest positive hype-gap from house viewpoint, gated + ranked) → worker `ranks by gap … desc; excludes consensus and overhyped` + below-min + honest-empty; serve hydrate-in-order; web renders the shelf.
  - AC-2 (on-ramp when empty) → web `shows the on-ramp empty state … (cold-start)`; serve empty-shelf test.
  - AC-3 (scheduled, never per request) → computed in `apps/shelves` `computeShelves`; serve reads cache only, guarded by the existing `NEVER computes on the request path` suite (no new trust/rating read added).
- [x] No criterion silently dropped. Yours per-user variant is explicitly deferred to #71b (ADR 0069 Option A, in the story).
- [x] No behavior added beyond the story. The shelf is additive; existing shelves untouched.

## ADR adherence (0069)
- [x] Files changed match the ADR: House scheduled shelf via `apps/shelves` worker; additive `hiddenGems` on `ShelfSet` + `CachedShelfSet`; ranked by trusted−raw gap; gated by `favoritesMinRatings` + new `HIDDEN_GEMS_MARGIN` (0.5).
- [x] Layering respected. Worker depends only on the neutral `@unbnd/trust` seam (`dedupeRatings`/`weightedRatings`) — no Brainstorm/NIP-85 specifics, no cross-app import. Serve stays server-side; web stays UI.
- [x] No new dependencies.
- [x] Reuses the shipped trust math — no new ranking/weighting primitives. The only inlined arithmetic is the unweighted crowd mean (see Non-blocking 1).

## DList integrity
- [x] No event shapes touched. Reuses `book-ratings` (kinds/d-tags unchanged). Librarian pubkey resolved at runtime via `deps.config.librarianPubkey`; concept addresses built with the existing `build*HeaderAddress`/`formatAddress` helpers. No hardcoded pubkeys.

## UI integrity
- [x] Brand tokens only. The new on-ramp reuses `--u-space-*`, `--u-font-size-*`, `--u-muted` via the generalized `.shelf-invite*` classes. No new hex literals.
- [x] No icon libraries; no new SVG.
- [x] Copy clean: "Follow a few curators and this shelf fills with books your trusted network rates far above the crowd." No em dashes, no rhetorical contrast, no banned filler. Mirrors the shipped For-You invite voice.
- [x] No trust score / tier / GrapeRank number on any card or on the wire. The shelf carries only `{ books }`; covered by the existing `no trust score/tier on the wire` suite (Hidden Gems reuses the same shape).

## Things tests can't catch
- [x] No secrets, no `console.log`, no commented-out code in the diff.
- [x] Error/edge paths: honest empty when no trusted signal, below-margin, or below-min; optional cache field read as `[]` (pre-#71 back-compat); no-vantage early return carries an empty `hiddenGems`.
- [x] Concurrency: serve path is read-only over a single cache snapshot; worker is the existing single-cycle atomic-replace (unchanged). No new shared state.
- [x] Security: no new input boundary (the slug-hydrate batch read is the existing `#d` path; `HIDDEN_GEMS_MARGIN` parsed by `positiveFloat`).

## House rules check
- [x] PRD scope discipline: no out-of-scope surface (no file hosting / payments / feed / progress).
- [x] POV-first: the shelf is computed from the explicit **house** observer vantage (`houseObserverPubkey`), not a pretended global truth; the Yours per-user vantage is the deferred #71b.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
_None._

### Non-blocking
1. **`apps/shelves/src/compute.ts` (crowd mean) vs `apps/api/src/ratings/summary.ts:rawFromParsed`** — the crowd raw average is computed two ways. Verified **byte-identical today**: both are `deduped.reduce((s,r)=>s+r.score,0)/count` over `dedupeRatings(...)`, so the #70 book-page badge and the #71 shelf share the exact same "raw" definition. They cannot be DRY'd in place because `rawFromParsed` lives in `apps/api` and the worker may not cross-import it (layering guard). *Suggestion (future cleanup, out of #71 scope): promote `rawFromParsed` to `@unbnd/trust` so both the api route and the worker share one implementation.*
2. **Min-trusted gate diverges between the badge and the shelf** — the #70 hype-gap badge uses `HYPE_GAP_MIN_TRUSTED = 2`; the #71 shelf reuses `favoritesMinRatings = 3` (ADR 0069's deliberate "reuse the Favorites minimum, no new knob"). Effect: a book with exactly 2 trusted raters and a ≥0.5 gap shows the "hidden gem" badge on its detail page but is **excluded** from the Hidden Gems shelf. The margins agree (both 0.5), but `HIDDEN_GEMS_MARGIN` is env-overridable while #70's is a hardcoded web constant, so an ops override would also diverge them. This is a narrow boundary case and the shelf being stricter is defensible (a discovery shelf shouldn't surface 2-rater books), but it is a small product-coherence seam. *Suggestion: accept as an intentional stricter-shelf and note it, or align the two minimums via a shared constant in #71b.*
3. **`apps/shelves/src/compute.ts` — `if (deduped.length === 0) continue;`** is unreachable: `weightedRatings(...)` returns non-null only when ≥1 trusted rating exists, which implies `deduped` is non-empty. Harmless defensive guard against a future divide-by-zero. *Optional: remove, or keep as defense-in-depth.*

## Verdict
**PASS** — all gates green, all ACs covered by passing tests, ADR/house-rules adhered to. The non-blocking items are surfaced for the record (no hidden debt): #1 and #2 are the only product-coherence seams and both are conscious ADR-level choices; recommend folding the min-trusted alignment (#2) into the #71b fast-follow.
