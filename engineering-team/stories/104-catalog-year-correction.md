# Story 104: Catalog records carry a year the book could have been published

**Status:** Done
**Created:** 2026-10-20
**Type:** Bug

## Background
PRD §6.2 defines a record's `publishYear` as the original publication year, and the book page header (§5.4), the search year filter and the year sort (§5.3) all show or use it. Story 103 made early years visible again, and with them about 42 modern books whose year is centuries too early: Step on a Crack reads 1658, The Boys from Brazil 1637, The War of the Worlds 0.

The cause is upstream. Open Library's `first_publish_year` is the earliest year across a work's editions, so one mis-dated edition pulls the whole work back. Open Library's works record has its own `first_publish_date`, and it is right for some of these (Step on a Crack 2007), missing for others (The War of the Worlds, Persuasion), and wrong for many real early works (Macbeth 2003, Hamlet 1950, Gulliver's Travels 1966). It cannot be trusted on its own.

A year can be checked against two facts Open Library also holds: nothing was printed before 1450, and nobody published a book before they were born. Step on a Crack at 1658 fails the second test (James Patterson was born in 1947); Gulliver's Travels at 1726 passes it (Jonathan Swift was born in 1667). Open Library's birth dates are sometimes wrong too (it records Emma Darcy as born in 1983, while its editions of her romances run from 1985), so a failed test alone is not enough: a mis-dated edition also stands alone, decades before the next one (Step on a Crack: 1658, then 2007), while a real first year has reprints right after it.

The same check across the whole catalog of 11,282 records finds about 255 wrong years, most of them after 1800 (Open Library uses 1800 as a placeholder: A Tale of Two Cities and Middlemarch both read 1800).

The wrong years live in librarian-signed catalog records on the hub, so the fix belongs there, where every reader of the catalog sees it, Brainstorm's book view included.

## User-facing description
As a Reader, I want a book's year to be one it could actually have been published in, so that the book page, the year filter and the year sort tell me something true.

## Acceptance criteria
1. Given a catalog record whose year is before printing began or before its author could have written it, and no other edition follows it within a decade, the corrected record carries the earliest Open Library edition year that passes both tests. Step on a Crack 1658 becomes 2007, The Lake House 1662 becomes 2003, The War of the Worlds 0 becomes 1898, Two Years Before the Mast 1000 becomes 1840.
2. Given a record whose year passes both tests, its year does not change. Gulliver's Travels stays 1726, Hamlet 1603, The Canterbury Tales 1478, and a work with no known author birth date (Homer's Odyssey, 1488) keeps its year.
3. Given a record whose year fails a test but has another edition within a decade after it, its year does not change and the run reports it. Emma Darcy's Jack's Baby stays 1996, The Outsiders stays 1967.
4. Given a record with an impossible year and no Open Library edition year that passes both tests, the record is not changed and the run reports it by name.
5. An operator can run a dry run that changes nothing and lists every record it would correct (slug, title, author, the stored year and the new year), then the records it keeps and the ones it cannot resolve. Avi checks that list before anything is published.
6. The applied correction replaces each record at its own address, signed by the librarian, and changes only the year: every other field of the record stays as it was. Running it twice changes nothing the second time.
7. A future seeding epoch writes the same corrected year for a book it seeds, so a re-seed never puts a wrong year back.

## DList shapes touched
- `kind:39999`: catalog book records under the librarian's `books` header (`39998:<librarian>:books`): the `year` tag and the payload's `publishYear`, replaced in place.
- No new kinds, headers or tags.

## Out of scope
- Years that pass both tests but are still wrong, and corrections that land on a second mis-dated edition (The Boys from Brazil becomes 1969, not 1976). Open Library's edition years cannot tell those apart; the dry-run list is where a person catches them.
- Records whose Open Library work has since been merged into another (74 records; the search no longer returns their work id). Following those redirects is its own catalog-hygiene change.
- Community records (books submitted and promoted by readers). Their year is what the submitter entered; this story corrects only records the librarian imported from Open Library.
- The seed gate. It still drops a search result whose own `first_publish_year` is out of range; admitting more works is a seeding call.
- Running a seeding epoch, and the submit form's next-year limit (both carried from story 103).

## Open questions
None. The correction rule and the ops path are the Architect's (ADR 0092).

## Linked artifacts
- ADR: `engineering-team/decisions/0092-catalog-year-correction.md`
- Test plan: `engineering-team/stories/104-catalog-year-correction.test-plan.md`
- Review: `engineering-team/reviews/104-catalog-year-correction.md`
