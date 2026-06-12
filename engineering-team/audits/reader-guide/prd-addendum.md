# PRD Addendum: reader-guide — The Reader's Guide

**Reconciles:** `product-team/prd/reader-guide.md` *(immutable — never edited)*
**Build audit:** `engineering-team/audits/reader-guide/audit.md`
**Date:** 2026-06-12
**Authored by:** engineering (Reviewer at book scope)

## 1. Summary
The book set out to make the product explain itself: every user-facing feature in plain human language, governed by a binding tic taxonomy, for a reader poached from Goodreads. All of it shipped — the taxonomy as an enforced CI artifact, the surface, all 36 entries at zero inventory gaps, the staying-current rule, and the contextual "?" marks. The headline divergences came *after* the queue, from operator staging review: the guide moved from a footer link to a permanent "How it works" top-nav door, the per-section rail became a standard docs tree, and fixing the guide's chrome surfaced an app-wide improvement (the chrome/content frame split) that outgrew the guide entirely.

## 2. Deviations from the PRD

### 2.1 Intentional changes
- **The rail is a docs tree, not per-section contents** (PRD §5.1 / design guide). One frozen tree on every guide page, sections collapsible, position marked, scroll-followed. The reshuffling rail tested as disorienting in operator review (ADR 0085).
- **The footer door is named "How it works", not "Guide"** — one name for one door, matched to the new nav placement (ADR 0084).

### 2.2 Deferred (each with a home)
- Retroactive taxonomy sweep of pre-guide app copy → **now ripe** (the PRD's own condition — "after the guide proves the taxonomy" — is met). Recommend an early next-phase story.
- Guide search → only if the guide outgrows its contents page (PRD §8.3, unchanged).
- Support/FAQ → when real tickets exist (PRD §8.3, unchanged).
- Localization → far future (PRD §8.3, unchanged).
- Mobile guide navigation; tree-state persistence; wider guide content column → operator-triggered refinements through existing seams.

### 2.3 Added beyond the PRD
- **The "How it works" top-nav door** (#93). The PRD's three doors assumed footer-grade discoverability suffices; staging review said otherwise. *Recommend ratifying the four-door model and the name into the product model.*
- **The chrome/content frame split + PageShell** (#96). App-wide: nav/footer are full-bleed bars on a 1200px chrome row while content keeps its 720px measure; all routes compose chrome through one shell. Done inside the Epic 0001 design discipline (token, typed Container frame, extended guard, REDESIGN.md updated). *Recommend ratifying two-frame geometry into the design rules.*
- **The rendered-output sweep** (#95). CI now renders every published body and fails on authoring artifacts. A process gain, invisible to product.
- **The landing's "question marks" section** (#92) — the staying-current rule's first live application.

### 2.4 Constraints discovered
- **Authoring metadata vs the literal-render philosophy.** The formatter's "unknown constructs render visibly wrong" design assumed review eyes catch strays; the taxonomy-exemption marker was *expected* in source and reached production rendered. Resolution: machine metadata is now a known construct stripped at load, and CI sweeps rendered output. Implication for the design rules: any future authoring-side annotation must be added to the loader's known set, never left to the formatter.
- **Signed-out captures cannot pixel-gate signed-in affordances.** The contextual marks and the view-switch bar render only signed-in, so the visual harness doesn't see them (REDESIGN.md §7's standing fixture gap, now with concrete product surfaces attached).

## 3. Impact on the product model
- **Personas / journeys:** unchanged — entry moments A–D all served; the recruit's on-ramp (journey C) is now the literal link `staging.unbnd.ink/guide` plus a permanent nav door.
- **Scope / roadmap:** the retroactive copy sweep moves from "deferred until proven" to "ready"; Phase 4 (distribution/payments) remains HELD for founding-curator recruitment ops, which this book unblocks.
- **Domain model:** untouched — the guide is content, zero events/endpoints/schema.
- **Design rules:** the taxonomy is ratified-in-practice (six content batches + two-pass process + recorded diffs); the chrome/content two-frame geometry and the four-door model should be written into the product design guides.

## 4. Recommended scope for the next phase
- The retroactive taxonomy sweep of app copy (carry-forward #1) — small, high-coherence, and the taxonomy's extension contract means it ratchets automatically afterward.
- Founding-curator recruitment ops with `/guide` as the recruit artifact — the stated reason Phase 4 is held; the guide was this book's contribution to it.
- Signed-in visual fixtures (carry-forward #6) before any larger UI work, per REDESIGN.md §8's "build coverage first."

## 5. Open questions for product
1. Does "How it works" replace the About cross-link's prominence, or do both doors stay? (Both exist today.)
2. Should the guide content column widen to a docs-grade measure (~1000px) now that the chrome seam makes it a one-value change, or is the 720px column part of the guide's reading-first identity?
3. When recruitment begins, does the guide landing need a curator-specific variant link (e.g. `/guide#if-you-curate`), or is the existing skippable extension enough?
4. The recruit-facing metric (PRD §10: "a recruit receives /guide instead of a live walkthrough") is now measurable — who owns tracking it through the recruitment effort?
