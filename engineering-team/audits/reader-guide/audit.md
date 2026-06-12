# Build Audit: The Reader's Guide

**Book:** `engineering-team/audits/reader-guide/book.md`
**Date:** 2026-06-12
**Branch / commit range:** `9a95fde..9be22d0` (main; per-story branches merged `--no-ff`)
**Provenance:** PRD-backed (`product-team/prd/reader-guide.md`, all of §5; design guide + the tic taxonomy binding)
**Confidence:** high

## 1. What shipped
- **The language law as an enforced artifact**: the tic taxonomy (`product-team/guides/reader-guide-style-guide.md`) with Appendix M as the machine seam, and `packages/guide-lint` — a data-driven scanner CI runs on every push; extension is one product-side document edit — `stories/done/83-tic-taxonomy-check.md`.
- **The guide surface**: `/guide` + 8 section routes, authored frontmatter with stable-forever anchors, the subset formatter, the document register — `84-guide-surface.md`.
- **The start-here narrative + the doors**: the landing a recruit receives, the footer/About/auth doors — `85-guide-narrative-doors.md`.
- **The complete reference**: 36 entries across all 8 sections, every batch through the two-pass process (draft commit + recorded taxonomy-edit commit), reconciled at zero gaps against the scope inventory — `86`–`91`.
- **The staying-current rule**: a definition-of-done section in `engineering-team/templates/review-checklist.md`; first applied live at #92 — `91-guide-ref-sovereignty.md`.
- **Contextual entry points**: one shared `GuideLink` ("?") on the seven highest-confusion surfaces, each one click from its anchor — `92-guide-contextual-links.md`.
- **Operator-refinement round (beyond the queue, post-staging review)**: the "How it works" top-nav door + site chrome on guide pages (#93, ADR 0084); the docs-tree left rail (#94, ADR 0085); authoring comments stripped at render + a rendered-output CI sweep (#95); the chrome/content frame split with `PageShell` (#96, ADR 0086).

## 2. Stories rolled up

| Story | Delivered | Status | Review |
|---|---|---|---|
| #83 tic-taxonomy-check | Appendix M + guide-lint + CI gate | Done | `reviews/83-tic-taxonomy-check.md` |
| #84 guide-surface | routes, anchors, formatter, frame | Done | `reviews/84-guide-surface.md` |
| #85 guide-narrative-doors | landing narrative + 3 doors | Done | `reviews/85-guide-narrative-doors.md` |
| #86 ref: getting-started + finding-books | 10 entries | Done | `reviews/86-guide-ref-getting-started-finding.md` |
| #87 ref: ratings-you-can-trust | 6 entries (the heart) | Done | `reviews/87-guide-ref-trust.md` |
| #88 ref: rating-reviewing-tagging | 6 entries | Done | `reviews/88-guide-ref-rating-tagging.md` |
| #89 ref: sharing + for-authors | 4 entries | Done | `reviews/89-guide-ref-sharing-authors.md` |
| #90 ref: for-curators | 7 entries | Done | `reviews/90-guide-ref-curators.md` |
| #91 ref: your-account-is-yours + DoD rule | 3 entries; 36/36 inventory | Done | `reviews/91-guide-ref-sovereignty.md` |
| #92 contextual entry points | GuideLink on 7 surfaces; landing names the marks | Done | `reviews/92-guide-contextual-links.md` |
| #93 guide joins site chrome | "How it works" nav door; footer rename; Nav/Footer on guide pages | Done | `reviews/93-guide-site-chrome.md` |
| #94 docs-tree rail | one frozen GuideTree everywhere; scroll-spy; carets | Done | `reviews/94-guide-rail-tree.md` |
| #95 authoring comments never render | load-layer strip + rendered-output sweep | Done | `reviews/95-strip-authoring-comments.md` |
| #96 chrome/content frame split | `--chrome-max`; Container `frame`; PageShell; guard extended | Done | `reviews/96-chrome-content-split.md` |
| (chore) api vitest forks pool | retired the supertest transport flake | Done | book.md carry-forward note |

## 3. As-built inventory
- **User-facing:** `/guide` + `/guide/:section` (8 slugs); 36 entries + the landing under `apps/web/src/guide/content/`; `GuideTree` rail (wide viewports); `GuideLink` marks on PoVBar, TasteMatchChip (profile), HypeGapIndicator, the vouch line, TagControl contested + reviewed areas, both removal surfaces; "How it works" in nav + footer; full-bleed chrome bars site-wide via `PageShell` (all 14 standard routes).
- **Packages:** `packages/guide-lint` (rules/scan/CLI, 13 tests); `@unbnd/ui` Container gained typed `frame` prop + `--chrome-max` page-geometry token; page-frame guard extended.
- **Web internals:** `apps/web/src/guide/{load,format,sections,GuideContext,GuideBlocks,GuideTree,useActiveEntry}`; `PageShell`; content-integrity standing guard + rendered-output sweep; `guide-section.png` joined the visual baselines (7 captures now).
- **Data & contracts:** none — content ships with the bundle; no events, API routes, schema, or index changes anywhere in the book.
- **CI:** `Guide lint` step; visual gate covers the guide for the first time.

## 4. Deviations from intent

| # | Specified (anchor) | Built | Type | Rationale (source) | Product impact | Carry-forward |
|---|---|---|---|---|---|---|
| 1 | PRD §5.1 "side-rail contents on wide viewports" (per-section, per the design guide) | One frozen docs tree on every guide page: all 8 sections collapsible, current marked, scroll-spy | intentional-change | Operator staging review: the reshuffling rail was disorienting (ADR 0085) | Stronger: standard docs UX, whole-guide visibility | — |
| 2 | PRD §5.1 doors: footer "Guide" + About + auth line | Those three, plus a permanent "How it works" top-nav door; footer renamed to match | added-beyond-scope | Footer links under-perform; recruits need the door visible (ADR 0084) | The guide is one click from every page | Ratify the 4-door model + the name into the product model |
| 3 | One marked entry carries the protocol-wall exemption | Same — but the marker initially RENDERED as literal text in production | constraint-discovered | The formatter renders unknown constructs literally by design; authoring metadata needed renderer awareness (#95) | None after fix; a CI sweep now gates the whole class | — |
| 4 | (not in PRD) app-wide chrome geometry | The chrome/content frame split: `--chrome-max`, full-bleed bars, `PageShell` across all 14 routes | added-beyond-scope | The guide's wide pages made the 720px boundary visible; nav wrapped (operator review; ADR 0086, within the REDESIGN.md discipline) | Site-wide layout improvement, not guide-only | Ratify two-frame geometry into the design rules |
| 5 | §5.2 "roughly 35 entries" | 36 entries, zero gaps | interpretation | The scope inventory is the contract; 36 is its count (#91 reconciliation) | None | — |
| 6 | §10 "mechanical scan returns zero hits" | Zero **errors**; 5 standing sense-dependent **flags**, each kept with a recorded reason | interpretation | Appendix M encodes sense-dependent words as flags for the judgment read, never CI-failing (ADR 0080 §1) | None — the metric's intent (no machine-detectable tics) is met | — |
| 7 | ADR 0084 §4: no layout shell until "a third missing-chrome bug" | PageShell landed at #96 | intentional-change | The whole surface was being restructured anyway; the shell removes the bug class (ADR 0086 §4, superseding on the record) | None user-facing | — |

**Undocumented work** — diff walked (`9a95fde..9be22d0`, 14 `--no-ff` story merges + the flake chore): every change traces to a story/ADR/review or the recorded chore. The api vitest `pool: "forks"` + `testTimeout` riders are documented in the book's carry-forward and review #91. No unprovenanced work found.

## 5. Quality state at close
- Gates: typecheck **0 errors**; tests **1,987 passed | 13 skipped, 0 failures** (13 workspaces, incl. all 12 architecture guards + guide-lint); web build **PASS**. CI + staging deploy green at tip `9be22d0`; all refinements verified in the live bundle.
- Known accepted limits: the visual harness captures signed-out screens only, so the GuideLink marks and PoVBar ready-state aren't pixel-gated (component tests carry that load — review #92); the scroll-spy reading band is a judgment constant (review #94).
- Debt: none new. The forks-pool chore *retired* standing debt (the transport flake).

## 6. Carry-forward register
- [ ] Retroactive taxonomy sweep of pre-guide app copy (PRD §8.3, deferred with a home: after the guide proves the taxonomy — it has; the sweep is now ripe).
- [ ] Appendix M "NIP" word-rule could match the noun "nip" if ever added as a case-insensitive word (review #83; an appendix edit, no code).
- [ ] Wider guide content frame (operator option; one typed frame value through the ADR 0086 seam).
- [ ] Mobile guide navigation (the tree hides under 880px; the landing TOC serves narrow viewports today).
- [ ] Tree expand/collapse persistence across navigation (one-hook follow-up if readers ask — review #94).
- [ ] Signed-in visual fixtures (REDESIGN.md §7 standing gap; would pixel-gate the contextual marks and PoVBar ready state).
- [ ] Guide search / support-FAQ / localization (PRD §8.3 homes unchanged).
- [ ] Operator-only: age-encrypt LIBRARIAN_NSEC (pre-existing, unrelated to this book).
