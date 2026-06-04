# Review: Story 52 — Populate book blurbs from Open Library

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-04
**Story:** `engineering-team/stories/done/52-book-blurbs-openlibrary.md`
**ADR:** `engineering-team/decisions/0051-book-blurbs-openlibrary.md` (Accepted)
**Test plan:** `engineering-team/stories/done/52-book-blurbs-openlibrary.test-plan.md`
**Diff:** `git diff origin/main...HEAD` (impl commit `86d5c8e`; tests `412b0c0`)
**PR:** #97 (`story-52-book-blurbs`)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass.** All 10 projects Done, exit 0.
- [x] `pnpm --filter @unbnd/seeder test` — **pass.** `Test Files 7 passed (7)`, `Tests 51 passed (51)`. Breakdown: 39 new (description 27, desc-cache 5, checkpoint-epoch 7) + 12 pre-existing (checkpoint 3, openlibrary 5, headers 1, taxonomy 3). (The prompt's "36 new" is the test-plan's red-time *failing* count; 3 checkpoint-epoch key-shape tests passed against the flat store at red time, so the new-test total is 39, all green now.)
- [x] `pnpm --filter @unbnd/ui test` — **pass.** `13 files / 20 tests` — every design-system guard (`architecture-*`) + `tokens.test.ts` green. (Run to confirm the guards weren't weakened; they weren't touched.)
- [x] `pnpm --filter @unbnd/web build` — **pass.** `tsc --noEmit` + `vite build` clean, 459 modules, built in 604ms.
- [x] `gh pr checks 97` — **all green.** "Typecheck, test, build" pass; "Validate Caddyfile" pass; "Visual regression" pass. No supertest flake encountered.
- [x] _Lint not configured — skipped._

## 1. Guard / test integrity — PASS

- The Implementer commit `86d5c8e` touches **only** `apps/seeder/src/{checkpoint,desc-cache,description,fetch,fingerprint,index}.ts` + `docker-compose.prod.yml`. No test file appears in its file list. (A `grep "test"` hit was a substring of the commit-message body, not a changed path.)
- `git diff 412b0c0 HEAD -- apps/seeder/test/` is **empty** — the Tester's four test files (`description.test.ts`, `desc-cache.test.ts`, `checkpoint-epoch.test.ts`, `_load.ts`) and the test-plan are byte-identical to the Tester's commit. No weakening, no `.skip`, no assertion relaxation.
- `git diff --name-only origin/main...HEAD | grep -E "packages/ui|tokens.test"` → **none.** No design-system guard or `tokens.test.ts` touched.
- I read the test bodies (`description.test.ts`, `checkpoint-epoch.test.ts`): the assertions are genuine and substantive (real over-strip guard, mid-word protection, single-U+2026, ≤max, all three fail-open cases, epoch isolation, fingerprint stability+sensitivity). Not gamed.

## 2. Spec conformance (impl read against ADR 0051) — PASS

**`description.ts`**
- `sanitizeDescription` applies all ADR rules in order: newline normalize → inline `([source][1])` strip → whole-line metadata strip (`[N]: url` ref blocks, `[-=*_]{3,}` rules, trailing `Source:/From:/Contains:` lines) → bare `[ref]` strip → markdown emphasis/backtick strip → 5 HTML entities → whitespace collapse + trim. The "does NOT over-strip" test passes: ordinary hyphens (`coming-of-age`) and non-footnote parentheticals (`(set in 1920s Paris)`) survive — confirmed by `it("does NOT over-strip ordinary prose…")` and the real-world end-to-end case.
- `capBlurb`: cap = **700** (`BLURB_MAX_CHARS`, pinned by test). Sentence-boundary-first (last terminator at/after `floor(limit*0.6)`, terminator kept), word-boundary fallback (`lastIndexOf(" ")`, never mid-word), trailing space/punct trimmed before a **single** `…`. I independently reproduced the function and verified `out.length <= 700` on every branch including the sentence branch worst case (cut at end of window → exactly 700) and the no-space single-token fallback (`lastSpace <= 0` keeps the `max-1` window + ellipsis = max). No off-by-one, never mid-word, no `word, …` artifact.
- `fetchWorkDescription` → `GET https://openlibrary.org/works/{id}.json`; handles `string`, `{type,value}`, and absent; `extractDescription` returns `null` for empty/whitespace; 8s `AbortController` timeout; **fail-open** (delegates to `requestWorkDescription` and returns `null` on `!ok`, never throws). The endpoint-shape test confirms the URL.

