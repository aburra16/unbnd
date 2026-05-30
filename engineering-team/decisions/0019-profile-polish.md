# ADR 0019: Polish the logged-in profile — server-enriched shelves, honest activity counts, account-menu nav

**Status:** Accepted
**Date:** 2026-05-30
**Story:** `engineering-team/stories/done/19-profile-polish.md`

## Context

Story 18 (ADR 0018) shipped shelves. The signed-in user's own profile (`/profile/me`) now has three rough edges, all on the user's own surface, all trust-independent (Lane 1 — a single-author read of the user's own events). The story locks scope to `/profile/me` plus the account dropdown; no public-profile, no Mira retirement, no public browse, no top-nav.

The acceptance criteria (paraphrased): enriched shelf books rendered as cover+title+author cards reusing `BookCard`/`BookGrid` (AC-1); unresolvable shelf books omitted with the count recounted (AC-2); account dropdown gains "Your profile" → `/profile/me` and "Your shelves" → deep-link, both above "Sign out" (AC-3/AC-4); "Books rated" / "Reviews" / "Tags applied" reflect the user's real events (AC-5/AC-6/AC-7); a count that cannot be computed is hidden, never a fabricated `0`, while a true `0` may show (AC-8); `toShelfSlug` deduped from `@unbnd/schemas` (AC-9); the stale `BookShelf` doc-comment fixed (AC-10).

This is the logged-in slice of **PRD §5.5 User Profile Page** ("Stats: books rated, reviews written, tags applied") and **§5.6 Shelves** ("publicly visible shelves … with covers"). It does not expand scope. §11.3 out-of-scope items (social feed / activity stream, reading progress, federation, payments) are untouched — this wires the three *count* stats and enriches the shelf display, not a feed.

### Architecture invariants check (CLAUDE.md)
- **POV-first:** N/A. Every read here is `authors:[user.pubkeyHex]` — the user's own events, no trust weighting, no GrapeRank, no observer parameter. "Who is this true for?" — exactly one author, the signed-in user. There is no aggregate-across-authors output, so there is no per-POV column to compose.
- **Decentralized-first:** N/A at write time (no writes in this story). The counts read only the user's own signed events; nothing is gated.
- **Filter at view time:** honored — all three counts and the enrichment are computed on read from raw DList events. Nothing is precomputed or cached.
- **Librarian pubkey resolved at runtime:** honored — every concept handle is built from `deps.config.librarianPubkey` via the existing `lib()` accessor pattern (shelves.ts, books.ts, tags.ts). No hardcode.
- **No new tooling:** none added. `pnpm -r typecheck` and Vitest stay the gates.

### DList shapes
No new shapes. All four reads are existing kind-39999 records, read with `authors:[user.pubkeyHex]`:
- Shelf membership under `39998:<librarian>:book-shelves` (the `/api/shelves/mine` read being enriched).
- Book records under `39998:<librarian>:books` (the enrichment source; already projected to `PublicBook` by `apps/api/src/routes/books.ts`).
- Ratings under `39998:<librarian>:book-ratings` (counted for Books-rated / Reviews; today read per-book by `#a`, here read by author + `#z`).
- Tag assertions under `39998:<librarian>:book-tag-assertions` (counted for Tags-applied).

### Tapestry prior art
The relevant patterns were already cribbed into this codebase by prior ADRs and are reused verbatim here — no fresh survey is warranted because no new shape is introduced:
- Single-author "my events" read: `git show origin/feat/communities:COMMUNITY_RECORDS_DLIST.md` is the closest pattern; it is already realised by `GET /api/shelves/mine` (ADR 0018), whose `authors:[user.pubkeyHex]` filter the counts copy directly.
- Latest-wins dedupe / polarity: `git show origin/feat/pubkey-tagging-target:engineering-team/decisions/0009-...` is realised by `apps/api/src/tags/aggregate.ts` and `apps/api/src/ratings/summary.ts`, both reused here.

---

## Decision 1 — Shelf enrichment

### Option A — server-side enrichment of `/api/shelves/mine` (chosen)
Enrich the existing read so each shelf book is returned `PublicBook`-shaped. After `groupOwnShelves(events)` produces the grouped shelves, collect the distinct `bookSlug`s across all shelves, run **one** batch catalog read (`{ kinds:[39999], "#z":[booksConcept()], "#d": distinctSlugs }`, the same filter `GET /api/books?slugs=` already uses), build a `slug → PublicBook` map via the existing `parseBook`, and replace each shelf's `books: ShelfBook[]` with `books: PublicBook[]`, dropping any slug with no resolved record. Recompute `count` from the surviving list.

- **Pros:** one mapping (`BookRecord → PublicBook`), already audited for the hex/parent-header boundary; one extra relay round-trip total (not per-shelf, not per-book); the web layer just maps `PublicBook → Book` with the existing `toCardBook` and renders `BookGrid`; AC-2 (omit + recount) falls out of the server-side filter for free; no client waterfall.
- **Cons:** changes the `/api/shelves/mine` response shape (`books` element type changes from `{bookSlug, bookAtag}` to `PublicBook`), which the web `Shelf` type and `ProfileMe` must follow. Couples the shelves read to the catalog read (acceptable — both already live in the same server, both resolve the same librarian).

### Option B — web-side merge via `api.books.list` (rejected)
Keep `/mine` a pure membership read; in `ProfileMe`, collect slugs across shelves, call `api.books.list(slugs)`, merge by slug client-side, drop unresolved.

- **Pros:** `/mine` stays a thin membership read.
- **Cons:** a client waterfall (load `/mine`, then a second request), a second place the missing-book handling lives, and client glue to re-key books onto shelves. More moving parts for no benefit the server path lacks. The hex/parent boundary is the same either way (both go through `PublicBook`).

**Chosen: Option A.** It reuses the one projection, keeps the boundary on the server, and gives AC-2 for free. The PO leaned server-side; this confirms it.

### Unresolvable-book handling (Q1 → AC-2)
**Omit and recount.** A shelf entry whose slug resolves to no catalog record is dropped from the returned `books` array, and `count` is set to the surviving length. No slug-link fallback, no placeholder card, no fabricated cover. The trivial slug-link fallback the PO allowed is **not** taken: it would reintroduce the raw `ol-ol21177w` label AC-1 exists to remove, and "omit" is the honest reading consistent with the no-fabricated-data rule. The dropped slug is simply absent; this is a data-quality signal (a shelved book the catalog no longer holds), not an error.

### Response shape (Decision 1)
`apps/api/src/shelves/aggregate.ts` `Shelf.books` stays `ShelfBook[]` (the aggregate is the membership layer and should not know about catalog records). Enrichment is a **separate step in the route**, producing a new response type local to the route layer:

```ts
type EnrichedShelf = { slug: string; name: string; count: number; books: PublicBook[] };
```

`GET /api/shelves/mine` returns `{ shelves: EnrichedShelf[] }`. The web `Shelf` type changes its `books` to `PublicBook[]` and drops `ShelfBook` from the profile path. (`ShelfControl` reads `/api/shelves/mine` too — see Consequences; it only uses `slug`/`name`/`count`, so it is unaffected by the `books` element-type change.)

---

## Decision 2 — Activity counts

### Option A — one combined `GET /api/profile/me/stats` (chosen)
A new authenticated route, sibling to `/api/shelves/mine`, that runs the three author-scoped reads (in parallel via `Promise.all`), aggregates each with the existing dedupe/polarity logic, and returns only the counts it could compute:

```
GET /api/profile/me/stats   (session-gated; 401 when signed out)
→ 200 { stats: { booksRated?: number; reviews?: number; tagsApplied?: number } }
```

A field is **present** when its read succeeded (a true `0` is a present `0`), and **absent** when that single read threw. Each read is wrapped independently so one failing source does not blank the other two. This is the AC-8 honesty rule expressed in the shape: an absent field → the web hides that stat; a present `0` → the web shows `0`.

The three aggregations, reusing existing logic:
- **booksRated** — read `{ kinds:[39999], "#z":["39998:<lib>:book-ratings"], authors:[userHex] }`, run `dedupeRatings(events)` (already latest-wins per author; here every event is the same author, so it dedupes to one current rating per book via the `(author)` key — see note below), count the result. **Note:** `dedupeRatings` keys by `pubkey`, which collapses *all* of the user's ratings to one. That is wrong for a per-book count. The Implementer must dedupe by **book** for this author-scoped use: key the latest-wins map on `bookSlug` (the rating's `bookSlug`/`bookAddress.dTag`), not on `pubkey`. Add a small `countOwnRatings(events)` helper in `ratings/summary.ts` that reuses the existing parse (`fromBookRatingEvent`) and returns `{ booksRated, reviews }` in one pass. Do not repurpose `dedupeRatings` — its `pubkey` key is correct for the per-book public read and must stay.
- **reviews** — same deduped-by-book set; count those whose `reviewText` is non-empty after `trim()`. Subset of booksRated. Returned from the same `countOwnRatings` pass.
- **tagsApplied** — read `{ kinds:[39999], "#z":["39998:<lib>:book-tag-assertions"], authors:[userHex] }`; latest-wins per **(bookSlug, tagSlug)** pair (mirror `aggregate.ts` keying, but key on the `(book, tag)` pair rather than `(author, tag)` since author is fixed); count pairs whose latest polarity is `+1`. Add a `countOwnAppliedTags(events)` helper in `tags/aggregate.ts` reusing `parseAssertion`. Disputes (latest `-1`) and retractions are excluded by construction.

