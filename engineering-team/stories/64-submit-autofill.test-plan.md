# Test Plan: Story 64 — Open Library metadata autofill + cover preview on submit

**Story:** `engineering-team/stories/64-submit-autofill.md`
**ADR:** `engineering-team/decisions/0063-submit-autofill.md`
**Date:** 2026-06-06

## Summary

Story 64 adds, per ADR 0063 (Option A):

1. A public, best-effort, **always-200** `GET /api/ol/lookup?isbn=<isbn>` endpoint that
   fetches Open Library `search.json` server-side (injectable `fetchImpl`, 5s
   `AbortController` timeout, distinct polite `User-Agent`) and normalizes one doc
   to `{ found, title?, authorName?, coverUrl?, pageCount?, publishYear? }` with the
   cover synthesized **by ISBN**.
2. `api.ol.lookup(isbn)` web client wiring.
3. Submit-form autofill: five fields (`title`, `author`, `cover`, `year`, `pages`)
   lifted to controlled state, a **500ms** debounce on a valid ISBN, the never-clobber
   rule (**fill iff empty ∧ ¬dirty**), honest affordances, and the load-bearing
   uncontrolled→controlled migration guard (submit still works for both tiers).
4. A cover preview `<img>` with an `onError` → `coverGradient` fallback.
5. A deliberate `submit.png` visual baseline change (the only baseline that changes).

## Contracts pinned from ADR 0063 (exact)

- **Endpoint:** `GET /api/ol/lookup?isbn=<isbn>`, public/no-session, **always 200**
  `{ found, title?, authorName?, coverUrl?, pageCount?, publishYear? }`. Never a 5xx.
- **OL request:** `https://openlibrary.org/search.json?q=isbn:<isbn>&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year` with header `User-Agent: UNBND_API_USER_AGENT` (contains `unbnd-api`, distinct from the seeder UA), bounded by a 5s `AbortController` signal.
- **Cover URL:** `https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg` (by ISBN, **not** by `cover_i`).
- **Failure → `200 { found: false }`** for: no match (`docs:[]`), non-2xx, fetch throw, parse-fail, abort/timeout, and malformed/absent isbn. A malformed/absent isbn resolves to `{ found:false }` **without** calling OL (no 400 — the form must always get a usable response).
- **ISBN normalization:** strip non-`[0-9Xx]`, accept length 13 or 10, uppercase (the `DuplicateCheck.normalizeIsbn` rule). Exposed as `normalizeIsbnParam`.
- **Module exports:** `buildOlLookupRouter({ fetchImpl? })`, `UNBND_API_USER_AGENT`, `normalizeDoc(doc, isbn)`, `normalizeIsbnParam(raw)` from `apps/api/src/routes/ol-lookup.ts`.
- **Web client:** `api.ol.lookup(isbn)` → `GET /api/ol/lookup?isbn=<encoded>`, returns the parsed `{ found, … }` body; `OlLookup` type exported from `apps/web/src/lib/api.ts`.
- **Autofill:** 500ms debounce; trigger on a valid ISBN-13 **or** ISBN-10; one lookup per settled ISBN (`seq`-guarded); fill **iff empty ∧ ¬dirty**; a user edit locks a field; autofill does not mark a field dirty.
- **Affordances (copy, verbatim, no AI-slop):**
  - Found: **"Filled from Open Library. Edit anything."**
  - No match: **"No match on Open Library. Add the details by hand."**
  - (In-progress "Looking up this ISBN…" is specced but not asserted in the red set — see Ambiguity.)
  - Container class `.sub-autofill-note` (the visual sentinel).
- **Cover preview:** an `<img>` inside a preview block (the tests scope to `.sub-cover-preview img`) bound to the controlled `cover` value, with `onError` → a `.sub-cover-fallback` gradient block. Empty cover → the fallback. A URL change clears the broken state and re-attempts the image.

## Coverage map

