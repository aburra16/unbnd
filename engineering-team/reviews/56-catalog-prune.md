# Review: Story 56 — Prune existing catalog junk via a read-time filter

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-05
**Story:** `engineering-team/stories/done/56-catalog-prune.md`
**ADR:** `engineering-team/decisions/0055-catalog-prune.md` (Accepted — read-time filter, incl. Refinement 2026-06-05 dropping the cover signal)
**Test plan:** `engineering-team/stories/done/56-catalog-prune.test-plan.md`
**Diff:** `git diff 5794625...df7a98e` (red `b2c1071`, green+refinement `df7a98e`)
**PR:** #102 (`story-56-catalog-prune`)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** 10 of 11 workspace projects, all Done (schemas, search, ui, indexer, promoter, seeder, trust, web, shelves, api).
- [x] `pnpm -r test` — **PASS.** All packages green:
  - `@unbnd/schemas`: 145 passed (13 files) — incl. new `junk-record.test.ts` (33).
  - `@unbnd/indexer`: 14 passed (4 files) — `build-documents-junk.test.ts` (5), `flush-before-upsert.test.ts` (3), `build-documents.test.ts` + `relay.test.ts` unchanged-green.
  - `@unbnd/seeder`: 133 passed (16 files) — `gate.test.ts` **37 green, unmodified**.
  - `@unbnd/api`: 790 passed, 10 skipped (88 files) — `effective.test.ts` (6).
  - web 307, ui 20, search 11, trust 23, promoter 28, shelves 26 — all green.
- [x] `pnpm --filter @unbnd/web build` — **N/A.** No `apps/web` change in the diff (scope verified below).
- [x] `gh pr checks 102` — **all green:** Typecheck/test/build (pass), Validate Caddyfile (pass), Visual regression (pass, zero-diff). `mergeable: MERGEABLE`.
- [ ] _Lint not configured — skipped._

## Test integrity — the mid-flight refinement (extra scrutiny)

The build had a documented SPEC REFINEMENT (ADR 0055 "Refinement (2026-06-05)") that dropped the "missing cover" junk signal, editing test files. I diffed the red set (`b2c1071`) against head (`df7a98e`) for every test-file change.

**`git diff b2c1071 df7a98e -- '**/test/**' '**/*.test.ts'` — exactly THREE files changed, all cover-flips:**

1. **`packages/schemas/test/junk-record.test.ts`** — the `describe("isJunkRecord — cover signal (positive junk)")` block became `describe("isJunkRecord — cover is NOT a junk signal (ADR 0055 Refinement)")`; its two assertions flipped:
   - `isJunkRecord(noCover, …)` `.toBe(true)` → `.toBe(false)` (absent cover kept)
   - `isJunkRecord({…coverUrl:""}, …)` `.toBe(true)` → `.toBe(false)` (empty cover kept)
   No other assertion in the file touched.
2. **`apps/indexer/test/build-documents-junk.test.ts`** — `it("excludes a record with a missing cover")` → `it("indexes a record with a missing cover (cover is not a junk signal)")`; the single assertion flipped `expect(docs.map(d=>d.id)).not.toContain("no-cover")` → `.toContain("no-cover")`. No other assertion touched.
3. **`apps/api/test/books/effective.test.ts`** — the `it("returns null for a record missing a cover")` test (asserting `parseBook(e) → null`) was removed and replaced with `it("returns a PublicBook for a record missing a cover …")` asserting `parseBook(e)` is not null and `slug === "no-cover"`. Same fixture, opposite (refined) expectation.

**Verdict on test integrity: CLEAN.** The ONLY test edits are (a) the three documented cover-case flips applying ADR 0055's refinement (cover-less is KEPT, not junk), and (b) nothing else. Confirmed:
- No junk→null/skip case was removed or weakened. The denylist-title, missing/whitespace title, missing/whitespace author, present-year<1800, and present-year>currentYear cases all survive and still assert junk (`junk-record.test.ts` title/author/denylist/year blocks; `effective.test.ts` denylist + both year cases; `build-documents-junk.test.ts` denylist + out-of-range-year cases).
- No pre-existing fixture was modified: `git diff b2c1071 df7a98e` shows **0 changes** to `books.test.ts`, `foryou.test.ts`, `homepage-shelves.test.ts`, `books-claimants.test.ts`, `profile-claimed-books.test.ts`, `build-documents.test.ts`. The whole-story diff (`5794625..df7a98e`) adds only the new junk test files + loaders and edits only those three cover files.
- The cover-flips match ADR 0055's Refinement exactly: cover-less is legitimate at `parseBook` (community submissions / author overlays where `coverUrl` is optional) and renders with the gradient fallback rather than being hidden.

