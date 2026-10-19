# ADR 0087: The books header is declared, and the seeder owns it

**Status:** Accepted
**Date:** 2026-10-19
**Story:** `engineering-team/stories/97-books-header.md`

## Context
Since June the DList ecosystem settled conventions this header predates: header declarations drive rendering (Brainstorm-UI `docs/dictionary/dlist-presentation-conventions.md`, ADR 0004/0007 there), are checked by `client/src/lib/listCheck.ts`, and are held to the operator's DList standard (names, description saying source and ownership, declarations with descriptions, display hints naming only declared fields, a version-pinned list image with its terms, URL templates pinned by event id and reused before created, exactly one self-pointing `b`). Brainstorm's `docs/dictionary/house-copies.md` already drafts a house copy for this list; fixing the community header at the source makes that copy unnecessary.

Item coverage, sampled from dcosl (3,000 items): title, author, cover, open-library-id, lang, year, subject, format, source 100%; isbn 99.9%; isbn10 99.9%; pages 99.5%; subject repeats on 97%.

## Decision
1. **A dedicated builder, `buildBooksHeaderTemplate`, in `apps/seeder/src/headers.ts`.** The generic concept-header builder stays for the three other seeded headers. A `seededHeaderTemplates(librarian, createdAt)` function returns all four, and both entrypoints publish exactly its output.
2. **The declaration:**
   - `names` Book / Books; `description` naming Open Library as the source and the Unbnd librarian as keeper.
   - `required` title; `recommended` author, cover, isbn; `optional` isbn10, open-library-id, year, pages, lang, subject, format, source. `optional`, not the NIP's `allowed`: Brainstorm reads `optional` and its import drops `allowed`.
   - `field-type cover url`.
   - `display`: title=title, summary=author, image=cover; facts year ("Published") and pages ("Pages"). No subject fact: it repeats, only the first value shows, and the first is sometimes a machine heading; the book view shows subjects itself. No lang fact: it is a raw ISO code.
   - `image`: the Unbnd mark pinned to a commit on GitHub (`assets/logos/android-chrome-512x512.png` at `0b45357`), with an `r` to the repository. The list is Unbnd's; its keeper's mark is the honest image. (Alternative recorded for the operator: a Twemoji book glyph under CC BY 4.0.)
   - `r` to Open Library's licensing page (the Internet Archive asserts no new rights; no named licence, so none is claimed).
   - `link`, in button order: Open Library work (`https://openlibrary.org/works/{id}` from `open-library-id`), then Goodreads by ISBN-13 (`https://www.goodreads.com/book/isbn/{isbn}` from `isbn`). Both as kind 9999 items on `39998:2efaa715…:url-templates`, signed by the operator. The existing Goodreads template (`8382b369…`) is signed with private key `1`, so anyone can publish a deletion for it; it is not pinned, and the finding goes to the Brainstorm team.
   - `["b", "39998:<librarian>:books", "pointer"]`; the `json` tag kept (the old concept-graph reading; nothing in Unbnd reads it, and dropping it gains nothing).
3. **Template ids are code constants** (`BOOKS_LINK_TEMPLATES`), reviewed like any other change. The header is not published until they are filled.
4. **Header-only publishing:** `src/publish-headers.ts`, a second esbuild entrypoint copied into the image as `headers.js`, plus a `headers` Staging ops task. It publishes to dcosl only (the down-sync cron brings it to the local relay), like the seed.

## Consequences
- Brainstorm's book view keeps working (its `lib/books.ts` reads the same names; a declaration now wins, and it declares the same names). The list gains its name, description, icon and book-page buttons; List Management and other clients see real fields.
- `house-copies.md`'s Books section becomes stale once published; worth a note to the Brainstorm team with the template-key finding.
- No item changes, no schema changes, no API or web changes.