| Criterion (story AC) | Test name | Test file | Level |
|---|---|---|---|
| Known ISBN → normalized `{title?,authorName?,coverUrl?,pageCount?,publishYear?}` | `returns 200 with the normalized metadata for a matching ISBN`; `synthesizes the cover URL by ISBN, not by cover_i`; `omits absent fields but still reports found:true with the cover` | `apps/api/test/routes/ol-lookup.test.ts` | unit (injected fetch) |
| OL down / error / no-match → empty/partial, does not throw, always usable | `returns 200 { found:false }` for no-match / non-2xx / throw / parse-fail | `apps/api/test/routes/ol-lookup.test.ts` | unit |
| Polite User-Agent + bounded by a timeout | `calls OL search.json with q=isbn:<isbn>, the five fields, and the polite UA`; `aborts a hung OL and resolves 200 { found:false }`; `passes an AbortSignal to the OL fetch` | `apps/api/test/routes/ol-lookup.test.ts` | unit (fake timers for the abort) |
| (endpoint validation) malformed/absent isbn → usable response, no OL call | `returns 200 { found:false } for a missing isbn…`; `…for a junk isbn…`; `normalizes a hyphenated ISBN-13 before querying OL` | `apps/api/test/routes/ol-lookup.test.ts` | unit |
| (normalizer + isbn rule, pure) | `normalizeDoc (…)` ×3; `normalizeIsbnParam (…)` ×5 | `apps/api/test/routes/ol-lookup.test.ts` | unit (pure) |
| (web client wiring) `api.ol.lookup` exists + calls the endpoint | `exists as a callable method on the client`; `issues GET /api/ol/lookup with the URL-encoded isbn and returns the parsed body` | `apps/web/test/lib/api-ol-lookup.test.ts` | unit |
| ISBN entered, debounced → one lookup, empty fields pre-filled | `calls api.ol.lookup once, ~500ms after a valid ISBN is entered`; `fills the empty title/author/cover/year/pages from the lookup result`; `debounces rapid keystrokes into a single lookup with the final ISBN` | `apps/web/test/routes/submit-autofill.test.tsx` | component (fake timers) |
| User-typed field is not overwritten | `does not overwrite a field the user already typed into`; `locks a field once the user edits it, even after a prior autofill` | `apps/web/test/routes/submit-autofill.test.tsx` | component |
| Honest "from Open Library" affordance, no fabricated/silent values | `shows the honest 'Filled from Open Library' affordance after a found lookup` | `apps/web/test/routes/submit-autofill.test.tsx` | component |
| Lookup fails / returns nothing → form fully usable + honest no-match line | `shows the honest no-match line and writes nothing when found:false`; `leaves the form fully usable when the lookup rejects` | `apps/web/test/routes/submit-autofill.test.tsx` | component |
| (migration guard) submit carries autofilled values, both tiers | `custodial: createCustodial receives the autofilled fields`; `sovereign: the signing template receives the autofilled fields` | `apps/web/test/routes/submit-autofill.test.tsx` | component |
| Cover URL present → preview image renders before submit | `renders an <img> preview in the preview block when a cover URL is present` | `apps/web/test/routes/submit-autofill.test.tsx` | component |
| Absent/broken cover → gradient fallback, not broken-image, no jank | `swaps to the gradient fallback when the cover <img> errors`; `re-attempts the image when the cover URL changes`; `shows the gradient fallback (not an <img>) when no cover URL is set` | `apps/web/test/routes/submit-autofill.test.tsx` | component |
| Deliberate `submit.png` baseline drives the form + affordance + preview | `submit` (driven into the populated form, waits on the `.sub-autofill-note` sentinel) | `apps/web/e2e/visual/visual.spec.ts` + `fixtures/index.ts` | e2e visual (Docker/CI) |
| Twelve `architecture-*` guards stay green; no AI-slop copy | (covered by the existing guard suite + the verbatim ADR copy strings asserted above) | `packages/ui/test/architecture-*.test.ts` | unit |

## Edge cases covered

- [x] OL non-2xx, network throw, JSON parse-fail, hung/aborted fetch all → `200 { found:false }`.
- [x] Malformed / missing isbn → `200 { found:false }` with **no** OL call.
- [x] Hyphenated ISBN-13 normalized before the OL query; ISBN-10 with trailing `X` accepted/uppercased.
- [x] Doc with only a title (author/pages/year absent) → `found:true` with the cover, absent fields omitted.
- [x] Rapid ISBN keystrokes → a single debounced lookup with the final ISBN.
- [x] Dirty field never clobbered; an autofilled-then-edited field is locked against a later lookup.
- [x] `found:false` / rejected lookup writes nothing and never crashes the form.
- [x] Cover `onError` → gradient fallback; URL change clears the broken state; empty cover → fallback.
- [x] Both submit tiers (sovereign template→sign→create, custodial createCustodial) carry the autofilled values — the uncontrolled→controlled migration guard.

## Test infrastructure