- **Pros:** one request from `ProfileMe` (it already fires `submissions.mine()` + `shelves.mine()`; a third parallel call fits the existing effect); the per-stat present/absent shape expresses AC-8 directly; counts logic lives next to the existing aggregates it reuses.
- **Cons:** a new endpoint (small). Three reads behind one call (Q3: at staging volume an author-scoped scan is trivial; combining them here means one round-trip and one place to add caching later if it ever gets hot — flagged, not built).

### Option B — three small endpoints / extend `/api/profile/:id` (rejected)
Either three separate `GET`s, or hang the counts off the existing public `/api/profile/:id` route.

- **Cons of three endpoints:** three round-trips, three loading states, more web glue, for data always rendered together.
- **Cons of extending `/api/profile/:id`:** that route is **public** (any npub, kind-0 best-effort) and unauthenticated; the counts are a *self* read gated on the session. Bolting a session-gated author scan onto a public-by-id route muddies the boundary and risks leaking a "compute counts for arbitrary pubkey" surface this story does not want. Keep the self-stats read on a session-gated `/me` route, mirroring `/api/shelves/mine`.

**Chosen: Option A** — one combined session-gated `/api/profile/me/stats`, per-stat optional fields.

### Web change (ProfileMe)
Replace the hard-coded `value: 0` stats (~lines 72-77). Fetch stats in the existing effect (`api.profile.meStats()`), hold `stats: { booksRated?, reviews?, tagsApplied? } | null`. Build the `ProfileStats` array from only the **present** fields: a missing field contributes no cell (the stat is hidden); a present `0` renders `0`. `ProfileStats` takes `{ label, value: number }[]`, so the filter happens in `ProfileMe` before constructing the array — no `ProfileStats` change needed. If the whole call fails, all three are absent and the stats section renders empty (or is omitted) — the honest "couldn't compute" state, never three zeros.

