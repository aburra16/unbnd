# Story 64: Open Library metadata autofill + cover preview on submit

**Status:** Done
**Created:** 2026-06-06
**Type:** Feature / Hardening
**Review:** `engineering-team/reviews/64-submit-autofill.md`

## Background

This is the last Block E (platform hardening) item, PRD §2.11. The PRD asks for two things on the submission flow:

- **"OL metadata autofill on submit: pre-fill cover/page-count/year from OL on ISBN/title entry."**
- **"Cover preview in the submission form before submit."**

Today a submitter types every field by hand. The catalog already holds the same metadata the submitter is re-keying, and Open Library is the source the catalog itself was seeded from. Filling in known fields from an ISBN, and showing the cover before submit, removes friction and reduces typos without changing what a submission *is*.

### Survey (read-only, to ground the Architect)

- **The submit flow is search-first, then a form.** `apps/web/src/routes/Submit.tsx` renders `DuplicateCheck` (Story 15 / ADR 0015) first; only after the user searches the catalog and chooses "Add this book" / "Add it anyway" does `adding` get set and the form render. The form is plain HTML inputs inside `@unbnd/ui` `Field`/`Label` primitives, submitted via an uncontrolled `FormData` read in `onSubmit` (`Submit.tsx` lines 94–108). The only prefill today is the title: `defaultValue={adding.title}` on the title input (line 175), seeded from the search query (`onProceed({ title })`, `DuplicateCheck.tsx` line 105/120). Sovereign users sign the template in the browser (`api.submissions.template` → NIP-07 → `api.submissions.create`); custodial users post the raw input and the server signs (`api.submissions.createCustodial`).
- **The form already has every target field.** `Submit.tsx`: title, author, blurb, **isbn13** (`name="isbn13"`, line 198), isbn10, **publication year** (`name="year"`, line 209), **page count** (`name="pages"`, line 219), language, genres, **cover image URL** (`name="cover"`, line 254), where-to-read. So autofill is *populating existing inputs*, not adding form fields. The cover input already even hints `https://covers.openlibrary.org/...` (line 258).
- **The submission record stores all of them.** `apps/api/src/submissions/template.ts` `SubmissionInput` + the `BookRecord` it builds carry `title`, `authorName`, `isbn13`/`isbn10`, `blurb`, `coverUrl`, `publishYear`, `pageCount`, `language`, `subjects`, `purchaseUrl` (lines 15–29, 74–91). The web `SubmissionInput` in `apps/web/src/lib/api.ts` mirrors this. **So the fields the PRD names to autofill — cover, page-count, year — are already part of the submission shape. No schema change is needed; this story only fills existing optional fields.**
- **No Open Library fetch exists in `apps/api`.** Confirmed: `grep` for `openlibrary` / `covers.openlibrary` / `search.json` over `apps/api/src` returns nothing. OL fetching lives **only** in the seeder, server-side: `apps/seeder/src/{fetch,search,openlibrary,description}.ts`. The web app must **not** call OL directly (browser CORS, OL rate-limits, and coupling the client to a third party). The correct design is a small **API endpoint that fetches OL server-side and returns normalized metadata**, mirroring how the seeder already talks to OL.
- **The seeder OL patterns to reuse as precedent.**
  - **Search endpoint:** `apps/seeder/src/search.ts` pages `https://openlibrary.org/search.json` with a `fields` list that already includes `isbn`, `cover_i`, `first_publish_year`, `number_of_pages_median`, `title`, `author_name`, `key`, `subject` — i.e. an ISBN/title query against `search.json` returns exactly the fields this story needs.
  - **Cover URL synthesis:** `apps/seeder/src/openlibrary.ts` builds covers as `https://covers.openlibrary.org/b/id/{cover_i}-L.jpg` (lines 48, 104). For an ISBN the by-ISBN form `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg` is the natural analogue.
  - **The doc→record mapper already normalizes these fields:** `mapSearchDocToBookRecord` (`openlibrary.ts` lines 87–121) turns an OL search doc into `{ title, authorName, coverUrl, publishYear, pageCount, isbn13, isbn10, subjects, language }` — the exact normalization the lookup endpoint should return (minus the DList wrapping).
  - **Politeness + bounding:** `apps/seeder/src/fetch.ts` exports `SEEDER_USER_AGENT` (`unbnd-seeder/0.1 (+https://unbnd.ink; …)`) used on every OL request; `search.ts` bounds paging with `maxPages` and a `fetchImpl` injection seam for tests. The lookup endpoint should likewise send a polite User-Agent, set a timeout, and accept an injectable fetch for tests.
