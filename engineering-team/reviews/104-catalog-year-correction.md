# Review: Story 104 — Catalog records carry a year the book could have been published

**Reviewer:** Claude (acting as Reviewer; round 1 by an independent reviewer agent, round 2 by the same session after the fixes)
**Date:** 2026-10-20

## Quality gates (full workspace)
- [x] `pnpm -r --no-bail typecheck`, `lint`, `build`: every package clean.
- [x] `pnpm -r --no-bail test`: seeder 231, web 450, schemas 168, trust 64, promoter 38, librarian 44, shelves 29, indexer 28, relay 22, ui 20, search 16, guide-lint 13, api 1010 + 13 skipped. One api test (`GET /api/books > recent shelf (no slugs) returns newest first`) failed 2 of 4 runs with a transport error (`Parse Error: Expected HTTP/`) and passed on the others. This story changes nothing under `apps/api` or `packages/`; it is a pre-existing flake, noted for follow-up.
- [x] Red set at `31dbf64`: 77 failing for the missing behavior, typecheck clean. Round-1 red additions: 17 failing before the fixes.

## Spec adherence (ADR 0092)
- [x] §1 `judgeYear`: floor inclusive, company strictly under 10 years and only from editions up to the current year, the stored year's duplicates are not company, replacement from `[floor, currentYear]`. Constants 20 and 10.
- [x] §2 `authorBirthFor` counts a birth year only when the author record's name is the record's author (Homer re-spelled is tested); `birthYearOf` gives none for BC, B.C., BCE, B.C.E.
- [x] §3 `fetchWorkEvidence` / `fetchAuthors`: batches of 100, exact `q`, `fields` and `limit`, the seeder User-Agent, throw on HTTP error. `workEvidenceOf` is the one doc reader for seed and repair.
- [x] §4 `years.js`: dry run by default, `--apply` needs `LIBRARIAN_NSEC` (a mismatched `LIBRARIAN_PUBKEY` throws), signature-verified librarian events only, the whole plan before any publish, each record re-read and verified before its publish (`stale` skips), exit non-zero on a refused publish or a stale skip.
- [x] §4 Only the year changes: tags equal but the `year` value, content equal, `json` payload equal but `bookSubmission.publishYear` (only `submittedBy: null` may be added). Payload-only drift is refused (tested for an unknown `bookSubmission` key and a changed `word.wordTypes`).
- [x] §5 The seed requests `publish_year`, fetches first authors after dedup, and judges each record before the blurb and the fingerprint.
- [x] §6 Staging ops `years-check` / `years-fix`, Dockerfile `years.js`, esbuild entry, DEPLOY.md.
- [x] Crypto only through nostr-tools (`finalizeEvent`, `getPublicKey`, `verifyEvent`, nip19 `decode`).
- [x] The story-55 scope guard now exempts only the two ops entrypoints that read the catalog by design (`recast.ts`, `correct-years.ts`); the seed and every other module stay publish-only.

## Findings
### Round 1 (independent reviewer): FAIL, one blocking
#### Blocking
1. `correctedRecordTemplate` compared the rebuilt record with itself through the schema, never the original `json` payload, so unknown `bookSubmission` keys or a changed `word` wrapper would have been silently rewritten. **Fixed:** the payload is compared directly; tests added.
#### Non-blocking (all fixed)
2. Candidates were trusted to be the librarian's because of the relay filter alone. **Fixed:** the planner takes the librarian and drops other pubkeys; the entrypoint verifies every signature, including the re-read before each publish.
3. A rebuild throw in the apply loop would have aborted mid-run. **Fixed:** counted as failed, the run goes on (tested).
4. A future-dated edition counted as company. **Fixed** (tested).
5. "BCE" read as a birth year. **Fixed** (tested).
6. A record could change on the relay between the plan and its publish. **Fixed** in code rather than a doc note: re-read before publish, `stale` skip, non-zero exit (tested).
7. The entrypoint and ops wiring tests are structural. Accepted: the behavior they wire is tested in the pure modules, and the live dry run below exercises the entrypoint end to end.

### Round 2: PASS
_No new findings._ Red-set note: the round-0 User-Agent assertion expected `Unbnd`, but the existing `SEEDER_USER_AGENT` is lowercase; fixed in the Implementer commit.

## Live dry run (acceptance check, read-only)
Run from this worktree with only the librarian's public key against `wss://dcosl.brainstorm.world` and Open Library on 2026-10-20: 11,282 records read, all 11,282 signature-verified as the librarian's; `corrections=255 kept=40 unresolved=1 no-evidence=73 refused=0`, identical before and after the round-1 fixes. Publishes: 0.

Every year it would change, plus the kept and unresolved records, is in the hand-over list for Avi (outside the repo). Gulliver's Travels, Hamlet, The Canterbury Tales and the Odyssey are untouched. Macbeth moves 1508 → 1606 (1508 is before Shakespeare was born). Known near misses Avi may want to correct by hand: The Boys from Brazil 1969 (true 1976), Lipstick Jungle 2001 (2005), A Tale of Two Cities 1832 (1859), The Pickwick Papers 1832 (1836), The Old Curiosity Shop 1832 (1841).

## Owed after merge and deploy
`years-check` on staging (should match the list), Avi's OK on the list, then `years-fix`, then `index`; a second `years-check` lists no `correct` lines; spot-check `/api/books/ol-ol5734023w` (Step on a Crack) reads 2007.

## Verdict
**PASS.**