---

## Decision 3 — Account-dropdown nav

Keep `AccountMenu.tsx`'s existing structure (the `acct-id` identity `Link` at top, the outside-click/Escape close, the `setOpen(false)` on click). Insert two `role="menuitem"` entries between the identity link and the "Sign out" button, in this order:

1. **"Your profile"** → `<Link to="/profile/me">`, `onClick={() => setOpen(false)}`. (AC-3.) The existing `acct-id` block is already a link to `/profile/me`; this adds an explicit labelled row beneath it per the AC, which requires a "Your profile" entry above "Sign out".
2. **"Your shelves"** → `<Link to="/profile/me#shelves">`, `onClick={() => setOpen(false)}`. (AC-4.)
3. **"Sign out"** → unchanged, stays last.

**Anchor mechanism (Q2): hash fragment + section id.** Add `id="shelves"` to the "Your shelves" `<section>` in `ProfileMe` and link to `/profile/me#shelves`. Chosen over imperative scroll-into-view-on-mount because:
- It is declarative, shareable/bookmarkable, and survives a hard navigation when the user is already on `/profile/me` (React Router updates the hash; a small `useEffect` on `location.hash` calls `scrollIntoView` for the in-page case where the route does not remount).
- Scroll-into-view-on-mount fires once and does the wrong thing when the user is already on the page (no remount, no scroll). The hash + a `hash`-watching effect covers both the cross-route and same-route cases with one mechanism.

