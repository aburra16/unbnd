# Story 15: Submission de-duplication (search-first)

**Status:** Approved
**Created:** 2026-05-29
**Type:** Feature / UX

## Background

The Submit page's "duplicate check" is a fixture (searches a hardcoded list, never the real catalog) and the form shows regardless — so users can add books that already exist. `/api/search` is live; the dedup check should use it. Per the operator UX discussion, the most intuitive pattern for "add an entry" is **search-first**: confirm it isn't already here before filling a form.

## User-facing description

As someone adding a book, I first **search** the catalog (title / author / ISBN). If it's already on Unbnd I'm shown the match(es) and can open the existing page. Only when nothing matches (or I confirm none is mine) do I get an **all-clear** to add it — and the form is prefilled with what I typed.

## Acceptance criteria

- [ ] AC-1: Submit leads with a **live search** (debounced, `/api/search`) — matches render as a **persistent inline list** (cover/title/author), each linking to the existing book. Not an ephemeral dropdown.
- [ ] AC-2: The submission **form is gated** — hidden until the user has searched and chosen to proceed.
- [ ] AC-3: **No results** for a real query (≥2 chars) → an all-clear "No match found — add this book" primary CTA → reveals the form, **prefilled** with the searched title.
- [ ] AC-4: **Results present but none is mine** → a quieter "Don't see your book? Add it anyway" → same reveal/prefill.
- [ ] AC-5: **ISBN exact match** (query is a 10/13-digit ISBN matching an existing book's `isbn13`) → a firm "This book is already on Unbnd →" banner linking straight to it (high-confidence; title matches stay advisory).
- [ ] AC-6: States read honestly (searching / empty / no-match / matches); copy follows the no-slop guidelines. Degrades gracefully if search is unavailable (let the user proceed rather than block).

## Out of scope / carry-forward

- The actual **submission write-path** (build/sign/publish the book record, authorship + where-it-lives) — **story 16**.
- Cover preview, richer metadata autofill from Open Library, author-claim — later.

## Linked artifacts
- ADR: `engineering-team/decisions/0015-submission-dedup.md`
- Reuses `/api/search` (story 12).
