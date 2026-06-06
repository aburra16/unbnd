# Review: Story 64 — Open Library metadata autofill + cover preview on submit

**Story:** `engineering-team/stories/done/64-submit-autofill.md`
**ADR:** `engineering-team/decisions/0063-submit-autofill.md`
**Test plan:** `engineering-team/stories/done/64-submit-autofill.test-plan.md`
**PR:** #109 — branch `story-64-submit-autofill`, head `0315149`
**Date:** 2026-06-06
**Verdict:** **PASS**

This is the last Block E item. It adds a public, best-effort, always-200 `GET /api/ol/lookup?isbn=` endpoint, web autofill of five controlled fields, a cover preview with an `onError`→gradient fallback, and a deliberate `submit.png` baseline. Two things got extra scrutiny: (a) an orchestrator test-fix (injectable timeout + abort-test rewrite), and (b) the deliberate baseline change.

## Gates (run independently)

| Gate | Command | Result |
|---|---|---|
| API tests | `pnpm --filter @unbnd/api test` | **872 passed, 10 skipped, 0 failed** (96 files); `ol-lookup.test.ts` **21 green** |
| Web tests | `pnpm --filter @unbnd/web test` | **323 passed, 0 failed** (54 files; incl. new submit-autofill 14 + api-ol-lookup 2) |
| UI guards | `pnpm --filter @unbnd/ui test` | **20 passed** (13 files; all twelve `architecture-*` guards green, incl. palette-sync) |
| Typecheck | `pnpm -r typecheck` | **clean** (0 `error TS`, all 12 projects Done) |
| Web build | `pnpm --filter @unbnd/web build` | **built** (461 modules, no errors) |
| PR checks | `gh pr checks 109` | **all 3 green** — Typecheck/test/build PASS, Validate Caddyfile PASS, **Visual regression PASS** |

The `errors.test.ts` "internal detail that must not leak" line in API output is an intentional fixture log inside a passing test, not a failure.

## 1. Test integrity (extra scrutiny — a test was touched) — FAITHFUL, not weakening

`git diff 0eb483c HEAD -- '**/*.test.ts' '**/*.test.tsx'` shows the **only** test change is in `apps/api/test/routes/ol-lookup.test.ts`. The web/ui test files are **byte-identical** to the red set (`git diff 0eb483c HEAD --stat` over `apps/web/**/*.test.*` and `packages/**/*.test.*` is empty). The fixture file change (`fixtures/index.ts`) is not a test file — it swaps the locally-declared `OlLookup` type for `import type { OlLookup }` now that the real export exists (the Tester left a comment instructing exactly this).

The two changes in `ol-lookup.test.ts`:

1. `makeApp` gains an optional forward:
   ```diff
   -async function makeApp(fetchImpl: FetchImpl) {
   +async function makeApp(fetchImpl: FetchImpl, opts?: { timeoutMs?: number }) {
   ...
   -  app.use("/", buildOlLookupRouter({ fetchImpl }));
   +  app.use("/", buildOlLookupRouter({ fetchImpl, ...opts }));
   ```
   Purely additive; default callers unchanged.

2. The hung-OL abort case rewritten:
   ```diff
   -    vi.useFakeTimers();
   -    try {
   -      const app = await makeApp(hangingFetch());
   -      const pending = request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
   -      await vi.advanceTimersByTimeAsync(6000);
   -      const res = await pending;
   -      expect(res.status).toBe(200);
   -      expect(res.body).toEqual({ found: false });
   -    } finally {
   -      vi.useRealTimers();
   -    }
   +    const app = await makeApp(hangingFetch(), { timeoutMs: 20 });
   +    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
   +    expect(res.status).toBe(200);
   +    expect(res.body).toEqual({ found: false });
   ```