Implementer note: shelves load async, so the target section exists at mount but its content height settles after the `shelves.mine()` resolves. Scroll on hash change *and* after shelves load (guard so it only auto-scrolls when the hash is `#shelves`). No top-nav link is added anywhere (AC-4 is explicit). Dropdown only.

No new icon library, no new hex literal — the new menu items reuse the existing `acct-*` CSS classes and brand tokens already in `AccountMenu.css`. Copy ("Your profile", "Your shelves") is plain, no banned constructions; reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

---

## Decision 4 — The two cleanups (trivial; for the Implementer)

- **AC-9 — `toShelfSlug` dedupe.** `apps/web/src/components/ShelfControl.tsx` defines a local `toShelfSlug` (lines 44-49) that is a near-duplicate of the exported `@unbnd/schemas` `toShelfSlug` (`packages/schemas/src/BookShelf.ts`). Remove the local copy; import from `@unbnd/schemas` (already re-exported via `packages/schemas/src/index.ts`). **Behavioral difference to handle:** the schemas version **throws** when the name normalizes to empty; the local copy returns `""`. ShelfControl's caller (line 114, in the new-shelf path) must guard for empty/whitespace input before calling, or catch the throw, so the existing slug cases still pass and an empty custom name does not crash the control. The Implementer picks the guard; the test plan should cover empty-name input.
- **AC-10 — stale doc-comment.** `apps/web/src/data/profile-fixtures.ts` (~line 21) doc-comment on `ProfileShelfFixture` still says "UI augmentation of the wire-shape `@unbnd/schemas` BookShelf." That wire type was renamed and the model changed in Story 18. Rewrite the comment to describe the current `ProfileShelfFixture` shape accurately (a fixture/UI shape, not a `@unbnd/schemas` wire type). Pure comment change.

---

## Decision 5 — Invariants (confirmation)

- **npub-display / hex-internal:** enrichment goes through `PublicBook`, which carries no hex and no parent header (books.ts `toPublicBook`); the stats response carries only integers. No hex leaks to the wire. The profile header already shows npub (ADR 0012). Honored.
- **Honest empty states / no fabricated counts:** AC-8 is the response shape (optional per-stat fields; absent → hidden; true `0` → shown) and AC-2 (omit + recount). No `0` is ever invented. Honored.
- **Derive UI from existing components:** shelves render via `toCardBook` + `BookGrid`/`BookCard`; counts via `ProfileStats`; menu via the existing `AccountMenu` structure and `acct-*` classes. No new component, no new icon library, no new hex literal. Honored.
- **No provider-seam leakage:** N/A — no search/trust provider touched. Stated for completeness.
- **Scope:** stays `/profile/me` + the account dropdown. No public-profile (`/profile/:handle`) change, no Mira retirement, no public shelf browse, no top-nav. Confirmed.

---

## Consequences

