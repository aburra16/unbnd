# Test Plan: Story 85 — The narrative and the doors

**Story/ADR:** 85 / 0082 · **Date:** 2026-06-11

| Criterion | Test | Level |
|---|---|---|
| AC-1/AC-5 landing complete | `loadGuide recognizes content/landing.md as the landing slot` + `renders the narrative with real headings and steps` (+ the no-landing scaffold case) | unit + component |
| §2 heading construct | the 2 `formatBody` heading tests (## becomes heading; ### stays literal) | unit |
| AC-4 doors | the footer Guide-link test; the About + auth lines verified in review (one-line link additions) | component + review |
| AC-2 contents behavior | unchanged #84 suites (published-only) pass unmodified | regression |
| AC-3 the writing process | enforced by commit shape: a draft commit, a separate taxonomy-edit commit (the recorded diff), the reviewer re-running the scan | process + review |

Confirmed red 2026-06-11: `(25 | 4 failed)` (the 4: landing slot, landing render, heading construct, footer door); #84's 19 + the scaffold negative-space pass. Typecheck 0.