**Assessment: faithful, not weakening.** The assertions are identical (`status === 200`, `body === { found: false }`) — neither was removed, loosened, or `.skip`-ed. The rewrite swaps a *broken* mechanism (`vi.useFakeTimers()` does not compose with supertest's real socket I/O — the fake-timer version never actually exercised the abort) for a **stronger, real** one: a 20ms injected timeout fires the route's real `controller.abort()` against a `hangingFetch()` that resolves only on abort, so the catch genuinely resolves `{ found:false }`. This exercises the real abort path end-to-end, which the prior version could not. The injectable `timeoutMs` is the production seam (below), used by exactly one test. The sibling "passes an AbortSignal to the OL fetch" test is unchanged.

## 2. The injectable-timeout production change — additive, contract unchanged

`apps/api/src/routes/ol-lookup.ts`: `buildOlLookupRouter(deps: { fetchImpl?; timeoutMs? })` with `const timeoutMs = deps.timeoutMs ?? OL_TIMEOUT_MS;` (`OL_TIMEOUT_MS = 5000`). `timeoutMs` is used at one site only — `setTimeout(() => controller.abort(), timeoutMs)` (line 109). Production registration in `index.ts` passes no `timeoutMs`, so the default 5s behavior is unchanged. It does not touch the response contract, the OL URL, the UA, or any branch. Additive and safe.

## 3. `/api/ol/lookup` correctness — always-200, every failure → found:false

- **Always 200, never 5xx.** Bad/missing isbn → `200 {found:false}` with **no OL call** (line 97-99). Every OL failure mode is caught: non-2xx (`!ol.ok`, line 115), no doc (`!doc`, line 120), and the `try/catch` (line 124-126) covers unreachable/parse-fail/abort/timeout → `200 {found:false}`. No path returns a 5xx for an OL failure; `clearTimeout` in `finally`.
- **OL request** is the seeder's `search.json` narrowed to the five fields: `q=isbn:<normalized>`, `fields=title,author_name,cover_i,number_of_pages_median,first_publish_year`, `limit=1`, with the distinct polite `User-Agent: unbnd-api/0.1 (+https://unbnd.ink; submission metadata lookup)` and the `AbortController` signal.
- **Cover by ISBN:** `normalizeDoc` synthesizes `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` (always set when found), never by `cover_i`. Per ADR §1.
- **Pure functions:** `normalizeIsbnParam` (strip non-`[0-9Xx]`, accept 13/10, uppercase) and `normalizeDoc` (four-field map, `?.trim()` / `typeof === "number"` guards, absent fields omitted). Verified against the 21 unit tests.
- **Public route, no session:** registered `app.use("/", buildOlLookupRouter({ fetchImpl: fetch }))` with no config/session/trust deps, matching `/api/search`'s posture.

## 4. Web autofill + the uncontrolled→controlled migration — both tiers still submit

`Submit.tsx` lifts exactly five fields (`title`, `author`, `cover`, `year`, `pages`) to a controlled `fields` state seeded from `adding?.title`. **Both submit tiers submit the autofilled values:** `onSubmit` is unchanged — it reads `new FormData(e.currentTarget)` (line 201) and all five lifted inputs **retain their `name=`** (title L284, author L297, year L345, pages L359, cover L413). The `input` it builds drives the sovereign path (`api.submissions.template` → `nostr.signEvent` → `api.submissions.create`, L226-228) and the custodial path (`api.submissions.createCustodial`, L230) identically. The component tests assert the autofilled `SubmissionInput` reaches both `createCustodial` and the signing template — these guard the migration and are green.

- **Debounce:** 500ms (`OL_DEBOUNCE_MS`), keyed on the normalized ISBN-13-or-ISBN-10, with a `lookupSeq` ref dropping stale responses (L136, L142, L168). One lookup per settled ISBN.
- **Never-clobber (fill iff empty ∧ ¬dirty):** L159 — `if (value && prev[key] === "" && !dirty.has(key))`. Autofill writes do **not** add to `dirty` (only `editField` does, L118-125), so a user edit locks the field permanently; the effect depends on `[isbn, dirty]` so it reads fresh `dirty`.
- **Failed/empty lookup leaves the form usable:** `found:false` → `setAutofill("not-found")`, writes nothing; `.catch` → `not-found`, never crashes.
- **Affordance copy verbatim + slop-free:** "Filled from Open Library. Edit anything.", "No match on Open Library. Add the details by hand.", "Looking up this ISBN…" — no em dashes, no rhetorical contrast, no exclamation, plain bookstore voice. Passes the no-AI-slop rules.

## 5. Cover preview + fallback — guards green

`.sub-cover-preview` container holds an `<img class="sub-cover-img">` with `onError={() => setCoverBroken(true)}` / `onLoad` (resets), falling back to a `.sub-cover-fallback` gradient `<div>` (via `coverGradient(fields.title || adding.title || "submission")`) when the URL is empty **or** broken. `coverBroken` resets when `fields.cover` changes (L114-116) so fixing the URL re-attempts. Fixed 96×144 box in `Submit.css` (token-only: `var(--u-radius-5)`, `var(--u-elevation-3)`, `var(--u-space-*)`, `var(--u-font-size-*)`) — **no layout jank**. The gradient stops are runtime-derived from `coverGradient`, not literals (the `BookHeader`/`BookCard` pattern, proven guard-clean). The twelve `@unbnd/ui` guards are green; `<img>` is allowed (the svg guard bans `<svg>` only). This also closes the `onError` gap the existing covers lack, at this call site.

## 6. The deliberate `submit.png` baseline — only baseline, visual green, correct render

- `git diff 0eb483c HEAD --stat -- '**/*.png' '**/*-snapshots/*'` shows **only** `apps/web/e2e/visual/visual.spec.ts-snapshots/submit.png` (40735 → 116057 bytes). No other baseline changed.
- The baseline is its own labeled commit `0315149` ("Story 64: update submit.png baseline (deliberate visual change, ADR 0039)"), whose only file is `submit.png`.
- `gh pr checks 109` Visual regression job is **PASS** (zero-diff against the new baseline; ADR 0039 `maxDiffPixelRatio: 0`).
- The fixture change is scoped to the submit test: `fixtures/index.ts` adds the `OL_LOOKUP` matcher and the `submit` test uses `auth:"signed-in"`; no other test's fixtures or route map change, so the other 5 baselines stay zero-diff (the visual job confirms).
- **New render inspected** (read the PNG): signed-in, driven into the populated form — Title "The Fixture Novel", Author "A. Fixture", ISBN-13 `9780140328721`, Year 2021, Page count 320, Language English autofilled; the "Filled from Open Library. Edit anything." line; the cover preview showing the gradient fallback (the mocked `/api/ol/fixture-cover.jpg` resolves to JSON → `<img>` errors → fallback), fixed-size, no jank. This is the intended UI per ADR §5's recommended self-contained gradient-fallback capture.

## 7. Scope + house rules

- **No schema change:** `git diff` over `packages/schemas/**` and `apps/api/src/submissions/**` is empty — only existing optional fields populated.
- **Seeder untouched:** `git diff` over `apps/seeder/**` is empty.
- **OL-only, no auto-submit, no new dependency, no new primitive, no new tooling.** The endpoint uses platform `fetch`/`AbortController`; the preview reuses `<img>` + `coverGradient`.
- Full file set red→HEAD: `apps/api/src/index.ts` (+4), `apps/api/src/routes/ol-lookup.ts` (new), `apps/api/test/routes/ol-lookup.test.ts` (the test-fix), `apps/web/e2e/visual/fixtures/index.ts` (type-import swap), `submit.png` (baseline), `apps/web/src/lib/api.ts` (+ `OlLookup` + `api.ol`), `apps/web/src/routes/Submit.css` (token-only), `apps/web/src/routes/Submit.tsx`. All in scope.

## Findings

None blocking. Every acceptance criterion is covered by a green test, the ADR contract is met exactly, the touched test is faithful (assertions intact, mechanism strengthened), the production timeout change is additive, both submit tiers carry the autofilled values, the endpoint can never 5xx, and only `submit.png` changed (visual job green, new render correct).

## Verdict: PASS
