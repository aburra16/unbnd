# ADR 0091: An early year never hides a book; a year before printing reads as unknown

**Status:** Accepted
**Date:** 2026-10-20
**Story:** `engineering-team/stories/103-pre-1800-classics.md`
**Amends:** ADR 0054 §2 (seed gate year signal), ADR 0055 §1 (read-time oracle year signal)

## Context
ADR 0054 gave the seed gate a year window of `1800..currentYear`, and ADR 0055 carried the lower bound into the read-time oracle `isJunkRecord` as `RECORD_YEAR_MIN`. Neither records why 1800. The 2026-10-20 hub count (story 103) shows what the floor actually catches: 181 records, all real books with a title, author and cover, none on the denylist. About 139 are genuine early works; about 42 are modern books whose Open Library `first_publish_year` was pulled back by a single mis-dated edition (Open Library takes the minimum over editions). The floor hides both groups and catches no junk. ADR 0055's own rule is that the oracle fires only on positive junk evidence; an early year is evidence about the year, not about the record.

Open Library dates printed editions. Movable-type printing in Europe starts in the 1450s (the earliest dated record on the hub is Cicero's De officiis, 1465), so a first-publish year before 1450 cannot be a real edition year. The hub has four such records (The War of the Worlds and The Invisible Man at 0, Two Years Before the Mast at 1000, The Vicar of Wakefield at 1111), each a real book with a bad year.

## Decision
1. **`PRINT_ERA_START = 1450`**, exported from `@unbnd/schemas` next to `JUNK_TITLE_RE`, is the single year floor. `credibleYear(year)` returns the year when it is a number at or after `PRINT_ERA_START`, and `undefined` otherwise.
2. **The oracle loses its lower year bound.** `isJunkRecord` still flags a missing title or author, a denylisted title, and a present year after `currentYear`; an early year no longer flags anything. `RECORD_YEAR_MIN` goes.
3. **Every read projection reports `credibleYear(publishYear)`**: the API's public book (`toPublicBook`), the pending-submission list (`toSubmission`), the search document (`buildBookDocument`) and the Open Library autofill (`ol-lookup`). The stored record is untouched; only what Unbnd shows and indexes changes, so a record re-signed later keeps its source year.
4. **The seed gate's window becomes `PRINT_ERA_START..currentYear`**, imported from schemas instead of a private `YEAR_MIN`. A doc with no year, a year before printing, or a future year still fails `"year"` (the seed gate stays stricter than the oracle, as ADR 0055 already allows).
5. **The submit form's lowest year is `PRINT_ERA_START`** (it was 1500, which neither matched the oracle nor admitted the incunabula already in the catalog).

## Alternatives rejected
- **Lower the floor to some earlier year and keep it as a junk signal.** Any floor still hides real books whose only fault is a bad year (The War of the Worlds at 0). The year is the wrong evidence for hiding a record.
- **Normalize the year when parsing the event.** Every consumer would see it, including the seeder's fingerprint and any code that re-signs a record, so a read concern would rewrite data at source. Projections are the read concern's home.
- **Hide modern books with implausible early years.** Nothing on a stored record tells Step on a Crack at 1658 from Hudibras at 1662. Fixing those years belongs at source.

## Consequences
- The 181 records resolve again on every surface after deploy, the indexer's next rebuild puts them back in search, and ratings that point at them (one legacy rating of Gulliver's Travels) count again.
- About 42 modern books show a wrong early year, as they did before Story 56. Follow-up: correct catalog years at source from the Open Library works record's `first_publish_date`.
- The next seeding epoch, whenever the operator runs one, enriches the 181 legacy records and may admit more early works.
