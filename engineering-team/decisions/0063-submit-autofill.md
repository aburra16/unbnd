# ADR 0063: Open Library metadata autofill + cover preview on the submission form

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/done/64-submit-autofill.md`

**Accepted 2026-06-05.** A new best-effort, **always-200**, public API endpoint `GET /api/ol/lookup?isbn=<isbn>` fetches Open Library server-side via `search.json?q=isbn:<isbn>&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year` (the seeder's search-API precedent), normalizes one doc to `{ found, title?, authorName?, coverUrl?, pageCount?, publishYear? }` with an **API-local** normalizer (cover synthesized as `https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg`), bounded by a 5s `AbortController` timeout, a polite `User-Agent`, and an injectable `fetchImpl`; OL down / not-found / timeout / parse-fail all resolve to `200 { found: false }`, never a 5xx. The Submit form lifts **five** autofillable fields (`title`, `author`, `cover`, `year`, `pages`) from uncontrolled `FormData` to controlled React state seeded from `adding.title`; a **500ms** debounce on a valid ISBN-13/ISBN-10 entry calls `api.ol.lookup(isbn)` and fills **only fields that are currently empty AND untouched-by-the-user** (a per-field `dirty` set; autofill writes empty, untouched fields and re-marks them autofilled, never clobbering a typed value). A cover preview `<img>` renders from the controlled cover URL with an **`onError`/empty → `coverGradient(slug-or-title)` block** fallback (the `BookHeader`/`BookCard` pattern, plus the `onError` those lack), so a broken or absent URL never shows a broken image and causes no layout jank. An honest affordance ("Filled from Open Library. Edit anything.") and a quiet in-progress / no-match line carry the provenance. The `/submit` visual fixture is lengthened (mock `/api/ol/lookup`, drive `DuplicateCheck` → proceed → ISBN entry → autofilled form + cover preview); **`submit.png` is the only baseline that changes**, regenerated in CI Docker in its own labeled commit per ADR 0039. No schema change, OL-only, no auto-submit, the catalog seeder untouched. Open questions resolved as the recommended defaults below.

## Context

Story 64 is the last Block E (platform hardening) item, PRD §2.11: *"OL metadata autofill on submit: pre-fill cover/page-count/year from OL on ISBN/title entry"* and *"Cover preview in the submission form before submit."* Today a submitter re-keys every field by hand into `apps/web/src/routes/Submit.tsx`. The catalog already holds this metadata and Open Library is the source it was seeded from. This story fills **existing optional submission fields** from an ISBN lookup and shows the cover before submit. It changes neither what a submission *is* nor its DList shape.

### The acceptance criteria (quoted from the story, for confirmation)

- Known ISBN (OL mocked) → the lookup endpoint returns normalized `{ title?, authorName?, coverUrl?, pageCount?, publishYear? }`.
- OL down / error / no-match (mocked) → the endpoint resolves to an empty/partial result and **does not throw**; the caller always gets a usable response.
- The endpoint sends a polite User-Agent and is bounded by a timeout (a slow/hung OL cannot hang the request).
- ISBN entered, user pauses (debounced) → the lookup is called once and the **empty** fields among cover/pages/year (and title/author if returned) are pre-filled.
- A field the user already typed is **not** overwritten (autofill never clobbers user input).
- Every autofilled field is editable/clearable and there is a clear, honest "from Open Library" affordance (no fabricated/silent values).
- A lookup that fails or returns nothing → the form stays fully usable and submittable by hand.
- A cover URL present (lookup or typed) → a preview image renders before submit.
- An absent/broken/404 cover URL → the graceful fallback renders (gradient/empty-state, mirroring `BookHeader`/`BookCard`), **not** a broken-image icon, no layout jank.
- All twelve `architecture-*` guards stay green; the preview is an `<img>` **with** a fallback.
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` green.
- `submit.png` updated deliberately in its own labeled commit (ADR 0039), driving the harness into the form state showing the affordance + preview; no other baseline changes.
- No AI-slop copy in any new string.

### PRD anchor and scope

PRD §2.11 (the two bullets), inside the §2.10/§16a submission flow. This populates existing optional fields and adds form UI; it does **not** change the submission schema or shape, and touches no PRD §11.3 out-of-scope item (payments, hosting, ebook sales, social feed, federation).

### Verified survey (read directly against source, 2026-06-05)

- **The submit flow is search-first, then an uncontrolled form** (`apps/web/src/routes/Submit.tsx`). `DuplicateCheck` (ADR 0015) renders first; only after the user searches and chooses to proceed does `adding: { title } | null` get set and the form render (`Submit.tsx` line 144, 157). The form is plain HTML inputs inside `@unbnd/ui` `Field`/`Label`, read via an uncontrolled `new FormData(e.currentTarget)` in `onSubmit` (lines 94–108). The only prefill today is `defaultValue={adding.title}` on the title input (line 175). Sovereign (`session.user.email === null`) signs the template in the browser (`api.submissions.template` → NIP-07 `signEvent` → `api.submissions.create`, lines 112–121); custodial posts the raw input (`api.submissions.createCustodial`, line 123). `selectedGenres` and `isAuthor` are **already React state** (lines 65–66), so the form is a hybrid (controlled state + uncontrolled `FormData`) today, not purely uncontrolled.
- **The form already has every target input.** `name="title"` (175), `name="author"` (181), `name="isbn13"` (198), `name="isbn10"` (202), `name="year"` (208, `type="number"`), `name="pages"` (219, `type="number"`), `name="cover"` (254, `type="url"`, placeholder `https://covers.openlibrary.org/...`). Autofill **populates existing inputs**; no form fields are added.
- **The submission record already carries the fields.** `apps/api/src/submissions/template.ts` `SubmissionInput` (lines 15–29) → `BookRecord` (lines 74–91) carry `coverUrl`, `publishYear`, `pageCount`, `title`, `authorName`. The web mirror is `apps/web/src/lib/api.ts` `SubmissionInput` (lines 38–51). **The PRD's autofill targets are already in the submission shape; no schema change.**
- **No OL fetch in `apps/api`.** OL fetching lives only in the seeder (`apps/seeder/src/{fetch,search,openlibrary,gate}.ts`). The web must **not** call OL directly (browser CORS, OL rate-limits, third-party coupling). A server-side endpoint that fetches OL and returns normalized metadata is the correct shape, mirroring the seeder.
- **The seeder OL precedent (the patterns this ADR cribs).**
  - `apps/seeder/src/search.ts` pages `https://openlibrary.org/search.json` with a `fields` list including `title,author_name,cover_i,first_publish_year,number_of_pages_median,isbn,key` (lines 18–32, 66–74) and a `fetchImpl` injection seam (line 42, 61).
  - `apps/seeder/src/openlibrary.ts` `mapSearchDocToBookRecord` (lines 87–121) normalizes a search doc → `{ title, authorName, coverUrl, publishYear, pageCount, isbn13, isbn10, subjects, language }`; cover is synthesized **by `cover_i`**: `https://covers.openlibrary.org/b/id/${cover_i}-L.jpg` (line 104). It returns a full `BookRecord` (with `parentHeader`, `format`, `source`, `slug`), so it is **not** cleanly importable for a thin metadata lookup.
  - `apps/seeder/src/fetch.ts` exports `SEEDER_USER_AGENT = "unbnd-seeder/0.1 (+https://unbnd.ink; catalog import)"` (line 5), the politeness UA on every OL request.