- **The cover-fallback pattern already in the repo.** `BookHeader.tsx` (lines 45–58) and `BookCard.tsx` (lines 32–52) both do `book.coverUrl ? <img src=coverUrl alt=""> : <gradient div with the title>` using `coverGradient(slug)` from `apps/web/src/lib/view-model.ts`. **Caveat for this story:** neither `<img>` carries an `onError` handler today, so a *broken* URL renders a broken image. A submission-form cover preview takes a user- or OL-supplied URL that may 404, so the preview needs graceful handling of a broken/absent image (an `onError` fallback to the gradient or an empty-state), which is slightly stronger than the current book-page behaviour.
- **The visual harness already has a `/submit` baseline.** `apps/web/e2e/visual/visual.spec.ts` test `"submit"` (lines 65–74) navigates to `/submit` and snapshots `submit.png` full-page. Crucially it captures the **at-rest `DuplicateCheck` prompt** ("Is the book already on Unbnd?"), *not* the form — the form only renders after a search+proceed. So the current baseline does **not** exercise the form at all. To cover the new autofill/cover-preview UI the fixture must drive the harness *into* the form (search → proceed) and ideally into a populated/preview state; that is a deliberate, labeled `submit.png` baseline change per ADR 0039.
- **Design-system constraints.** Any new UI must use `@unbnd/ui` primitives + tokens and keep the twelve `architecture-*` guards green (no raw color/type/spacing/shape/motion literal, no raw `<button>`, no raw `<svg>`). The cover preview is an `<img>` with a graceful fallback, mirroring the existing cover-img + gradient-fallback pattern.

PRD anchor: §2.11 Platform hardening (the two bullets above); §2.10/§16a (the submission flow this sits inside). This story fills existing optional submission fields and adds form UI; it does **not** change the submission schema or shape.

## User-facing description

