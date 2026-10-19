# Review: Story 97 — The books list says what it is

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-19

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · full workspace green on this run (seeder 143, api 994 + 13 skipped, web 447) · web build ok · guide scan unchanged.
- [x] One API failure appeared in the Implementer's first full-workspace parallel run and did not reproduce in three later API runs or this one. The story touches no API code. The failing test's name was not captured; recorded rather than dismissed, same load-sensitive class as the #84/#90 notes.
- [x] **Brainstorm's own checker, not judgment by eye:** `listCheck` at Brainstorm-UI `staging` `00e7799f` over the builder's exact output and 11 deliberately awkward live items: header zero problems; items zero blocking; every non-blocking note read and accepted (record in `stories/97-books-header-check/`).

## Spec adherence (ADR 0087)
- [x] Every field the items carry is declared under its existing name, title first and required, each with a description; `optional` per Brainstorm, no `allowed`; `field-type cover url`.
- [x] Display hints name only declared fields, one per role; facts year and pages; subject and lang deliberately not shown, reasons in the ADR.
- [x] Image pinned to a commit; terms `r` for Open Library without claiming a licence it does not grant; exactly one self-pointing `b`; the old `json` kept.
- [x] Link templates are pinned by 64-hex id and the builder refuses anything else, or a field it does not declare. The key-1 Goodreads template is not pinned.
- [x] **One source:** `seededHeaderTemplates` feeds both the seed and `headers.js`; a source-level test forbids either from building headers any other way. This closes the bug class that made a hand fix impossible (the seed republishes every run).
- [x] `headers.js` bundled and copied into the seeder image; Staging ops `headers` task added; workflow YAML parses with the new option.
- [x] Item compatibility with Brainstorm's book view checked in its source: `lib/books.ts` reads the same names, and a declaration now wins with the same names.

## Findings
### Blocking
_None._

### Not yet done, by design (operator steps)
1. The two URL templates are unsigned, so `BOOKS_LINK_TEMPLATES` is empty. Merging now would let any seed run publish the declared header without buttons (still strictly better than today). The intended order is: operator signs templates, ids pinned in a one-line commit, merge, `headers` run, read-back.
2. Team review page published for the operator to share: https://claude.ai/artifact/J4HgniZawTVpytGtERb81F

### Non-blocking
1. Generic surfaces show authors surname-first as Open Library writes them; only an item republish fixes that (with the `i` isbn tag, a natural pairing for a later story).
2. Only `books` changes. The other three seeded headers keep the old shape, and ten headers exist only on the internal relay.
3. `house-copies.md` in Brainstorm-UI becomes stale once this ships; the review page tells the team.

## Verdict
**PASS**, pending the operator's template signatures before publish.
