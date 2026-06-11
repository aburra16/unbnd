# Review: Story 81 — Contested-tag treatment

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-09
**Diff:** `git diff main...HEAD`

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` — pass (0). `pnpm -r test` — pass (exit 0, incl. the ui token-architecture suites against the new CSS). `pnpm --filter @unbnd/web build` — pass.
- [x] Story suites: aggregate-contested 6/6 (whole tags suite 36/36), contested-chips 4/4.

## Spec adherence
- [x] AC-1: trusted net-disputed (and the ADR's tie) → `contested: true`; web renders muted + struck + "contested" label on both chip surfaces (BookHeader, TagControl — pinned by component tests).
- [x] AC-2: net-applied → the key is **omitted** (not false) — fixture-stable, the revealed/gated pattern; verified `"contested" in so === false`.
- [x] AC-3: raw/no-trust never contested; untrusted dispute volume can't trigger it (weight 0).
- [x] AC-4: tokens only (`--u-muted`, `--u-border`, `--u-font-size-10`; no new hex — swept); `!isAccusatory` in the predicate makes a revealed/gated collision impossible (tested with a revealed trusted-net-disputed accusatory tag); contested takes precedence over `community` and drops the per-genre color fill (a colored struck chip would fight itself).
- [x] AC-5: surfacing unchanged (the flag is computed inside the existing consensus build; no filter touched); raw counts unchanged; every pre-existing aggregate/route/web test passes unmodified.

## Things tests can't catch
- [x] The count suppression on contested chips is deliberate (a struck label beside an endorsement count contradicts itself; matches the wireframe).
- [x] `ShelfControl` also renders `GenrePill` but from shelf data with no consensus flag — out of the story's two named surfaces; it simply never passes `contested` (prop optional, default off).

## Findings
### Blocking
_None._
### Non-blocking
1. **The tie rule is a judgment call** (`>=` rather than the strict `>` reading of "net-disputes"). The ADR argues a tied tag is not settled; it is pinned by a dedicated test, so flipping it later is a one-line + one-test change if product disagrees.

## Verdict
**PASS** — all gates green, all 5 ACs covered, ADR 0079 adhered to. A small, additive, read/presentation-only diff: one predicate in the aggregate, one Pill treatment, two pass-throughs.