## The oracle (the read-time correctness check) — `packages/schemas/src/BookRecord.ts`

`isJunkRecord(book, currentYear)` (lines 134–141) fires ONLY on:
- `!book.title?.trim()` — missing/empty/whitespace title.
- `!book.authorName?.trim()` — missing/empty/whitespace author.
- `JUNK_TITLE_RE.test(book.title)` — denylist title.
- `typeof y === "number" && (y < 1800 || y > currentYear)` — a **present** `publishYear` out of range.

It does NOT check cover (refinement applied) and does NOT read `edition_count` / `language` / `pageCount`. Pure, deterministic, I/O-free (`currentYear` injected). Independent false-positive reasoning confirmed against the suite: `A Study in Scarlet`, `Notes from Underground`, and a bare `Summary` are KEPT (denylist is segment-anchored); cover-less / absent-year / absent-language records are KEPT (absence ≠ junk); denylist titles, no-title/no-author, and impossible present years are FLAGGED. **Oracle: CORRECT.**

## One denylist (no duplication)

`grep -rn "JUNK_TITLE_RE"` shows a single definition: `packages/schemas/src/BookRecord.ts:105`. `apps/seeder/src/gate.ts` `import { JUNK_TITLE_RE } from "@unbnd/schemas"` then `export { JUNK_TITLE_RE }` (re-export keeps the public name). The relocation diff removed the local definition and changed nothing in `EDITION_MIN` / `YEAR_MIN` / `PAGE_MIN` / `gateWork` / `gateReason`. Seeder `gate.test.ts` (37) green, unmodified. **ONE denylist: CONFIRMED.**

## Indexer skip + flush

- `build-documents.ts`: imports `isJunkRecord`; after the parse guard, `if (isJunkRecord(rec, currentYear)) { skipped++; continue; }`; counts and logs `[indexer] skipped N junk records`. `currentYear` is a defaulted last param (preserves the existing 3-arg `build-documents.test.ts` call — still green).
- `index.ts`: threads `new Date().getUTCFullYear()` into `buildSearchDocuments`; the orchestration body is extracted into `runIndex`.
- `run-index.ts` (new): `configureIndex() → deleteAll() → upsert loop` IN THAT ORDER — flush before upsert. `provider.deleteAll()` is declared on the `SearchProvider` interface (`packages/search/src/types.ts:84`) and the meili impl tolerates 404 (`meili.ts:108`, empty/first-run index). `flush-before-upsert.test.ts` asserts exactly: deleteAll called once, after configureIndex, before the first index, even on zero docs. **Flush ordering: CONFIRMED, matches the test.**

## API parseBook null + the `.map` index-leak fix (EXHAUSTIVE grep)

`parseBook` (`effective.ts:58–72`): `currentYear` defaulted; after `fromBookRecordEvent`, `if (isJunkRecord(record, currentYear)) return null;` before `toPublicBook`. Junk → null.

**The real bug.** The new second param means `Array.prototype.map(parseBook)` would pass the array index as `currentYear` (e.g. index 0 makes every present year > 0 → "out of range" → every book flagged junk). The Implementer fixed three bare sites: `books.ts:57`, `books.ts:119`, `author-edits.ts:122` — all now `.map((e) => parseBook(e))`.

