# Review: Story 55 — Catalog expansion to ~10K (search-API source + legitimacy gate + ISBN dedup + enrichment)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-04
**Diff:** `git diff 6031bec...addba66` (green commit `addba66`; red/test commit `e8d919d`)
**Story:** `engineering-team/stories/done/55-catalog-expansion.md`
**ADR:** `engineering-team/decisions/0054-catalog-expansion.md`
**Test plan:** `engineering-team/stories/done/55-catalog-expansion.test-plan.md`
**PR:** #100 (`story-55-catalog-expansion`)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS**. All 11 workspace projects Done (schemas, ui, search, indexer, web, promoter, seeder, trust, shelves, api).
- [x] `pnpm -r test` — **PASS**. Every suite reports "Test Files N passed". Seeder 117/117; schemas 112; web 307; api 784 (+10 skipped, integration); shelves 26; indexer 6; promoter 28; ui 20; search 11; trust 23. No failures. (The literal word "failed" appears only inside fixture log lines like `fail-open` / `publish failed` test descriptions, not in any suite result.)
- [x] `pnpm --filter @unbnd/seeder test` — **PASS**, **117 passed** (66 new = 37 gate + 11 mapping + 5 dedup + 5 search + 4 fingerprint + 4 scope-guard; 51 existing). The 4 scope-guard tests are **green** (no relay-read, no kind-5).
- [x] `pnpm --filter @unbnd/seeder build` — **PASS** (`tsc` clean).
- [x] `gh pr checks 100` — **all green**: Typecheck/test/build (1m46s), Validate Caddyfile, Visual regression (zero front-end diff).
- [ ] _Lint not configured — skipped._
- [ ] `pnpm --filter @unbnd/web build` — N/A (no `apps/web` change).

## Test integrity (critical)

`git diff e8d919d addba66 -- apps/seeder/test/` is **empty**. `git diff --stat e8d919d addba66` shows the green commit touched only `apps/seeder/src/*` (gate, search, dedup, openlibrary, index, fingerprint), `docker-compose.prod.yml`, `.env.production.example`, `docs/DEPLOY.md` — and **zero test files**. The Tester authored all 6 test files in `e8d919d`; the Implementer did not modify, weaken, or delete any assertion, and did not touch any other suite. **Test integrity confirmed clean.**

## Spec adherence