- **Enables:** a legible own-profile — real covers, working nav, honest counts. Sets up (does not build) the later public-shelf-browse story, which will need a per-POV-free public variant of the enrichment.
- **Constrains:** the `/api/shelves/mine` response `books` element type changes (membership tuple → `PublicBook`). Every consumer of `api.shelves.mine()` must follow. Known consumers: `ProfileMe.tsx` (rewritten here) and `ShelfControl.tsx` (uses only `slug`/`name`/`count`, unaffected by the `books` element change — verify in implementation). The web `Shelf` type in `apps/web/src/lib/api.ts` and the server `Shelf`/new `EnrichedShelf` type change together.
- **Follow-ups / debt:** Q3 — if the author-scoped stats scan ever gets hot, the combined endpoint is the one place to add a short-TTL cache; not built now. `dedupeRatings` keeps its `pubkey` key for the public read; the new own-count helpers key by book/pair — two keyings, documented so they are not conflated.
- **Affects existing fixtures?** Yes (minor): `apps/web/src/data/profile-fixtures.ts` — the AC-10 doc-comment fix. The `ProfileShelfFixture` *shape* is not changed by this ADR; only its comment. If `ProfileMe` stops rendering the fixture in favour of the live enriched read, the fixture may become unused — the Implementer should check and, if so, note it (removal is out of this story's edits unless trivial).
- **New dependency?** No.
- **PRD section change required?** No. This is the logged-in slice of §5.5 / §5.6 as written; no claim is invalidated.

---

## Implementation notes

- **`apps/api/src/routes/shelves.ts`** — in the `GET /api/shelves/mine` handler, after `groupOwnShelves(events)`: collect `distinctSlugs = [...new Set(shelves.flatMap(s => s.books.map(b => b.bookSlug)))]`; if non-empty, `const bookEvents = await deps.query({ kinds:[KIND], "#z":[booksConcept()], "#d": distinctSlugs })` (add a `booksConcept = () => `39998:${lib()}:books`` accessor, mirroring books.ts); build `bySlug` via the books-route `parseBook` (extract `parseBook`/`toPublicBook` into a shared `apps/api/src/books/project.ts` or import from the books route — Implementer picks the smaller diff); map each shelf to `EnrichedShelf` dropping unresolved slugs and recomputing `count`. Return `{ shelves: enriched }`.
- **`apps/api/src/ratings/summary.ts`** — add `export function countOwnRatings(events): { booksRated: number; reviews: number }`: parse with `fromBookRatingEvent`, latest-wins map keyed on `bookSlug`, count entries (booksRated) and entries with non-empty trimmed `reviewText` (reviews). Leave `dedupeRatings` untouched.
- **`apps/api/src/tags/aggregate.ts`** — add `export function countOwnAppliedTags(events): number`: parse with `parseAssertion`, latest-wins map keyed on `${bookSlug}|${tagSlug}`, count entries whose latest polarity is `+1`.
- **New: `apps/api/src/routes/profile-stats.ts`** (or extend the existing profile router with a `/me/stats` sub-route that takes a `sessionUser` dep — Implementer picks; keep it session-gated like shelves.ts). Handler: resolve `sessionUser`; 401 if none; 503 if no librarian. Run the three author-scoped reads each wrapped so a single failure omits only its field; aggregate via the two new helpers + the tag count; return `{ stats: { booksRated?, reviews?, tagsApplied? } }`. Mount in the API server wiring next to the shelves router.
- **`apps/web/src/lib/api.ts`** — change the `Shelf.books` type to `PublicBook[]` (remove `ShelfBook` from the profile path or keep the type but stop using it for `/mine`); add `api.profile.meStats()` → `{ stats: { booksRated?: number; reviews?: number; tagsApplied?: number } }`.
- **`apps/web/src/routes/ProfileMe.tsx`** — fetch stats in the existing effect; build the `ProfileStats` array from present fields only; render shelves with `toCardBook` + `BookGrid` (replace the raw-slug `<a>` list, lines 89-95); add `id="shelves"` to the shelves `<section>`; add a `useEffect` on `location.hash` (and post-shelves-load) that scrolls `#shelves` into view when the hash matches.
- **`apps/web/src/components/AccountMenu.tsx`** — insert "Your profile" (`/profile/me`) and "Your shelves" (`/profile/me#shelves`) menu items between `acct-id` and the sign-out button, each `onClick={() => setOpen(false)}`, reusing `acct-*` classes.
- **`apps/web/src/components/ShelfControl.tsx`** — remove local `toShelfSlug`; import from `@unbnd/schemas`; guard the new-shelf path for empty/whitespace names (schemas version throws on empty).
- **`apps/web/src/data/profile-fixtures.ts`** — rewrite the `ProfileShelfFixture` doc-comment (AC-10).

## Out of scope

- Public browse of other users' shelves; the `/shelves/:user/:slug` page; custom-shelf rename/delete; NIP-44 private shelves; an activity feed / genre-affinity chart; Mira retirement on `/profile/:handle`; a top-nav "Shelves" link; followers/following counts. All later stories.
- Caching the stats read (deferred; flagged in Consequences — not needed at staging volume).