As a curator or author submitting a book, I want the form to look up a book from Open Library by its ISBN and pre-fill the cover, page count, year (and title/author when they're still blank), and to see the cover before I submit, so that I add a clean, complete entry in seconds without re-typing data that already exists, while staying free to correct anything the lookup got wrong.

## Acceptance criteria

Testable from the outside. Each gets at least one test (the Tester picks the harness — unit, integration, the visual baseline, or a mix).

- [ ] Given a known ISBN (with OL mocked), when the lookup endpoint is called, then it returns normalized fields `{ title?, authorName?, coverUrl?, pageCount?, publishYear? }` (the present subset) for that book.
- [ ] Given OL is down, returns an error, or has no match (mocked), when the lookup endpoint is called, then it resolves to an empty or partial result and **does not throw** — the caller always gets a usable response.
- [ ] Given the lookup endpoint, when it calls OL, then it sends a polite User-Agent and is bounded by a timeout (a slow/hung OL cannot hang the request indefinitely).
- [ ] Given the submit form and an ISBN entered into the ISBN field, when the user pauses (debounced), then the lookup is called once and the **empty** fields among cover, page count, year (and title/author if returned) are pre-filled.
- [ ] Given a field the user has already typed into, when the lookup returns a value for that field, then the user's value is **not** overwritten (autofill never clobbers user input).
- [ ] Given any autofilled field, when it is populated, then the user can still edit or clear it (every autofilled value is overridable), and there is a clear, honest affordance that the data came from Open Library (no fabricated or silently-injected values).
- [ ] Given a lookup that fails or returns nothing, when the user continues, then the form remains fully usable and submittable by hand (best-effort autofill, never a blocker).
- [ ] Given a cover URL (from the lookup or typed manually), when it is present, then a cover preview image renders in the form before submit.
- [ ] Given an absent or broken/404 cover URL, when the form renders, then the preview shows the graceful fallback (the gradient/empty-state, mirroring `BookHeader`/`BookCard`), **not** a broken-image icon, with no layout jank.
- [ ] All twelve `architecture-*` guards stay green: the lookup affordance and preview use `@unbnd/ui` primitives + tokens, no raw color/type/spacing/shape/motion literal, no raw `<button>`, the preview is an `<img>` **with** a fallback (not a raw unguarded broken image).
- [ ] `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/web build` are green.
- [ ] The `submit.png` visual baseline is updated **deliberately, in its own clearly labeled commit** (per ADR 0039), driving the harness into the form state that shows the autofill affordance + cover preview; no other baseline changes.
- [ ] No AI-slop copy: any new strings (the "from Open Library" affordance, a "looking up…" / "no match" hint, preview alt/empty text) follow the copy rules — no em dashes, no declarative-negative or rhetorical-contrast constructions, no filler, plain bookstore voice.

## DList shapes touched

No new or changed shape. This story populates fields the kind-39999 submission record already carries (`coverUrl`, `pageCount`, `publishYear`, and optionally `title`/`authorName`), via the existing `SubmissionInput` → `BookRecord` path in `apps/api/src/submissions/template.ts`. No new kind, d-tag, or tag.

- `kind:39999` — book submission record (the existing optional `coverUrl`/`pageCount`/`publishYear` fields are the ones being autofilled; write-shape unchanged).

## In scope

- **API — Open Library lookup endpoint (server-side, best-effort).** A new endpoint that, given an ISBN (primary input; title optional), fetches Open Library server-side and returns normalized `{ title?, authorName?, coverUrl?, pageCount?, publishYear? }`. Graceful by construction: OL down / error / empty → an empty or partial result, never a 5xx that breaks the form. Bounded by a timeout and polite (a User-Agent), mirroring the seeder's OL patterns. The exact endpoint shape, OL endpoint(s), and whether to share the seeder's OL helpers or give the API its own are the Architect's to pin (see Open Questions).
- **Web — autofill in the submit form.** On ISBN entry, debounced (mirror the existing `DuplicateCheck` debounce posture), call the lookup and pre-fill the **empty** target fields (cover, page count, year, and title/author when returned and still blank). User-overridable, never clobbering a value the user already typed. A clear, honest "looked up from Open Library" affordance and a lightweight in-progress / no-match hint. Because the form is currently uncontrolled `FormData`, wiring autofill likely means lifting the relevant fields to controlled state (the Architect decides the minimal control surface).
- **Web — cover preview before submit.** Render the cover (from the lookup result or a manually-entered cover URL) as a preview image in the form, with a graceful fallback when the URL is absent or fails to load (mirror the `BookHeader`/`BookCard` gradient/empty-state pattern; add the `onError` handling the existing covers lack). No layout jank as the URL changes.
- **Visual — deliberate baseline update.** Adjust the `/submit` visual fixture so the harness is driven into the form (search → proceed) and shows the new autofill affordance + cover preview, and update `submit.png` deliberately in its own labeled commit per ADR 0039. No other baseline changes.

## Out of scope

- **No submission schema / shape change.** Only existing optional fields are populated. No new kind, d-tag, tag, or `BookRecord` field.
- **No change to the catalog seeder's OL fetch.** The seeder's import path (`apps/seeder/src/*`) is untouched; this story may *reuse* its patterns/helpers but does not alter the seeding behaviour.
- **No multi-source metadata.** Open Library only. No Google Books, no ISBNdb, no publisher APIs.
- **No auto-submit.** Autofill pre-fills the form; the user still reviews and submits. Nothing is published from a lookup.
- **No new design-system primitive.** The affordance and preview are built from existing `@unbnd/ui` primitives + tokens; no Modal, no new component package export.
- **No raw `<button>` / raw `<svg>` / raw color/type/spacing/shape/motion literal** introduced in `apps/web/src` (twelve guards stay green).
- **No change to the search-first `DuplicateCheck` step** beyond what's needed to drive the harness into the form; its dedup behaviour (ADR 0015) is unchanged.

## Open questions (for the Architect)

1. **OL endpoint(s) for an ISBN lookup + cover URL form.** Which Open Library endpoint best serves a single-ISBN lookup: `search.json?q=isbn:{isbn}` (reusing the seeder's `SEARCH_FIELDS`, which already include cover/year/pages), the Books API `?bibkeys=ISBN:{isbn}&format=json&jscmd=data`, or `/isbn/{isbn}.json` (+ a `/works/…` hop for the description/year)? And the cover form: `covers.openlibrary.org/b/isbn/{isbn}-L.jpg` vs `…/b/id/{cover_i}-L.jpg` from the resolved doc.
2. **Lookup endpoint shape + posture.** The route shape (e.g. `GET /api/ol/lookup?isbn=…`, optionally `&title=`), the timeout, the User-Agent, and whether to add any caching / rate-limit guard given this is a per-keystroke-ish client call (debounced) hitting a third party. Auth posture: open, or behind the session like the rest of `/api`?
3. **Share or duplicate the OL fetch helper.** Extract a shared OL-fetch/normalize helper usable by both seeder and API (a new shared package or module), or give the API its own thin fetcher mirroring `fetch.ts`/`search.ts`? Note the seeder's `mapSearchDocToBookRecord` already does most of the normalization.
4. **Debounce + which fields autofill vs stay manual.** The debounce interval and trigger (ISBN-13 only, or also ISBN-10 / title), and the exact field set to autofill (cover/pages/year always; title/author only when blank?). Confirm the "never clobber user input" rule's precise definition (empty vs untouched-since-load).
5. **Controlled-field surface.** The form is uncontrolled `FormData` today; what's the minimal set of fields to lift to controlled state for autofill + the cover preview, without rewriting the whole form?
6. **Cover-preview fallback mechanism.** The `onError`/absent handling for the preview (fall back to the `coverGradient` block as `BookHeader`/`BookCard` do, or a neutral empty-state), and where in the form layout the preview sits without jank.
7. **Visual-fixture change.** How to deterministically drive the `/submit` harness into the form + preview state (a fixture/mock that seeds the search result and the OL lookup), and confirm `submit.png` is the only baseline that changes, updated in its own labeled commit per ADR 0039.

## Linked artifacts

- Relates to: ADR 0015 / Story 15 (search-first `DuplicateCheck`), ADR 0016 / Story 16a (submission write + `SubmissionInput`/`BookRecord` shape), ADR 0008 / 0054 (seeder OL subjects + search fetch — the reusable precedent), ADR 0039 (visual-regression harness, the deliberate-baseline path), ADR 0052 / Story 53 (the `BookHeader` cover + gradient-fallback pattern mirrored here).
- ADR: `engineering-team/decisions/0063-submit-autofill.md` (to be written by the Architect)

## Phase-2 note

This is Phase 2 Block E (platform hardening), the last §2.11 item. It adds form UI and one best-effort server endpoint, fills existing optional submission fields (no schema change), and makes a deliberate visual change, so the labeled `submit.png` baseline update is expected rather than a red flag, consistent with the design-system discipline (tokens + primitives, twelve guards green, deliberate visual changes get a labeled baseline per ADR 0039) and the no-AI-slop copy rule.
