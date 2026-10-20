# Story 102: The librarian names its scorer (kind 10040)

**Origin:** found while writing the Brainstorm book-reviews brief (2026-10-20); the operator asked for it before the rating migration.

## Problem
Brainstorm finds a list curator's lens through the curator's kind 10040, which names the trusted scorer for each kind of score (`["30382:rank", <scorer>, <relay>]`). Mise En Place has one, so the places view shows "trusted by Mise En Place". Unbnd's librarian, the curator of the books list and Unbnd's house observer, has none. On Brainstorm, a book therefore has no curator lens: visitors see no star value, and the house view Unbnd shows has no counterpart there.

## Acceptance criteria
1. `librarian profile` also publishes the librarian's kind 10040: one tag per score type its scorer provides, exactly as Brainstorm's `/setup/<librarian>` reports it (`["<kind>[:<metric>]", <64-hex scorer>, <wss relay>]`), empty content.
2. Malformed entries are dropped; if `/setup` yields none (unknown observer, outage), the command publishes the kind 0 and 10002, then fails loudly so the operator re-runs.
3. It goes where the kind 0 goes (never dcosl). Brainstorm reads a 10040 from the owner's write relays and the common profile relays, and both are in that set.

## Out of scope
Changing which scorer the librarian uses; reading scores through the 10040 inside Unbnd (Unbnd's provider still uses `/setup`).