**Exhaustive `parseBook` grep across `apps/api/src` (every usage):**
- `effective.ts:58` — definition.
- `books.ts:15` — re-export.
- `books.ts:57` — `bookEvents.map((e) => parseBook(e)).find(...)` ✓ wrapped.
- `books.ts:107` — `const b = parseBook(e);` (loop) ✓ single-arg.
- `books.ts:119` — `.map((e) => parseBook(e)).filter(...)` ✓ wrapped.
- `author-edits.ts:122` — `.map((e) => parseBook(e)).find(...)` ✓ wrapped.
- `foryou.ts:249` — `const b = parseBook(e);` (loop) ✓.
- `profile-claims.ts:79` — `const b = parseBook(e);` (loop) ✓.
- `homepage-shelves.ts:88` — `const b = parseBook(e);` (loop) ✓.
- `shelves.ts:104` — `const b = parseBook(e);` (loop) ✓.

`grep -rn "\.\(map\|forEach\|filter\|flatMap\)(parseBook)"` → **NONE.** No bare `.map(parseBook)` / `.forEach(parseBook)` / `.filter(parseBook)` remains. The fix is complete.

**Seven direct-relay surfaces all funnel through `parseBook` and drop nulls:** recent/home + batch hydrate + detail (`books.ts`), house shelves (`homepage-shelves.ts`), For-You (`foryou.ts`), user shelves (`shelves.ts`), claimed books (`profile-claims.ts`); plus author-edit read-back (`author-edits.ts`). Each loop site is `if (b && !bySlug.has(b.slug)) …`; the `.find`/`.filter` sites drop nulls by predicate. Book detail returns 404 (route already 404s when no book parses; a junk slug now parses to null).

## Scope

`git diff 5794625 df7a98e --stat` — source changes confined to:
- `packages/schemas/src/BookRecord.ts` — added `JUNK_TITLE_RE` + `isJunkRecord` only. **No BookRecord SHAPE change** (no field added/changed; grep on the type body confirms).
- `apps/seeder/src/gate.ts` — re-export only; `gateWork`/`gateReason`/`EDITION_MIN` byte-unchanged.
- `apps/indexer/src/build-documents.ts`, `index.ts`, new `run-index.ts`.
- `apps/api/src/books/effective.ts` (parseBook null), `routes/books.ts` + `routes/author-edits.ts` (**only** the `.map` index-leak fix — no other route edited).

No relay deletion, no kind-5, no NIP-09, no down-sync filter change, no strfry dependency, no new seeder relay capability (`grep` for kind-5/down-sync/strfry additions → NONE). No web/design-system change, no `packages/search` change, no serializer change. **Scope: CLEAN.**

## House rules

- **POV-first:** the oracle is a global structural-integrity check ("is this a real catalog record"), not a trust/popularity/per-POV judgement — the same class of validity check `parseBook` already performs when it drops an unparseable record. It reads no rating/trust/readership. Compliant.
- **PRD §11.3 scope discipline:** nothing out-of-scope sneaks in (no payments/hosting/social/etc.).
- **No new tooling:** Vitest only; no new lint/build target.
- **No-slop copy:** the one new log string `[indexer] skipped N junk records` is plain, no banned tokens. The new comments are technical and clean.
- **No hardcoded librarian pubkey, no crypto:** n/a — this work signs/publishes nothing; tests use a synthetic `LIB` hex fixture only.

## Findings

### Blocking
None.

### Non-blocking
1. **`engineering-team/stories/done/56-catalog-prune.test-plan.md`** (Contracts table line ~26, Coverage map lines ~39/46, Verification block) still describes "missing/empty `coverUrl`" as a positive junk signal and reports the pre-refinement red counts. The ADR carries the Refinement; the test-plan markdown was not re-synced. This is documentation drift only — the actual test FILES correctly apply the refinement and all gates pass. Optional: a follow-up could re-sync the test-plan prose with the ADR refinement for the historical record. Not blocking the merge.

## Verdict
**PASS**

The diff matches the story, the ADR (including its 2026-06-05 cover refinement), and the test plan's load-bearing contracts. The only test edits are the three documented cover-flips; no junk case was weakened and no pre-existing fixture was modified. The oracle is correct and conservative, the denylist is defined once, the indexer skips + flushes in the asserted order, `parseBook` returns null for junk, and the `.map(parseBook)` index-leak is fully fixed (no bare reference remains). All quality gates and PR #102 CI checks (incl. visual zero-diff) are green.
