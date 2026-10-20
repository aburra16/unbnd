# Story 97: The books list says what it is

**Origin:** ecosystem catch-up (2026-10-19). brainstorm.world renders Unbnd's book catalog with a hand-built book view, keyed to the librarian's `books` list. The list's header still carries the June-era concept-graph shape (`d` plus a `json` blob), so every reader that goes through the declaration gets nothing: the list shows as lowercase "books" with a generic icon and no description, book pages have no link buttons, and List Management and other clients see no fields.

## Problem
The seeder republishes the `books` header at the start of every run, in the old shape, with a fresh timestamp. A header fixed by hand would be reverted by the next seed. The declared shape has to be the seeder's own output.

## Acceptance criteria
1. The seeder publishes the `books` header in the declared DList shape: singular and plural names, a description naming the source and the keeper, every field the items carry declared as required, recommended or optional with a human description, `field-type` on the cover URL, display hints (title, summary, image, facts), a pinned list image, a source/terms reference, link templates pinned by event id, and the self-pointing `b`. The old `json` tag stays.
2. Field names are exactly the tags the items already carry (no item republish; Brainstorm's book view keeps reading them).
3. One builder is the single source: a full seed run and a header-only run publish identical templates (bar `created_at`).
4. A header-only entrypoint (`headers.js`, bundled beside `recast.js`) and a `headers` task on the Staging ops menu publish the seeded headers without running the seed.
5. The drafted header and a sample of real items pass Brainstorm-UI's `listCheck` (`checkHeader` zero problems; `checkItem` zero blocking problems across the sample); the resolved output is read and recorded.
6. Link templates are signed by the operator before the header is published, from a local NIP-07 signing page (List Management publishes a new template only together with a header the same key signs, and this header is the librarian's); the header pins only templates whose signer is a held key (the existing Goodreads template is signed with the publicly known private key `1` and is not pinned).

## Out of scope
- An `i` (NIP-73 `isbn:`) tag on items, which joins books to the content-categories Books category (an item republish across the catalog; its own story).
- The other three seeded headers and the ten headers that exist only on the internal relay.
- How book reviews and ratings are shared with Brainstorm (a cross-team protocol decision).
- Publishing to search.brainstorm.world.
