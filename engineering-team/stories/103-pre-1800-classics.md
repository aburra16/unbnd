# Story 103: Books first printed before 1800 show again

**Origin:** found while preparing the legacy-rating migration (story 100, 2026-10-20): a reader's rating of Gulliver's Travels points at a book Unbnd says does not exist.

## Problem
The read-time prune (Story 56, ADR 0055) treats a catalog record whose `year` is before 1800 as junk, so the book 404s on its page and drops out of browse, search, shelves, For You and profiles. On the hub (`wss://dcosl.brainstorm.world`, librarian `books` header, checked 2026-10-20) that hides 181 of 11,282 records, and none of them is junk:

- About 139 are real works first printed before 1800: Homer, Dante, Chaucer, Shakespeare, Cervantes, Milton, Defoe, Swift (`ol-ol20600w`, 1726), Voltaire, Gibbon, Wollstonecraft.
- About 42 are modern books carrying a wrong Open Library year. Open Library's `first_publish_year` is the earliest year across a work's editions, so one mis-dated edition pulls it back: Step on a Crack reads 1658, The Boys from Brazil 1637, The War of the Worlds 0, Two Years Before the Mast 1000.

Every one has a title, an author and a cover, and no title matches the junk denylist. ADR 0054 and 0055 give no reason for 1800, and the seed gate uses the same floor, so these legacy records were never enriched either. Readers had rated Gulliver's Travels before it disappeared.

## Acceptance criteria
1. A catalog record is never hidden for an early year. Gulliver's Travels (1726), The Canterbury Tales (1478) and Hamlet (1603) resolve on their book pages and in search.
2. Junk stays hidden: a missing or blank title or author, a denylisted title, or a year after the current one still hide a record exactly as before.
3. A year before printing (before 1450) is not a publication year. The record shows, and Unbnd reports no year for it: the book page shows none, search does not index one, the pending-submission list shows none, and the Open Library autofill leaves the year field empty.
4. One constant names that floor, and every place Unbnd judges a year uses it: the read-time oracle, the read projections above, the seed gate and the submit form's lowest year.

## Out of scope
- Correcting the wrong years of modern books (Step on a Crack 1658). They show again with the year Open Library gives, as they did before Story 56. Correcting them at source is its own story (the Open Library works record often carries the right `first_publish_date`).
- Running a seeding epoch. The seed gate change lets the next epoch enrich the 181 legacy records and admit more early works; when to run it is an operator call.
- The submit form accepts next year while the oracle hides a year after this one. A separate mismatch, noted for follow-up.
