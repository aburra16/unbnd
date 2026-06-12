# Review: Story 83 — The tic taxonomy lands with its mechanical check

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-11
**Diff:** `git diff main...HEAD` (impl commit `a8db737`)

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` 0 · `pnpm -r test` exit 0 (guide-lint 13/13; no other suite touched) · web build ok.
- [x] The CLI re-run over the empty baseline: 0 files, 0 errors, 0 flags, exit 0. The planted-violation proof in the impl record: 3 errors + 1 flag with file:line:col + tic ids, exit 1, and "just" correctly silent in prose.

## Spec adherence
- [x] AC-1: one artifact, by construction — Appendix M lives inside the style guide (a product-side amendment, committed on the product side before the branch); the scanner's only coupling is the fence tag; the parser throws loudly on a missing fence, bad JSON, or an incomplete rule (a broken appendix can never silently scan nothing).
- [x] AC-2: hits carry file, line, column, tic id, name, matched text. Matching semantics pinned: whole-word with explicit Unicode boundary checks (the #75 lesson; "Seamlessness" never matches), sentence-initial for openers/closers, steps-only scope for "just."
- [x] AC-3: the extension proof is a test — a rule added to the list is caught with zero logic change.
- [x] AC-4: CI gains the Guide lint step; exit is non-zero only on error severity; the exemption is per-file, allow-listed to E, and claiming any other rule is itself an error hit while the claimed rule still fires (the wall cannot widen silently).
- [x] AC-5: the zero-hit baseline holds over the (absent) content directory.

## ADR adherence (0080)
- [x] Sense-dependent [M] words encode as `flag` (reported for the judgment read, never failing CI) — the honest mechanical/judgment split rather than false-positive errors.
- [x] `packages/guide-lint` rides `pnpm -r`; no new runtime dependency (tsx joins devDeps, already the house runner).
- [x] Boundary: engineering reads the product artifact; the appendix remains product-owned; extension stays one product-side edit.

## Findings
### Blocking
_None._
### Non-blocking
1. **A4 (Title Case Headings, "[M-ish]") has no appendix rule.** Right call for now: entry headings are on-screen names verbatim, which may legitimately carry capitals ("Hidden Gems"), so heading-case needs context the scan lacks. A4 enforcement stays with the edit pass; noted so nobody assumes the scan covers it.
2. **"NIP" as a case-insensitive word rule would also match the common noun "nip."** Unlikely in a book guide but real; if it ever bites, the fix is an appendix edit (move NIP to a case-sensitive regex rule), no code change — which is itself a nice proof of the design.
3. The CLI's minimal glob supports exactly the appendix's `dir/**/*.md` shape; a fancier future glob means extending `expandGlob`. Documented in the code.

## Verdict
**PASS** — all five ACs covered by passing tests plus the end-to-end planted-violation proof; the no-drift requirement is structural (one artifact), the extension contract is proven by test, and the exemption cannot widen silently.
