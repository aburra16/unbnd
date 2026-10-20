# Story 97: listCheck record

Run 2026-10-19, re-run 2026-10-20 after the Goodreads binding moved to ISBN-10, with Brainstorm-UI `client/src/lib/listCheck.ts` at `origin/staging` `00e7799f`, per `docs/dictionary/building-lists-with-claude.md`.

- `list.json`: the header exactly as `buildBooksHeaderTemplate` emits it, with two draft URL templates (stand-in ids `…01` Open Library work, `…02` Goodreads by ISBN-10), and 11 real items from dcosl chosen to be awkward (no ISBN, no page count, several authors, long titles, parenthetical authors).
- `listcheck-output.json`: the raw output.

**Header:** zero problems; both template ids recognised.

**Items:** zero blocking problems. Non-blocking, each read and accepted:
- `repeated subject` (11/11): subjects repeat by design. No display hint shows `subject`; Brainstorm's book view reads every value itself.
- `undeclared json` (11/11): the items' concept-graph blob, machine data, deliberately undeclared.
- `template-unfilled` (3/11): the three books with no ISBN get no Goodreads button. Correct.

**Resolved, read by eye:** every item gets title, author as summary, cover, Published/Pages facts, an Open Library link; 8/11 a Goodreads link. The summary shows authors as Open Library writes them ("Duncan, Michael (Podcaster)"); Brainstorm's book view normalises them, generic cards cannot without an item change (out of scope).
