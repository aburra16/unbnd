# Review: Story 92 — Contextual entry points (GuideLink)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-12

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 across the workspace · full suite green (web 429, api 994+13 skipped, seeder 132, ui 20 incl. the architecture guards, guide-lint 13) · web build ok · guide scan re-run: 37 files, 0 errors, 5 standing flags (all previously kept with reasons).
- [x] **The architecture guards earned their keep mid-story**: the shape-literal guard (ADR 0043 §5) failed the first GuideLink.css on a raw `border-radius: 50%` and the fix went through `--u-radius-circle`. The gate worked exactly as designed; recorded here because it is the proof the token discipline holds for new components, not just refactored ones.

## Spec adherence (ADR 0083)
- [x] **One shared component**: `GuideLink({ to, label })` — a circled "?" rendered as a router `Link`, class `guide-what`, `aria-label "{label}: the guide explains"`, tokens only (`--u-border`, `--u-muted`, `--u-amber` on hover, `--u-radius-circle`, spacing/size tokens).
- [x] **All seven placements, each verified by a test asserting the exact `/guide/<section>#<anchor>` href**:
  1. PoVBar ready state → `ratings-you-can-trust#unbnd-house-view`
  2. TasteMatchChip with `withGuideLink` (profile placement only; default false, asserted both ways) → `#taste-match`
  3. HypeGapIndicator (hidden-gem and overhyped states only; the component still returns null otherwise) → `#hidden-gem-and-overhyped`
  4. Profile's vouch line → `for-curators#vouching`
  5. TagControl contested chips (renders only when a chip is contested; absence asserted) → `rating-reviewing-tagging#contested`
  6. TagControl reviewed-signals area → `#reviewed-signals`
  7. Both removal surfaces ("Removal queued" in CommunitySubmissions, DemoteControl's requested state) → `for-curators#removing-a-book-from-the-catalog`
- [x] Every target anchor exists in published content (the content-integrity guard plus the #91 inventory cover this; the hrefs in the test file are string-identical to the published anchors).
- [x] BookHeader hero stays clean (no GuideLink added there; contested treatment door lives in TagControl only, per the ADR).

## Findings
### Blocking
_None._

### Caught and fixed during the story (recorded honestly)
1. **The red set missed a call site.** The component test exercised `TasteMatchChip withGuideLink` directly but nothing asserted Profile actually passes the prop — and the first implementation didn't. Caught in the implementer's own survey pass, fixed in its own commit. Lesson for the harness: placement tests on shared components must also pin the call site, or the review must walk call sites explicitly (this review did).
2. **Pre-existing component tests broke as designed**: PoVBar/HypeGap/RatingsPanel suites rendered without a router and GuideLink's `Link` needs one. Wrapped in `MemoryRouter` with a one-line comment saying why. This is the expected cost of adding navigation to shared components, not a regression.

### Non-blocking
1. **Visual baselines verified unchanged, with the reason on record.** The refresh ran in the canonical pinned image (`v1.60.0-jammy`, disposable worktree, Linux install) and produced six byte-identical PNGs. That is correct, not suspicious: all captures are signed-out (ADR 0039), signed-out forces trust status `house-only`, so the PoVBar ready state never appears on a captured screen; TasteMatchChip hides signed-out; the fixture book has no contested chips or revealed signals. Consequence worth naming: **no committed baseline currently exercises any GuideLink placement**, so future visual drift in the mark itself won't be caught by the visual gate — the component tests carry that load. If a signed-in baseline variant ever lands (ADR 0039 left the door open), PoVBar's ready state should be in it.
2. The signed-out visitor — arguably the person most confused by "Unbnd house view" — never sees the PoVBar door because the bar's ready state is the only state that renders it. The guide's other doors (footer, About) cover that reader. If recruitment feedback says otherwise, a `house-only`-state placement is a one-line follow-up.

## The staying-current rule (its first application since landing in #91)
- [x] The story adds a user-facing mark, so the landing now names it: a "The question marks around the site" section, written through the full two-pass process (draft commit + recorded taxonomy-edit commit: an overstated-coverage reword, a cut C-family cadence, one kept-adjective decision). Scan clean.

## Verdict
**PASS** — the epic's last story: every listed confusion surface reaches its guide entry in one click (PRD §10), through one quiet mark a reader learns once.