Every acceptance criterion maps to a passing test (cross-checked against the test plan's coverage map):

- **Source swap** — `fetchSubjectSearch` hits `/search.json` with `q=subject:<ol> language:eng`, `sort=readinglog`, the lean `fields=` set (all gate signals requested), `limit=100`. Verified in `search.test.ts` and by reading `search.ts`. ✅
- **Legitimacy gate** — all eight signals (title, author, cover-numeric, language-includes-eng, `edition_count >= 3`, pages absent-or-`>=50`, year `1800..currentYear`, denylist) covered with boundary fixtures (`gate.test.ts`, 37 tests). Pure / injected `currentYear` / no input mutation all asserted. ✅
- **Readership is a sort, not a cutoff** — `sort=readinglog` asserted; `gate.ts` reads no `readinglog_count`/`ratings_count`. ✅
- **Dedup by ISBN-13** — `dedupBooks` slug-first then ISBN-13 collapse onto first-seen slug (genres merged); no-ISBN slug-only kept (`dedup.test.ts`). ✅
- **Enrichment** — `mapSearchDocToBookRecord` sets `isbn13`/`isbn10`/`pageCount`/`language` + core fields; round-trips through `toBookRecordEvent`/`fromBookRecordEvent` (`search-mapping.test.ts`). ✅
- **Blurb path unchanged** — `index.ts` blurb block byte-unchanged from the prior epoch; existing `description.test.ts`/`desc-cache.test.ts` green. ✅
- **Enrich keepers in place** — slug derived stably from the work key; re-publish replaces via deterministic d-tag. **No relay-read, no kind-5** (scope-guard). ✅
- **Invariants** — UA + inter-page delay retained in the pager; checkpoint epoch / desc cache / rate-limit untouched. ✅
- **Fingerprint honest** — extended to include `isbn13`/`language`/`pageCount` (`fingerprint-enrichment.test.ts`). ✅
- **No out-of-scope change** — schemas, web, api, ui, indexer untouched. ✅

## ADR adherence

### The gate vs ADR 0054 §2 — VERDICT: exact match

- `EDITION_MIN = 3` (gate.ts:22). ✅
- `JUNK_TITLE_RE` (gate.ts:39-40) is **character-for-character identical** to the ADR §2 pinned regex: `/(?:^|[\s:(\[]|\s-\s)(?:summary of\b|study guide\b|workbook\b|sparknotes\b|cliffs?\s*notes\b|omnibus\b|box\s?set\b|boxed set\b)/i`. ✅
- Ordered signal checks (gate.ts:47-59) match the ADR's sequence and short-circuit; `gateReason` returns the first failing signal name. Absent-field handling matches: cover requires `typeof === "number"` (rejects `null`/absent), language `.includes("eng")` (absent fails), `(edition_count ?? 0) < 3` fails, pages absent passes / `<50` fails, year absent-or-out-of-range fails. ✅
- **Pure / no I/O** — only reads the doc + injected `currentYear`; no `Date` read, no fetch, no mutation. ✅

**Independent denylist false-positive reasoning** (ran the regex standalone against 27 titles):
- All junk forms DROP, including segment-anchored variants after `:`, `(`, `[`, and ` - ` (`Summary of: Dune`, `(Study Guide) Whatever`, `[Workbook] Stuff`, `Title - Study Guide`), plus `Box Set` / `Boxset` / `Boxed Set` / `omnibus`.
- Legit titles KEEP: `A Study in Scarlet`, `Notes from Underground`, `Guide to the Galaxy`, bare `Summary`, plus partial-word guards `Workbookish`, `The Studyguide`, `Boxsetter`, `Cliffside Notes Cafe`, `Workbooks for Kids` — the `\b` boundary and `\s`/segment anchor correctly prevent over-match.
- The only false-DROPs are titles that genuinely carry a denylist phrase at a segment boundary (`My Summary of Accounts…`, `Omnibus Edition of Dune`). These are **exactly the documented, accepted tradeoff** in ADR §2 ("a novel literally titled… would be dropped… deliberate tradeoff… ~0.1–0.2%"). Not a bug. No over- or under-match beyond what the ADR pinned.

### Enrichment + mapping + dedup — VERDICT: matches ADR §3

- `isbn13` = first `/^(?:978|979)\d{10}$/` of `doc.isbn`; `isbn10` = first `/^\d{9}[\dXx]$/`, uppercased (openlibrary.ts:63-75). ✅
- `pageCount` from `number_of_pages_median` (number guard); `language` normalized to scalar `"eng"`; core fields (slug, title, author, cover URL, openLibraryId, publishYear, subjects) from the search-doc shape. ✅
- `mapSearchDocToBookRecord` stays pure, returns `null` on missing title/author (and missing `key`); the existing `mapWorkToBookRecord` is **untouched**. ✅
- `dedupBooks` (dedup.ts): slug-first, then ISBN-13 collapse onto first-seen slug with genres merged; no-ISBN kept slug-only. First-seen-wins identity is correct. ✅
- `toBookRecordEvent`/`fromBookRecordEvent` already serialize `isbn`/`isbn10`/`lang`/`pages` (`packages/schemas/src/BookRecord.ts:103-111`, `135-174`) — **no `@unbnd/schemas` change in the diff** (confirmed: `git diff --stat … packages/schemas` is empty). ✅

### Search fetch + paging — VERDICT: matches ADR §1; break-on-empty is correct

- `fetchSubjectSearch` (search.ts) builds the request with `URLSearchParams` (no raw concat), `q=subject:<ol> language:eng`, `sort=readinglog`, lean `fields=`, `limit=100`; reads `{docs:[]}`; gates **inside** the loop; accumulates to `target`; stops at `target` or `maxPages`. ✅
- **"break only on empty page (not short page)"** — sound. With `sort=readinglog`, OL returns full 100-doc pages until the result set is exhausted; a short-but-nonempty page can appear mid-stream, so breaking only on a fully empty page avoids premature termination while still detecting true subject exhaustion. **Infinite-loop safe**: the `for` header bounds the loop by `maxPages` unconditionally (`page < maxPages`), independent of the empty-page break — a zero-pass-rate genre caps at `maxPages` (asserted in `search.test.ts`). ✅
- OL politeness retained: `User-Agent` header on every request; `sleep(pageDelayMs)` between pages (skipped once the target is met). ✅

## Interpretation calls — judgments

**(a) `EDITION_MIN` env-var-vs-const "fail loudly on mismatch" (index.ts:66-72) — KEEP.**
The gate const in `gate.ts` is the single source of truth; the env exists only so the floor is *visible and auditable* in the deployment config, and a mismatch throws on boot with a message pointing the operator at `gate.ts`. This is sound, not a confusing knob: it cannot silently diverge (a stale `EDITION_MIN=2` in `.env` halts the seeder rather than misleading anyone into thinking they retuned the gate). It is the conservative choice consistent with the quality bar. No change recommended.

**(b) `fingerprint.ts` extension — correct.**
`FingerprintInput` and the canonical array gain `isbn13`/`language`/`pageCount` in the existing style; the 4 enrichment tests confirm different isbn13/language/pageCount → different fp and identical → identical. The pre-existing `.join("")` (no separator) and its stale "ASCII unit separator" comment are **carried from ADR 0051, not introduced here** (verified in the diff) — out of scope for Story 55, noted non-blocking below.

**(c) The dormant subjects-API code — RECOMMENDATION: leave dormant in this PR; PRUNE as a Story-56 follow-up (do NOT block #100).**
Reasoning:
- The dormancy is **partial, not total.** `fetch.ts` is the **canonical home of `SEEDER_USER_AGENT`**, which both `search.ts` and `description.ts` import; `fetch.ts` cannot be deleted wholesale without first relocating that constant. Only `fetchSubjectWorks` is off the seed path. In `openlibrary.ts`, `mapWorkToBookRecord`/`OLWork` are off the seed path, but `OLWork` is still the type backing `fetchSubjectWorks`. So a clean prune is a small but real refactor (move `SEEDER_USER_AGENT` to a neutral module, then drop `fetchSubjectWorks` + `mapWorkToBookRecord` + `OLWork` + their `openlibrary.test.ts` cases), not a one-line deletion.
- The quality bar (we just shipped Story 54 removing dead fixtures) genuinely argues for removing it — this is dead code with live tests (`openlibrary.test.ts` exercises `mapWorkToBookRecord`).
- But the subjects-API path is **not a documented fallback** anywhere in ADR 0054; the ADR explicitly rejects the subjects API (Option C) and says "fetch.ts may be removed or left dormant; the Implementer keeps the surface minimal." The Implementer chose dormant, which is *within* the ADR's stated latitude. So leaving it is defensible against the ADR, even if the quality bar prefers removal.
- It does **not** affect correctness, the gate, the seed output, or any acceptance criterion, and its tests pass. Pruning it now would widen this PR's blast radius (a token-relocation refactor + test deletions) for zero behavioral gain on the story's scope.

**Net:** non-blocking. Recommend a tight follow-up story/chore to (1) relocate `SEEDER_USER_AGENT` to a neutral module, (2) delete `fetchSubjectWorks`, `mapWorkToBookRecord`, `OLWork`, and their `openlibrary.test.ts` cases. That keeps Story 55 focused and honors the dead-code bar without coupling it to the merge of #100.

## Scope + wiring

- `index.ts` wires search → gate (inside pager) → dedup → map → existing publish + blurb + checkpoint, with blurb/desc-cache/politeness/rate-limit intact, **kind-39999 only**, no relay-read, no kind-5. ✅
- New env knobs `PER_SUBJECT_TARGET` (1250) / `MAX_PAGES` (60) / `EDITION_MIN` (3) / `CHECKPOINT_EPOCH=4` wired into `index.ts` config, `docker-compose.prod.yml`, `.env.production.example`, and `docs/DEPLOY.md`. ✅
- `PER_SUBJECT` removed cleanly — the only remaining occurrence is a single explanatory comment in `docker-compose.prod.yml` ("PER_SUBJECT (the old raw-count knob) is replaced"); no live reference. ✅
- No change to `apps/web`, `packages/ui`, the API, or `@unbnd/schemas` (diff-confirmed). ✅
- Librarian pubkey resolves at runtime from `LIBRARIAN_NSEC`; no hardcoded npub/hex; no secrets, no debug logging, no TODOs in the changed source. ✅
- Signing stays on the `finalizeEvent` (`nostr-tools/pure`) librarian path — no bespoke crypto; `fingerprint` uses `node:crypto`. ✅

## House rules check

- [x] PRD §11.3 out-of-scope: nothing sneaks in (seeder + re-index only; no file hosting/payments/social/etc.).
- [x] Prune (relay-read + kind-5) correctly **deferred to Story 56**, which remains in Backlog and is not touched by this PR.
- [x] No new dependency, no new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/seeder/src/fetch.ts`, `apps/seeder/src/openlibrary.ts` (`mapWorkToBookRecord`/`OLWork`)** — dead subjects-API path with live tests. Recommend a follow-up chore to relocate `SEEDER_USER_AGENT` and prune the dormant functions + `OLWork` + their `openlibrary.test.ts` cases, per the dead-code quality bar. Not a blocker for #100 (within the ADR's stated latitude; zero behavioral impact).
2. **`apps/seeder/src/fingerprint.ts:45`** — the `.join("")` (no delimiter) and its stale "ASCII unit separator" comment are pre-existing (ADR 0051), not introduced by Story 55. The empty join is a latent theoretical collision risk for change-detection only (not a security boundary). Out of scope here; worth a one-line fix in a future seeder touch (use a separator that cannot appear in a field, e.g. ``, and fix the comment).
3. **`apps/seeder/src/index.ts:143`** — `mapSearchDocToBookRecord(doc, booksHeader)?.isbn13` constructs a full `BookRecord` per collected doc just to read `isbn13` for the dedup key (the record is rebuilt again at publish time). Minor, harmless allocation; a small `selectIsbn13`-only helper would avoid the double map. Optional.

## Verdict
**PASS**