**`desc-cache.ts`** — JSON-lines at `DESC_CACHE_PATH`, keyed by `workId`, value `{raw: string|null}`. `set` persists; `get` returns the entry or `undefined`. The seed loop caches a **genuine `null`** (successful response, no description) but the loop **never calls `set` on a transient failure** — so a network error stays an absent entry and retries. Corrupt-line tolerance (skip, don't abort). Matches ADR Decision 5.

**`fingerprint.ts`** — `node:crypto` `createHash("sha256")…slice(0,12)` over canonical fields (`title|authorName|blurb|coverUrl|publishYear|subjects`). **No hand-rolled crypto** (crypto-policy compliant; node:crypto is the ADR's explicit acceptable fallback). Tests confirm stable on identical content and changes when the blurb changes.

**`checkpoint.ts`** — epoch namespacing via an in-file `e<epoch>:` prefix; a handle for epoch N sees only epoch-N keys; legacy unprefixed lines read as epoch 1 (backward compat); other epochs' lines preserved in the file (audit/rollback). Existing `has/add/size` surface intact; the 3 pre-existing checkpoint tests + 7 epoch tests pass. Tag-taxonomy and genre-assertion checkpoint behavior unchanged in shape (now epoch-scoped).

## 3. Backfill idempotency (the key design point) — PASS

Reasoned through the seed loop (`index.ts` 131–181):
- **Bumped epoch re-publishes every record once.** Under `CHECKPOINT_EPOCH=2`, the epoch-2 handle does not see any epoch-1 key, so `checkpoint.has("book:<slug>:<fp>")` is false for all ~2k records → each re-publishes. The d-tag is the deterministic `slug` (`mapWorkToBookRecord` → `deriveSlug`), so `kind:39999 : librarian : slug` replaces **in place** — no duplicates. After publish, `checkpoint.add("book:<slug>:<fp>")`.
- **A second identical run re-publishes nothing.** Same OL data (served from `desc-cache`, no OL re-hit) → same `record` → same `fingerprint` → `book:<slug>:<fp>` already present → `has` true → skip. Idempotent.
- **A record whose blurb changed re-publishes.** Different blurb → different fingerprint → new `book:<slug>:<fp>` absent → re-publish. Confirmed by the fingerprint blurb-sensitivity test and the checkpoint changed-fp test.
- **Loop sets `blurb` only when non-empty** (`const blurb = capBlurb(sanitizeDescription(raw)); if (blurb) record = {...record, blurb};`) and **publishes records without a blurb when OL has none** — the `if (raw !== null)` block is skipped, the record publishes as-is, fail-open never drops a record. A fetch failure logs a transient warning and publishes without a blurb. Matches ADR Decision 5 and the story's "optional/absent" + "backfill never drops a record" criteria.

## 4. Scope — backend/data only — PASS

`git diff --name-only origin/main...HEAD` non-doc files: only `apps/seeder/src/*` (6), `apps/seeder/test/*` (Tester's, unchanged), and `docker-compose.prod.yml`. **No change** to `packages/schemas`, `apps/web`, `packages/ui`, `apps/api/src/books/effective.ts`, or `apps/indexer`. Compose: `CHECKPOINT_EPOCH=${CHECKPOINT_EPOCH:-1}` and `DESC_CACHE_PATH=/data/desc-cache` added to the **`seed`-profile** seeder block, both pathed under `/data` on the existing `seeder-data` volume — correct, no new volume.

## 5. The deviation (`requestWorkDescription`) — SOUND, within ADR Decision 5

The Implementer added an internal `requestWorkDescription(workId, opts): Promise<{ok:true; raw:string|null} | {ok:false}>` and made `fetchWorkDescription` a thin wrapper that collapses `{ok:false}` → `null`. This is correct and necessary:
- The test contract requires `fetchWorkDescription` to be **fail-open** (HTTP error / thrown / timeout → `null`, never throw) — preserved exactly.
- But the loop must distinguish a **genuine no-description** (`{ok:true, raw:null}` → cache as `null`, a HIT, don't retry) from a **transient failure** (`{ok:false}` → don't cache, retry next run) — which a bare `null` from `fetchWorkDescription` cannot express. The discriminated result is the minimal, well-named way to carry that one extra bit. The loop calls `requestWorkDescription` directly; `fetchWorkDescription` remains the public fail-open helper the tests pin. No behavior outside ADR Decision 5; this is the literal mechanism the ADR describes ("do not write a null cache entry on a network error — only cache null for a successful response that genuinely has no description").

## 6. Politeness — PASS

After every **real** OL fetch the loop `await sleep(rateMs)` (default 250ms); on a **cache hit** the fetch and the sleep are both skipped. The disk cache short-circuits re-runs entirely (and survives an epoch bump, since the cache governs fetching and the epoch governs publishing). Single 8s-bounded request per uncached work. No unbounded hammering.

## 7. Operator runbook — PASS

ADR 0051 §"Operator runbook" documents: (1) `docker compose --profile seed pull seeder` (the `:latest` staleness gotcha), (2) `CHECKPOINT_EPOCH=2 docker compose --profile seed run --rm seeder` (idempotent in-place replace; second run no-ops; cache avoids re-hitting OL), (3) `docker compose --profile index run --rm indexer` re-index (upsert by `id=slug`), (4) live verify. Accurate against the implemented env vars and the `seed`/`index` profiles in `docker-compose.prod.yml`.

## DList integrity

- Kind `39999` book record via the existing `toBookRecordEvent`; blurb written into `content` (no new tag, no new kind, no d-tag change). Genre assertions and tag taxonomy via existing builders. Matches ADR.
- Librarian pubkey resolved at **runtime** from `LIBRARIAN_NSEC` (`decode` → `getPublicKey`); no hardcoded npub/hex. Header addresses built from the runtime librarian.
- Concept header references use stable `kind:pubkey:slug` addresses (`buildBookRecordsHeaderAddress(librarian)` etc.). No change.

## Things tests can't catch

- No secrets committed (`LIBRARIAN_NSEC` stays an env var on the worker-only `seed` profile).
- No leftover debug `console.log` of note — only intentional `[seeder]` progress/warn lines consistent with the existing seeder.
- No commented-out code.
- Error paths: fetch fail-open, JSON parse guarded, corrupt cache line skipped, 8s timeout. Edge cases (empty/whitespace, absent, over-cap, no-space token) covered.
- Concurrency: the seed loop is strictly sequential (awaited); no shared mutable race. Checkpoint/cache are append-only single-writer files.

## House rules

- PRD §11.3 scope: nothing out-of-scope; population only, no new UI, no read-more, no full-description storage.
- POV-first: untouched — the canonical librarian blurb is the base layer; the verified-author overlay and read-time trust filtering are unchanged.
- No new lint/typecheck/build tooling. No new top-level dependency (`node:crypto` is stdlib).

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/seeder/src/fingerprint.ts:38`** — Stale comment: the inline comment reads `// ASCII unit separator, absent from the field values` but the code is `.join("")` (empty string, not a `` separator). The fingerprint is still stable and adequate for change-detection (sha256 over concatenated fields with no separator), and all fingerprint tests pass, so this is cosmetic only. Optional: either drop the misleading comment or actually join on `""` (the latter would marginally harden against field-boundary aliasing, e.g. `title="ab",author="c"` vs `title="a",author="bc"`). Not a correctness defect for the catalog's data shape; left to the author's discretion in a future touch.

## Verdict
**PASS** — The diff conforms to ADR 0051 and the story's acceptance criteria, all gates are green, the Tester's tests are intact and genuine, the backfill is idempotent and surgical, the `requestWorkDescription` deviation is sound and within Decision 5, and scope is backend/data-only with no schema/web/ui/overlay/indexer change. One non-blocking stale comment noted.
