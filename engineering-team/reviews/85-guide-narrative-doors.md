# Review: Story 85 — The start-here narrative and the three doors

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-11
**Diff:** `git diff main...HEAD`

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · `pnpm -r test` exit 0 (the forks pool holding; guide suites 25/25) · web build ok · **guide-lint over the real narrative: 1 file, 0 errors, 0 flags** (re-run independently).

## The writing process (the story's point)
- [x] **The two-pass shape is in the history**: `draft(85)` (pass 1) and `edit(85)` (pass 2) are separate commits, and the edit pass is a REAL diff: a C6 hedge corrected (which also fixed a content overstatement about a fresh account's state), and a B3 triad + F1 adjective broken ("Same books, same honest counts, a different set of judges" → "The books and the counts stay the same; the judges change").
- [x] Judgment spot-read of the final text: the we-voice appears once, in the opening passage only (the landing's allowance); the single D1 comparison is the canonical staff-picks shelf; the one remaining triad (ratings/tags/catalog) is three distinct facts inside one sentence, B4's prescribed shape; steps are second-person imperative; the read-aloud test passes on the opening and the four moves; no protocol vocabulary anywhere (the E-wall holds with zero exemptions used).
- [x] The curator extension is clearly marked and skippable ("You can skip it and come back"), and the dignity register holds.

## Spec adherence
- [x] AC-1/AC-5: the landing reads complete and self-sufficient as a cold link: the honest paragraph, the four moves, why the numbers differ, the marked extension. The four moves carry no links yet (the #86 AC adds them; no dead links today).
- [x] AC-2: the contents region still lists published sections only (none yet) — the #84 suites pass unmodified.
- [x] AC-4: the three doors verified in the diff: footer "Guide" beside About (site-wide); the About cross-link ("New here? The guide walks through everything, in plain words."); the quiet line on /auth (in the existing footer slot) and /auth/welcome. Door copy is ban-list-clean.
- [x] Visual baselines: the 4 footer screens refreshed via the documented intentional path in the pinned image; the 2 screens Playwright compared byte-identical keep their committed baselines (the diff contains only real pixel changes).

## Findings
### Blocking
_None._
### Non-blocking
1. The #84 "unknown construct" fixture used `##`, which this story promoted to a real construct; the fixture moved to bullets with a comment. Spec evolution, recorded.
2. The auth-welcome captured variant doesn't reach the added note region, so its baseline is unchanged; if the capture ever extends, the line will appear as an intentional diff then.
3. The machinery commit briefly carried the stale #84 fixture red; fixed in the immediately following commit before any push. Process nick, noted for the record.

## Verdict
**PASS** — the writing process's proving run worked: a real draft, a real edit pass with a recorded, reasoned diff, an independent scan, and a judgment read. The guide is now live behind three quiet doors and reads complete as the recruit's cold link.