- **The cover-fallback pattern.** `BookHeader.tsx` (lines 45–58) and `BookCard.tsx` (lines 31–53) do `coverUrl ? <img src=coverUrl alt=""> : <gradient div>` using `coverGradient(seed)` from `apps/web/src/lib/view-model.ts` (line 25). **Neither `<img>` carries `onError`**, so a *broken* URL renders a broken image. The submission preview takes a user/OL URL that may 404, so it needs the `onError`-to-fallback the current covers lack.
- **The OL ISBN lookup probed live (2026-06-05).** `GET https://openlibrary.org/search.json?q=isbn:9780140328721&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year&limit=1` returns one doc: `{ "title": "Fantastic Mr Fox", "author_name": ["Roald Dahl"], "cover_i": 6498519, "first_publish_year": 1970, "number_of_pages_median": 96 }` — **exactly** the present subset the story names, in one call. A non-matching ISBN returns `{ numFound: 0, docs: [] }` (clean empty, no error). `HEAD https://covers.openlibrary.org/b/isbn/9780140328721-L.jpg` → `200 image/jpeg`, so the **by-ISBN cover form works without needing `cover_i`**.
- **The visual harness.** `apps/web/e2e/visual/visual.spec.ts` test `"submit"` (lines 65–74) navigates to `/submit` and snapshots `submit.png` full-page at the at-rest `DuplicateCheck` prompt — it does **not** exercise the form (the form only renders after search+proceed). `apps/web/e2e/visual/fixtures/index.ts` route-mocks `/auth/**` and `/api/**` from typed fixtures; the first matching `Matcher` wins, unmapped `/api/*` falls to `API_DEFAULT = {}`. All fixture books currently omit `coverUrl` (line 11–12 comment) so no external image loads.
- **The debounce precedent.** `DuplicateCheck.tsx` debounces its catalog search at `DEBOUNCE_MS = 200` (line 12) with a `seq` ref to drop stale responses (lines 27, 36–51), and defines a local `normalizeIsbn(s)` (lines 14–17: strips non-`[0-9Xx]`, returns the digits iff length 13 or 10, else null). The story names the OL lookup "debounced (mirror the existing `DuplicateCheck` debounce posture)"; the seq-guard + clearTimeout pattern is the reuse target.
- **Auth posture precedent.** `/api/search` (`apps/api/src/routes/search.ts`) is a **public** GET router — no `sessionUser` dependency, no cookie check (registered at `index.ts` line 470 with `{ searchProvider, config, query, trust }`). It is the right precedent for a public, read-only proxy endpoint.
- **The guards.** Twelve `packages/ui/test/architecture-*.test.ts` (color/type/spacing/shape/motion literals, button, svg, palette-sync, page-frame, token-refs, breakpoints, theme-completeness). The svg guard bans raw `<svg>` only (regex `/<svg(?=[\s/>])/g`, comment-aware); **`<img>` is not policed** — the existing covers prove it. The preview is an `<img>` (allowed), the affordance text goes in token-styled markup, any new control reuses `@unbnd/ui` `Link`/`Button` (no raw `<button>`).

### Constraints that bind this design

- **The twelve `architecture-*` guards** — no raw color/type/spacing/shape/motion literal in `apps/web/src`, no raw `<button>`, no raw `<svg>`. The `<img>` preview is allowed; the affordance/hint strings live in token-styled CSS classes; the back-to-search affordance already uses `Link`.
- **The design system is the single source of truth** (`@unbnd/ui`, ADR 0038): primitives + tokens; no new primitive, no new icon, no hex literal outside `tokens.css`. The fallback reuses `coverGradient` (existing) and the `linear-gradient(155deg, …)` inline-style pattern already used by `BookHeader`/`BookCard` (the gradient stops are runtime-derived from `coverGradient`, not literals — guard-clean, as those components prove).
- **ADR 0039 gate** (`maxDiffPixelRatio: 0`): every non-intended pixel diff fails the visual job. The single intended diff is `submit.png`, regenerated in the pinned Playwright Docker image, committed in a labeled commit; every other baseline stays zero-diff.
- **No AI-slop** (`memory/feedback_unbnd_copy_and_visual.md`) in any new string: no em dashes, no declarative-negative / rhetorical-contrast, no hedged openers, no filler verbs, no exclamation-point CTAs, no emoji. The product surface avoids "nostr" vocabulary; "Open Library" is a real, named source and is allowed.
- **PRD scope:** §2.11 platform hardening; the submission flow it sits in (§2.10/§16a). Presentation + one best-effort read endpoint + filling existing optional fields. No PRD claim is invalidated.

### DList shapes touched