- **Runner:** Vitest (workspace default). API tests under `apps/api/test/routes/`; web component tests under `apps/web/test/routes/` and `apps/web/test/lib/`.
- **API endpoint tests:** Express + `supertest`, with an **injected `fetchImpl`** (no real network). The abort/timeout test uses `vi.useFakeTimers()` + `advanceTimersByTimeAsync` against a fetch that honors the `AbortSignal`.
- **Web component tests:** Vitest + Testing Library (happy-dom). `../../src/lib/api`, `useSession`, and `DuplicateCheck` are mocked (the existing `submit.test.tsx` pattern); the api mock adds `ol: { lookup }`. The 500ms debounce is driven with **fake timers** (`advanceTimersByTimeAsync(550)` flushes both the debounce timer and the lookup microtask). The sovereign-submit test stubs `window.nostr.signEvent`. No real network, no real crypto.
- **Not-yet-existing modules** (`apps/api/src/routes/ol-lookup.ts`, `api.ol.lookup`) are loaded/accessed through **opaque specifiers / casts** (mirroring `apps/seeder/test/_load.ts` and `apps/web/test/components/blurb.test.tsx`), so `pnpm -r typecheck` stays clean and the red is assertion-level ("Cannot find module" / "not a function" / value mismatch), never a TS compile wall.
- **e2e visual:** Playwright (ADR 0039), run **only in CI Docker** — not in the Vitest gate. The `submit` test now signs in (`auth: "signed-in"`), drives `DuplicateCheck` → proceed → ISBN entry, and waits on the `.sub-autofill-note` "Filled from Open Library" sentinel. `fixtures/index.ts` gains an `/api/ol/lookup` matcher (`OL_LOOKUP`) whose `coverUrl` points at a same-origin `/api/*` path the route-mock fulfills as JSON → the preview `<img>` errors → the **gradient-fallback** capture state (self-contained, no binary cover fixture).

## How to run

```
pnpm --filter @unbnd/api test     # ol-lookup.test.ts → 21 red; rest green
pnpm --filter @unbnd/web test     # submit-autofill (14) + api-ol-lookup (2) → 16 red; rest green
pnpm -r typecheck                 # clean (opaque module/symbol seams)
```

The e2e visual change is **not** run here (CI Docker only) and is expected to go
needs-baseline — `submit.png` is the single deliberate baseline regenerated in CI
in its own labeled commit per ADR 0039.

## Verification (RED confirmed 2026-06-06, branch `story-64-submit-autofill`)

```
apps/api:  Test Files  1 failed | 95 passed | 2 skipped (98)
           Tests  21 failed | 851 passed | 10 skipped (882)
           (all 21 failures in test/routes/ol-lookup.test.ts:
            "Failed to load url ../../src/routes/ol-lookup … Does the file exist?")

apps/web:  Test Files  2 failed (the two new files) | 52 passed (54)
           Tests  16 failed | 308 passed (323)
           (submit-autofill.test.tsx 14 red: api.ol.lookup never called / fields
            never fill / affordance + preview blocks absent;
            api-ol-lookup.test.ts 2 red: api.ol.lookup missing)

pnpm -r typecheck: Done (all 12 projects clean)
```

All existing suites stay green, including the prior `submit.test.tsx` (3),
`submit-author-toggle-copy.test.tsx` (3), `duplicate-check.test.tsx` (4), and the
twelve `architecture-*` guards. No existing test was modified.

## Notes for the Implementer (ADR ambiguities + seams)

- **Controlled-field seam.** The five lifted inputs must **retain their `name=`** so
  `onSubmit`'s `new FormData(...)` keeps populating both submit paths. The autofill
  tests assert the submitted `SubmissionInput` carries the autofilled values for
  **both** tiers — that is the load-bearing guard for the uncontrolled→controlled
  migration; do not rewrite `onSubmit`.
- **Dirty-tracking mechanism.** Tests pin the **behavior** (fill iff empty ∧ ¬dirty;
  a user edit locks; autofill does not lock), not the data structure. A `Set`/`Record`
  are both fine.
- **Affordance sentinel/copy.** The visual sentinel + the component tests pin the
  container class **`.sub-autofill-note`** and the verbatim strings "Filled from Open
  Library. Edit anything." and "No match on Open Library. Add the details by hand."
  Keep these exact (no em dash, no exclamation). The in-progress "Looking up this
  ISBN…" line is specced but **not** asserted in the red set (it is transient and
  racy to pin under fake timers) — implement it, but it has no failing test.
- **Cover preview markup.** Tests scope to `.sub-cover-preview img` (the preview
  `<img>`) and `.sub-cover-preview .sub-cover-fallback` (the gradient block), to avoid
  the Nav logo SVG (which also has role `img`). Keep the preview `<img>` and its
  fallback inside a `.sub-cover-preview` container.
- **e2e form-drive.** The visual test fills `#sub-isbn13` to trigger the lookup and
  waits on `.sub-autofill-note`. Keep the ISBN-13 input id `sub-isbn13` and render
  the affordance with class `sub-autofill-note`.
- **Fixture `OlLookup` type.** `fixtures/index.ts` currently declares `OlLookup`
  **locally** (so the fixture typechecks before the export exists). Once you add
  `export type OlLookup` to `src/lib/api.ts`, swap the local declaration for
  `import type { OlLookup }`.
- **`submit.png`.** Do not regenerate locally; the orchestrator regenerates it in CI
  Docker in a labeled commit (ADR 0039). The e2e job will be needs-baseline until then.