**None.** The autofilled values land in the existing kind-39999 submission record's optional fields (`coverUrl`, `pageCount`, `publishYear`, `title`, `authorName`) via the unchanged `SubmissionInput` → `BookRecord` path in `apps/api/src/submissions/template.ts`. No new kind, d-tag, tag, or word-wrapper shape. The OL lookup endpoint reads a public third-party HTTP API and returns plain JSON; it publishes nothing and touches no nostr event. The Tapestry branch survey does not apply (no protocol shape); the only protocol-adjacent prior art is the seeder's OL fetch, cited above.

## Options considered

The load-bearing decisions are (1) the OL endpoint + cover-URL form, (2) the API lookup endpoint shape + posture + whether to share or duplicate the seeder helper, (3) the controlled-field surface + the never-clobber rule + the debounce, (4) the cover-preview fallback mechanism, and (5) the visual-fixture plan. Options A/B/C frame the cross-cutting choice (a server endpoint vs. alternatives); the sub-decisions follow from the survey and the probe.

### Option A — A thin public server endpoint `GET /api/ol/lookup?isbn=` over OL `search.json`, an API-local normalizer, controlled-field autofill with a per-field dirty set, an `onError`→gradient cover preview, one labeled `submit.png` baseline (CHOSEN)

The web never touches OL. A new public, best-effort, **always-200** API endpoint fetches `https://openlibrary.org/search.json?q=isbn:<isbn>&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year` server-side (the seeder's search-API call, narrowed to the five present fields), normalizes the first doc with an **API-local** focused normalizer to `{ found, title?, authorName?, coverUrl?, pageCount?, publishYear? }`, synthesizes the cover by ISBN, is bounded by a 5s `AbortController` timeout and the polite UA, and accepts an injectable `fetchImpl`. The web `Submit.tsx` lifts five fields to controlled state, debounces a valid-ISBN change at 500ms, and fills only empty+untouched fields. The preview is an `<img>` with `onError`→`coverGradient` fallback. The `/submit` visual fixture drives the harness into the populated form; only `submit.png` changes.

- Pros: reuses the seeder's exact OL endpoint and field shape (probed to return precisely the present subset in one call); keeps the browser off OL (no CORS, no client→third-party coupling, server-side politeness + timeout); always-200 makes the form unbreakable by OL flakiness; the API-local normalizer is a tiny pure function (the four-field map), trivially unit-testable with an injected `fetchImpl`; the controlled surface is minimal (five fields, two of which — title via `adding.title` — are already prefilled-shaped); the `onError` fallback reuses `coverGradient` and the existing gradient markup; the public-GET posture matches `/api/search`; the visual change is a single labeled baseline per ADR 0039. The dirty-set never-clobber rule is exact and testable.
- Cons: lifts five inputs from `FormData` to controlled state — the one structural change; the existing sovereign + custodial submit paths read `FormData` in `onSubmit`, so the migration must keep those inputs' `name=` attributes (so `FormData` still reads them) **and** make them controlled (so autofill can write them) — the `value`/`onChange` + retained `name` dual-binding is the risk, called out and mitigated below. Adds one runtime network dependency on OL at form time (mitigated by best-effort + debounce + the form working without it).

### Option B — A client-side OL fetch from the browser, no API endpoint

The web calls `https://openlibrary.org/search.json` directly from `Submit.tsx`.

- Pros: no new API endpoint; least server code.
- Cons: OL's `search.json` does not reliably send permissive CORS for arbitrary browser origins, so the fetch can fail in production for reasons unrelated to the data; couples the client directly to a third party (no server-side UA, no timeout governance, no future cache/rate-limit seam, no test injection point); and it violates the survey's explicit "the web app must not call OL directly." Rejected: it trades a small endpoint for a brittle, untestable, policy-violating client→third-party call.

### Option C — A shared `@unbnd/ol` package extracting the seeder's OL fetch + normalize for both seeder and API

Promote `mapSearchDocToBookRecord` + the search fetch into a new shared workspace package consumed by both the seeder and the API.

- Pros: one OL-normalization home; no duplication.
- Cons: the seeder normalizer returns a full `BookRecord` (with `slug`, `parentHeader`, `format`, `source`, `language: "eng"`, subjects, isbn selection) — it is **not** the four-field metadata shape this endpoint returns, so sharing it means either the API depends on `@unbnd/schemas` `BookRecord` machinery for a metadata lookup it does not need, or the shared package grows a second "lite" normalizer anyway. A new workspace package is a build-graph and ownership change for ~15 lines of pure mapping, with the seeder explicitly out of scope for this story (the seeder fetch must stay untouched). Rejected per YAGNI and the no-new-tooling house rule: an **API-local** normalizer (≈ the four-field subset of `mapSearchDocToBookRecord`, cover-by-ISBN) is the focused, testable fit; if a second consumer ever appears, extraction is a clean follow-up.

## Decision

We choose **Option A.** It reuses the seeder's exact OL search-API call and field shape (probed to return precisely the present subset), keeps the browser off OL behind a public best-effort endpoint that can never 5xx the form, makes the smallest controlled-field migration that lets autofill write without losing the `FormData` submit path, gives the preview the `onError`→`coverGradient` fallback the existing covers lack, and lands a single labeled `submit.png` baseline per ADR 0039. We reject Option B (CORS-brittle, untestable, policy-violating) and Option C (a new shared package for a four-field map the seeder normalizer does not match, with the seeder out of scope).

### 1. The OL lookup — `search.json` by ISBN, cover by ISBN, an API-local normalizer

- **The OL request** (probed):

  ```
  GET https://openlibrary.org/search.json?q=isbn:<isbn>&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year&limit=1
  ```

  with header `User-Agent: <UNBND_API_USER_AGENT>` (see §2). The `<isbn>` is the server-normalized digit string. This is the seeder's `search.json` call (`apps/seeder/src/search.ts`) narrowed from the seeder's 13-field set to the **five present fields** Story 64 names. A found ISBN returns one doc with `{ title, author_name[], cover_i, number_of_pages_median, first_publish_year }`; a non-match returns `{ numFound: 0, docs: [] }`. (Rationale over the Books API `?bibkeys=ISBN:…&jscmd=data` and `/isbn/{isbn}.json`+`/works/…`: `search.json` returns all five normalized fields in **one** call with the same field names the seeder already consumes, and the probe confirms it; the Books API and the `/isbn` route need a second hop for the work-level year/pages and return a different shape.)
- **The cover URL** is synthesized **by ISBN**, not by `cover_i`:

  ```
  https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg
  ```

  Rationale: the probe confirms the by-ISBN form returns `200 image/jpeg`, the form's own placeholder already hints this URL (`Submit.tsx` line 258), and it is derivable from the ISBN the user typed even on a partial/odd doc. (The seeder uses `b/id/${cover_i}` because it maps works that always carry `cover_i`; here the ISBN is the stable, always-present key. If `cover_i` is absent but the ISBN resolved, the by-ISBN cover still works; if the by-ISBN image 404s, the form's `onError` fallback (§4) catches it. We still read `cover_i` from the doc only as an optional cross-check, not the URL source — the URL source is the ISBN.)
- **The normalizer** is **API-local** (decided over sharing the seeder's `mapSearchDocToBookRecord`, per Option C). A small pure function in the new endpoint module:

  ```ts
  // apps/api/src/routes/ol-lookup.ts (illustrative — Implementer writes the real code)
  type OlLookupResult = {
    found: boolean;
    title?: string;
    authorName?: string;
    coverUrl?: string;
    pageCount?: number;
    publishYear?: number;
  };
  function normalizeDoc(doc: OlSearchDoc | undefined, isbn: string): OlLookupResult {
    if (!doc) return { found: false };
    return {
      found: true,
      ...(doc.title?.trim() ? { title: doc.title.trim() } : {}),
      ...(doc.author_name?.[0]?.trim() ? { authorName: doc.author_name[0].trim() } : {}),
      coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
      ...(typeof doc.number_of_pages_median === "number" ? { pageCount: doc.number_of_pages_median } : {}),
      ...(typeof doc.first_publish_year === "number" ? { publishYear: doc.first_publish_year } : {}),
    };
  }
  ```

  This is the four-field subset of the seeder's `mapSearchDocToBookRecord` logic (line-for-line the same `?.trim()` / `typeof … === "number"` guards), minus the `BookRecord` wrapping (`slug`, `parentHeader`, `format`, `source`, `language`, subjects, isbn-selection) the lookup does not need. `coverUrl` is always set when `found` (the by-ISBN URL is derivable from the input ISBN); the preview's `onError` handles a non-existent cover at render time. `found: false` carries every "no usable result" case (not-found, OL down, timeout, parse-fail) so the web has one honest signal.

### 2. The `/api/ol/lookup` endpoint — public, best-effort, always 200, bounded, injectable

- **Route + shape:** `GET /api/ol/lookup?isbn=<isbn>`. ISBN-only (no `?title=`): the Architect call is to keep this focused (ISBN is the unambiguous key the probe confirms returns the present subset in one call; a title query is fuzzy, returns the wrong edition's pages/year, and widens the abuse/cost surface — title autofill is a future enhancement if ever wanted). The handler **validates/normalizes** the isbn server-side (strip non-`[0-9Xx]`, accept only length 13 or 10, uppercase — the same rule as `DuplicateCheck`'s `normalizeIsbn`); a malformed/absent isbn resolves to `200 { found: false }` (no 400 — the form must always get a usable response). Response body: `{ found: boolean, title?, authorName?, coverUrl?, pageCount?, publishYear? }`.
- **Always 200, never a 5xx that breaks the form.** Every failure mode — OL returns non-2xx, OL is unreachable, the JSON does not parse, the `AbortController` timeout fires, or there is no matching doc — resolves to `200 { found: false }`. The handler wraps the fetch in `try/catch` and the catch returns `{ found: false }`. The form's autofill is best-effort; a `found: false` leaves the form fully usable (AC: "fails or returns nothing → the form remains fully usable").
- **Bounded by a timeout.** An `AbortController` with a **5s** budget (`setTimeout(() => controller.abort(), 5000)`, cleared on settle) passed as `signal` to the fetch. A slow/hung OL aborts to `{ found: false }` rather than hanging the request (AC: "a slow/hung OL cannot hang the request indefinitely"). 5s is generous for OL's median while bounding the worst case; the web debounce (§3) already prevents per-keystroke bursts.
- **Polite User-Agent.** A new module-level constant `UNBND_API_USER_AGENT = "unbnd-api/0.1 (+https://unbnd.ink; submission metadata lookup)"` in the endpoint module (mirroring `SEEDER_USER_AGENT`'s shape; a *distinct* UA so OL can tell the interactive lookup from the bulk seeder). Sent as the `User-Agent` header on the OL request.
- **Injectable `fetchImpl`.** The router builder takes an optional `fetchImpl?: typeof fetch` dep (default `fetch`), mirroring the seeder's `opts.fetchImpl` seam (`search.ts` line 42, 61), so the Tester drives found / not-found / OL-throws / timeout deterministically without network.
- **Auth posture: public / no session.** It proxies a single public OL read; gating it behind the session adds nothing (the data is public) and would break the pre-submit lookup for a user who has not yet authenticated to submit. This matches `/api/search`'s public-GET posture. The router builder is registered like `buildSearchRouter` (`app.use("/", buildOlLookupRouter({ fetchImpl }))` in `apps/api/src/index.ts`), needs no `Config`/session/trust deps.
- **Abuse / rate-limit posture.** The endpoint only proxies a public, read-only OL lookup, bounded by the 5s timeout, and the only caller debounces at 500ms. The abuse ceiling is "someone scripts OL ISBN reads through our proxy," which is no worse than scripting OL directly and carries no write/cost/secret exposure. **No rate-limit or cache is added in this story** (decided: a cache/limiter is reasonable but not required, and adding either now is premature for a debounced, bounded, public read). The module is structured so a small in-memory TTL cache (keyed by normalized ISBN) is a clean future drop-in if OL-traffic ever warrants it; this ADR explicitly defers it.
- **Web wiring:** add `api.ol.lookup(isbn: string)` to `apps/web/src/lib/api.ts` in a new `ol:` namespace:

  ```ts
  ol: {
    lookup(isbn: string) {
      return authFetch<OlLookup>(`/api/ol/lookup?isbn=${encodeURIComponent(isbn)}`);
    },
  },
  ```

  with `export type OlLookup = { found: boolean; title?: string; authorName?: string; coverUrl?: string; pageCount?: number; publishYear?: number };`. `authFetch` already sends `credentials: "include"` and parses JSON; a `200` resolves (never throws) so the web reads `found` directly.

### 3. The autofill — minimal controlled surface, a per-field dirty set, 500ms debounce, never-clobber

- **The minimal controlled surface: five fields** — `title`, `author`, `cover`, `year`, `pages`. These are exactly the autofill targets (cover/pages/year always; title/author when returned). `isbn13`/`isbn10` stay uncontrolled (they are the *input* the user types to trigger the lookup, read via the input's own value/`onChange` only to drive the debounce — see below — but they are not autofill *targets*, so they need no controlled value beyond what triggers lookup); `blurb`, `lang`, `purchase` stay uncontrolled `FormData`; `genres`/`isAuthor` stay as they are (already state). So the migration lifts five inputs, not the whole form.
- **Dual-binding (the migration's load-bearing detail):** each of the five lifted inputs keeps its existing `name=` attribute **and** gains `value={field}` + `onChange`. Retaining `name=` means `new FormData(e.currentTarget)` in `onSubmit` still reads them, so **both** the sovereign (`api.submissions.template` → NIP-07 → `create`) and custodial (`createCustodial`) submit paths keep working unchanged — `onSubmit` is not rewritten, it still reads `fd.get("title")` etc. `title` is seeded from `adding.title` (replacing today's `defaultValue={adding.title}` with `value`), preserving the existing prefill. This is the **uncontrolled→controlled migration risk**, called out in Risk below; the mitigation is "retain `name`, seed from the existing prefill, leave `onSubmit`'s `FormData` read intact."
- **State shape:** a single `fields` state object `{ title, author, cover, year, pages }` (strings; `year`/`pages` stay string-typed inputs, parsed by the existing `numOrUndef` in `onSubmit` exactly as today) and a `dirty: Set<keyof fields>` (or a `Record<…, boolean>`) tracking which fields the user has edited. Each input's `onChange` writes the field **and** adds it to `dirty`.
- **The debounce + trigger:** the ISBN input(s) drive a `useEffect` keyed on the normalized ISBN, mirroring `DuplicateCheck`'s pattern (a `seq` ref to drop stale responses, `setTimeout(…, 500)`, `clearTimeout` cleanup). On a **valid** ISBN (the `normalizeIsbn` rule: 13 or 10 digits) the effect, after **500ms** of pause, calls `api.ol.lookup(isbn)` once. (500ms over `DuplicateCheck`'s 200ms: this hits a third party with a 5s budget, so a slightly longer settle reduces redundant OL reads while a typist completes the ISBN; 200ms is tuned for local catalog search, 500ms for the external lookup.) Trigger on **either** ISBN-13 or ISBN-10 (both are valid OL `isbn:` queries; `normalizeIsbn` accepts both). A `seq`-guarded response drops stale results if the ISBN changed mid-flight.
- **The never-clobber rule (pinned, precise):** a field is autofillable iff it is **empty AND not in `dirty`** (i.e. the user has not typed into it since load). On a `found` lookup, for each of `{ title, author, cover, year, pages }` whose OL value is present, write it **only if** `fields[k]` is empty **and** `k ∉ dirty`. Writing an autofilled value does **not** add the field to `dirty` (autofill is not a user edit), so a subsequent lookup may refresh a still-untouched autofilled field, but the moment the user edits it (`onChange` → `dirty.add(k)`) it is locked from all future autofill. This is the "empty OR last-set-by-autofill-and-untouched-since" rule the story asks for, expressed as one testable predicate: **fill iff empty ∧ ¬dirty.** A `found: false` writes nothing and locks nothing — the form is unchanged and fully usable.
- **The honest affordance + hint (copy, no slop):**
  - When at least one field was autofilled, a quiet line under the Book-details section: **"Filled from Open Library. Edit anything."** (Two short sentences. Names the real source. No em dash, no rhetorical contrast, no exclamation, no filler. It is honest provenance and tells the user every value is overridable.)
  - In-progress (lookup in flight): **"Looking up this ISBN…"** (an ellipsis status line, mirroring the form's existing "Submitting…").
  - No match (`found: false` after a valid-ISBN lookup): **"No match on Open Library. Add the details by hand."** (Plain; tells the user the form still works.)
  - These render in token-styled `<span>`/`<p>` (reuse the existing `.sub-hint` / `.sub-submit-note` classes or an additive token-only class), no raw literals, no `<button>`/`<svg>`.

### 4. The cover preview + graceful fallback

- **Placement:** in the Discovery section, **adjacent to the cover URL input** (`Submit.tsx` lines 252–264), as a small fixed-aspect preview block to the side of or directly above the input, so the cover the user/lookup supplied is visible while editing. The block reserves a **fixed aspect/size** (a cover-shaped box sized from existing spacing/shape tokens, mirroring `.bh-cover`'s fixed dimensions) so swapping the URL does not reflow the form — **no layout jank** (AC).
- **The mechanism:** the preview reads the controlled `cover` field.
  - `cover` non-empty → render `<img className="sub-cover-img" src={cover} alt="" loading="lazy" onError={() => setCoverBroken(true)} onLoad={() => setCoverBroken(false)} />`.
  - `cover` empty **or** `coverBroken` → render the `coverGradient` fallback block: a `<div>` with `style={{ background: \`linear-gradient(155deg, ${g.from}, ${g.to})\` }}` and the title text, identical to `BookHeader.tsx` lines 49–57, seeded by `coverGradient(adding.title || "submission")` (the submission has no slug yet, so seed by the title — a stable, deterministic seed). This **adds the `onError` handling the existing `BookHeader`/`BookCard` covers lack** (the survey's explicit caveat): a broken/404 URL flips to the gradient instead of a broken-image icon.
  - `coverBroken` resets to `false` whenever `cover` changes (a new URL gets a fresh load attempt), so fixing the URL recovers the image.
- **Design-system compliance:** the `<img>` is allowed (the svg guard bans `<svg>` only; `<img>` is the established cover element). The gradient stops come from `coverGradient` (runtime-derived, not literals — `BookHeader`/`BookCard` prove this is guard-clean). The preview box sizing uses existing radius/spacing tokens (a new `.sub-cover-img` / `.sub-cover` rule referencing only `var(--u-*)`), mirroring `.bh-cover`. No new primitive, no new token, no raw literal.

### 5. The deliberate visual change — drive the harness into the form, only `submit.png` changes

- **Today** `submit.png` captures the at-rest `DuplicateCheck` prompt; the form is never exercised. To capture the new autofill affordance + cover preview, the fixture must drive `DuplicateCheck` → proceed → ISBN entry → the populated form, with `/api/ol/lookup` mocked.
- **What the `/submit` fixture must render (the deterministic populated state):**
  1. **Sign the harness in** (the submit form only renders its submit affordances when signed-in, and autofill should be shown in the real interactive state): the `submit` test calls `mockApi(page, { auth: "signed-in" })` (the harness already supports `"signed-in"`; `/auth/me` then returns `SIGNED_IN_USER`, whose `email: null` → the sovereign branch, which is fine — autofill is tier-independent and the baseline does not submit).
  2. **Add a `/api/ol/lookup` mock** to `fixtures/index.ts`'s `API_ROUTES`: `{ test: (u) => u.pathname === "/api/ol/lookup", body: OL_LOOKUP }` where `OL_LOOKUP: OlLookup = { found: true, title: "The Fixture Novel", authorName: "A. Fixture", coverUrl: "<a fixture cover URL>", pageCount: 320, publishYear: 2021 }`. **The cover URL must resolve to a real on-disk/data-URI image in the harness, or be a deterministic placeholder the harness serves** — to keep the baseline self-contained and avoid an external `covers.openlibrary.org` load (the fixtures' existing rule: no external covers). The recommended approach: mock the lookup's `coverUrl` to a **`/api`-served or data-URI fixture image** the route map fulfills, so the `<img>` loads deterministically in Docker; **or**, if serving an image fixture is heavy, set the lookup `coverUrl` to a value that 404s under the route-mock so the baseline captures the **gradient fallback** state (still a valid, deterministic preview state that exercises the `onError` path). The Tester/Implementer pick which preview state the baseline captures (loaded image vs. gradient fallback); the **recommended** capture is the **gradient fallback** (it is fully self-contained, needs no binary fixture, and still proves the preview block renders without jank). Either way the affordance line ("Filled from Open Library. Edit anything.") renders.
  3. **Drive the form into the populated state.** The `submit` test, after `page.goto("/submit")`, fills the `DuplicateCheck` search, proceeds ("Add it anyway" / "Add this book"), types a valid ISBN into the ISBN-13 field, and waits for the autofill affordance line as the **ready-state sentinel** (e.g. `await expect(page.locator(".sub-autofill-note", { hasText: "Filled from Open Library" })).toBeVisible();`) before the screenshot. This sentinel proves the lookup resolved and autofill ran, mirroring the spec's existing "wait for a content sentinel that proves the ready state" discipline.
- **`submit.png` is the only baseline that changes.** The new `OL_LOOKUP` fixture and the `auth: "signed-in"` flag are scoped to the `submit` test only; no other test's fixtures or route map change, so Home/Detail/Profile/Search/Auth baselines stay zero-diff. The baseline is regenerated in the pinned `mcr.microsoft.com/playwright:v<pinned>-jammy` image via the documented `test:visual:update` command (ADR 0039) and committed in **its own clearly-labeled commit** stating the intended delta (the populated submit form + autofill affordance + cover preview) and the brand-rule review. The orchestrator runs the CI baseline regeneration (no local Docker).

## Consequences

- **Enables:** an ISBN fills the cover/pages/year (and title/author when blank) in one debounced lookup; the cover is visible before submit; broken/absent covers fall back gracefully (and the `onError` gap in the existing covers is closed at this call site); the form is unbreakable by OL flakiness (always-200, best-effort); the seeder's OL endpoint + field shape are reused without touching the seeder.
- **Constrains / makes harder:** five inputs migrate from uncontrolled `FormData` to controlled state (the one structural change; mitigated by retaining `name=` and leaving `onSubmit`'s `FormData` read intact). The form now has a debounced effect hitting a third party at form time (mitigated by best-effort + 500ms debounce + the form working without it). The preview adds an `onError`/`coverBroken` bit of state to one component.
- **New debt / follow-ups:** none intended. A small in-memory TTL cache and/or a rate-limiter on `/api/ol/lookup` is a clean future drop-in if OL traffic warrants (explicitly deferred). Title-based lookup (`?title=`) is a future enhancement if ever wanted (deferred — ISBN-only here). If a second OL-metadata consumer ever appears, the API-local normalizer extracts cleanly into a shared module (Option C, deferred per YAGNI). The `onError`→gradient fallback could later be promoted to a shared `<Cover>` component and applied to `BookHeader`/`BookCard` (out of scope here).
- **Affects existing fixtures?** Yes — **e2e/visual fixtures only**: `apps/web/e2e/visual/fixtures/index.ts` (add the `OL_LOOKUP` body + its `/api/ol/lookup` matcher; the `submit` test uses `auth: "signed-in"`) and **one** committed baseline `apps/web/e2e/visual/visual.spec.ts-snapshots/submit.png` (deliberate, labeled, regenerated in CI Docker). No app data fixture (`apps/web/src/data/*`) changes; no other baseline changes. `apps/web/e2e/visual/visual.spec.ts`'s `submit` test gains the sign-in flag, the form-drive steps, and the new ready-state sentinel.
- **New dependency?** No. The endpoint uses the platform `fetch` + `AbortController` (already used across `apps/api`); the normalizer is a pure function; the preview is an `<img>` + `coverGradient` (existing) + the existing inline-gradient markup; the affordance/hint reuse existing token-styled classes. No new runtime or dev dependency, no new tooling (house rule honored).
- **PRD section change required?** No. PRD §2.11 already names "OL metadata autofill on submit" and "cover preview in the submission form." This implements those two bullets by filling existing optional fields and adding form UI; no PRD claim is invalidated. Phase-2 Block E hardening; recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors. The Architect is read-only on source; these are targets for the Tester (tests first) and the Implementer.

- **New: `apps/api/src/routes/ol-lookup.ts`.**
  - `export const UNBND_API_USER_AGENT = "unbnd-api/0.1 (+https://unbnd.ink; submission metadata lookup)";`
  - `export type OlLookupResult = { found: boolean; title?: string; authorName?: string; coverUrl?: string; pageCount?: number; publishYear?: number };`
  - A pure `normalizeDoc(doc, isbn): OlLookupResult` (§1 illustrative) and a pure `normalizeIsbnParam(raw): string | null` (strip non-`[0-9Xx]`, accept length 13/10, uppercase — same rule as `DuplicateCheck.normalizeIsbn`).
  - `export function buildOlLookupRouter(deps: { fetchImpl?: typeof fetch } = {}): Router` exposing `GET /api/ol/lookup`. Read `req.query.isbn`; `normalizeIsbnParam` → if null, `200 { found: false }`. Build the OL URL (§1), `AbortController` with a 5s `setTimeout(abort)` (cleared on settle), `fetchImpl(url, { headers: { "User-Agent": UNBND_API_USER_AGENT }, signal })`. On non-2xx / throw / abort / parse-fail / `docs[0]` absent → `200 { found: false }`. Else `200 normalizeDoc(body.docs[0], isbn)`. The whole handler body is wrapped so it can never surface a 5xx for an OL failure (it may still `next(err)` only for a truly unexpected internal error, but the OL path is fully caught).
- **Edit: `apps/api/src/index.ts`** — register `app.use("/", buildOlLookupRouter())` alongside the other `app.use("/", …)` router registrations (e.g. near the search router, line ~470). No new config/session/trust deps.
- **Edit: `apps/web/src/lib/api.ts`** — add `export type OlLookup = { found: boolean; title?: string; authorName?: string; coverUrl?: string; pageCount?: number; publishYear?: number };` and an `ol: { lookup(isbn) { return authFetch<OlLookup>(\`/api/ol/lookup?isbn=${encodeURIComponent(isbn)}\`); } }` namespace on `api`.
- **Edit: `apps/web/src/routes/Submit.tsx`.**
  - Lift five fields to controlled state: `const [fields, setFields] = useState({ title: adding?.title ?? "", author: "", cover: "", year: "", pages: "" })` (seed `title` from `adding.title`; reset when `adding` changes). A `dirty` set: `const [dirty, setDirty] = useState<Set<string>>(new Set())`.
  - Bind the five inputs `value={fields.k}` + `onChange={(e) => { setFields(f => ({...f, k: e.target.value})); setDirty(d => new Set(d).add("k")); }}`, **keeping each `name=` attribute** so `onSubmit`'s `new FormData(...)` read is unchanged (both submit paths keep working). Replace the title input's `defaultValue={adding.title}` with `value={fields.title}` + the controlled `onChange`.
  - The ISBN debounce effect (mirror `DuplicateCheck.tsx` lines 27–52): a `seq` ref, key on the normalized ISBN of the isbn13/isbn10 inputs, `setTimeout(…, 500)` → `api.ol.lookup(isbn)`; on `found`, for each of `{ title, author, cover, year, pages }` (year/pages from `publishYear`/`pageCount` as strings) fill **iff `fields[k] === "" && !dirty.has(k)`** (writing without adding to `dirty`); set the affordance/hint state. `seq`-guard stale responses; `clearTimeout` on cleanup. A lookup error/`found:false` writes nothing.
  - The affordance/hint UI: a token-styled line ("Filled from Open Library. Edit anything." / "Looking up this ISBN…" / "No match on Open Library. Add the details by hand.") in `.sub-autofill-note` (additive token-only class).
  - The cover preview (§4): in the Discovery section by the cover input, `fields.cover && !coverBroken ? <img className="sub-cover-img" … onError={() => setCoverBroken(true)} /> : <div className="sub-cover" style={{ background: linear-gradient(155deg, g.from, g.to) }}>…</div>` with `const g = coverGradient(fields.title || adding?.title || "submission")`; `coverBroken` resets when `fields.cover` changes.
  - `onSubmit` is **unchanged** (still reads `fd.get("title")` etc.; the controlled inputs' retained `name=` keep `FormData` populated). No change to the sovereign/custodial branch logic.
- **Edit: `apps/web/src/routes/Submit.css`** — add `.sub-cover` / `.sub-cover-img` (fixed cover-shaped box, radius/spacing tokens, mirroring `.bh-cover`) and `.sub-autofill-note` (token-only). No raw literals.
- **Edit (Tester/Implementer): `apps/web/e2e/visual/fixtures/index.ts`** — add `const OL_LOOKUP: OlLookup = { found: true, title: "The Fixture Novel", authorName: "A. Fixture", coverUrl: <deterministic value>, pageCount: 320, publishYear: 2021 }` and a `{ test: (u) => u.pathname === "/api/ol/lookup", body: OL_LOOKUP }` matcher; the `submit` test uses `auth: "signed-in"`. Recommended: a `coverUrl` that resolves to the gradient-fallback state under the route-mock (self-contained, no binary fixture), so the baseline captures the preview block + fallback + affordance.
- **Edit (Tester/Implementer): `apps/web/e2e/visual/visual.spec.ts`** — the `submit` test: `mockApi(page, { auth: "signed-in" })`, drive search → proceed → ISBN entry, wait for the `.sub-autofill-note` "Filled from Open Library" sentinel, then `toHaveScreenshot("submit.png", { fullPage: true })`.
- **Baseline (orchestrator): `apps/web/e2e/visual/visual.spec.ts-snapshots/submit.png`** — regenerate in the pinned Playwright Docker image via `test:visual:update`; commit in its own clearly-labeled commit per ADR 0039 (message states the intended delta + the brand-rule review). Confirm every other baseline is zero-diff. The orchestrator runs the CI baseline regeneration (no local Docker).

## Testability (for the Tester)

- **`/api/ol/lookup` handler (unit, injected `fetchImpl`):** found ISBN → `200` normalized `{ found:true, title, authorName, coverUrl (by-isbn form), pageCount, publishYear }`; not-found (`docs:[]`) → `200 { found:false }`; OL non-2xx → `200 { found:false }`; OL throws → `200 { found:false }`; the `AbortController` timeout fires → `200 { found:false }` (no hang); malformed/absent `isbn` query → `200 { found:false }`; the request carries the `User-Agent` header and the `q=isbn:<normalized>` + five-field `fields` param.
- **`normalizeDoc` / `normalizeIsbnParam` (unit, pure):** the four-field map with present/absent fields; isbn normalization (13/10 valid, hyphens stripped, `X` accepted, junk → null).
- **Web autofill (unit/component, mocked `api.ol.lookup`):** fills empty fields on `found`; never clobbers a dirtied field; the debounce calls the lookup once after 500ms (and drops stale responses via `seq`); a `found:false`/error leaves the form usable and submittable; an autofilled-then-untouched field can be refreshed but a user-edited field is locked.
- **Cover preview (component):** non-empty cover → `<img>`; `onError` → gradient fallback (no broken-image); empty cover → gradient; changing the URL clears `coverBroken`; the preview box does not reflow on URL change (fixed size).
- **The deliberate `submit.png`** baseline (visual): the populated form with the affordance line + preview, the single labeled diff, every other baseline zero-diff.

## Risk

- **The uncontrolled→controlled migration must not break the existing submit.** `onSubmit` reads `new FormData(e.currentTarget)` for **both** the sovereign (`template` → NIP-07 → `create`) and custodial (`createCustodial`) paths. Lifting five inputs to controlled `value`/`onChange` while **retaining their `name=` attributes** keeps `FormData` populated, so `onSubmit` is unchanged and both paths keep working. The risk is a missed `name=` (a controlled input without `name` drops out of `FormData` and silently submits empty); the mitigation is the explicit "retain `name`, seed `title` from `adding.title`, leave `onSubmit` intact" rule above, plus a test that submits the form after autofill and asserts the `SubmissionInput` carries the autofilled values for both tiers.
- **OL latency/flakiness on the form** is mitigated by best-effort + always-200 + the 5s timeout + the 500ms debounce + the form being fully usable without the lookup (a `found:false` writes nothing and blocks nothing).
- **The cover preview must not jank** — the fixed-size cover box (sized from tokens) reserves space so a URL swap or an `onError` flip does not reflow the form.

## Out of scope

- **No submission schema / shape change.** Only existing optional fields are populated. No new kind, d-tag, tag, or `BookRecord` field.
- **No change to the catalog seeder's OL fetch** (`apps/seeder/src/*` untouched). This reuses the seeder's *pattern* (the `search.json` call, the field shape, the politeness UA shape, the `fetchImpl` seam) but adds an independent API-local fetcher/normalizer.
- **No multi-source metadata.** Open Library only. No Google Books, ISBNdb, or publisher APIs.
- **No title-based lookup.** ISBN-only (`?title=` deferred).
- **No auto-submit.** Autofill pre-fills; the user reviews and submits. Nothing is published from a lookup.
- **No new design-system primitive.** The affordance, hint, and preview are built from existing `@unbnd/ui` primitives + tokens + the `<img>`/`coverGradient` pattern. No Modal, no new export.
- **No cache / rate-limiter** on `/api/ol/lookup` in this story (deferred; the module is structured for a clean future drop-in).
- **No raw `<button>` / raw `<svg>` / raw color/type/spacing/shape/motion literal** introduced in `apps/web/src` (twelve guards stay green). The `<img>` is allowed; the gradient stops are runtime-derived from `coverGradient`.
- **No change to the search-first `DuplicateCheck` step** beyond driving the harness into the form for the baseline; its dedup behaviour (ADR 0015) is unchanged.
- **No promotion of the `onError`→gradient fallback** to a shared `<Cover>` component or to `BookHeader`/`BookCard` (a clean follow-up, out of scope here).

## Open questions for the gate

- **OQ-1 (OL endpoint + cover form).** Pinned: `search.json?q=isbn:<isbn>&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year` (probed to return the present subset in one call) + cover by **ISBN** (`covers.openlibrary.org/b/isbn/<isbn>-L.jpg`, probed `200`). Confirm over the Books API / `/isbn` route and over the `b/id/<cover_i>` cover form.
- **OQ-2 (endpoint posture).** Pinned: `GET /api/ol/lookup?isbn=`, **public** (matching `/api/search`), **always 200** with `{ found, … }`, 5s `AbortController` timeout, distinct polite UA, injectable `fetchImpl`, **no** cache/rate-limit this story. Confirm the always-200 + public posture and the deferral of cache/rate-limit.
- **OQ-3 (share vs. duplicate the OL normalizer).** Pinned: an **API-local** four-field normalizer (the seeder's `mapSearchDocToBookRecord` returns a `BookRecord`, not this shape, and the seeder is out of scope). Confirm over extracting a shared `@unbnd/ol` package.
- **OQ-4 (controlled surface + never-clobber + debounce).** Pinned: lift **five** fields (`title`, `author`, `cover`, `year`, `pages`), keep `name=` (so `FormData`/`onSubmit` is unchanged), **500ms** debounce, trigger on a valid ISBN-13 **or** ISBN-10, never-clobber = **fill iff empty ∧ ¬dirty**. Confirm the five-field surface and the 500ms / dirty-set rule.
- **OQ-5 (cover-preview fallback + placement).** Pinned: an `<img>` with `onError`→`coverGradient(title)` block, in a fixed-size box adjacent to the cover input (no jank). Confirm the gradient fallback (over a neutral empty-state) and the placement.
- **OQ-6 (visual fixture).** Pinned: the `submit` test signs in, mocks `/api/ol/lookup`, drives search→proceed→ISBN→populated form, waits on the `.sub-autofill-note` sentinel; **`submit.png` is the only baseline that changes**, labeled commit. Recommended baseline capture = the **gradient-fallback** preview state (self-contained, no binary image fixture). Confirm the gradient-fallback capture over serving a real preview image.
