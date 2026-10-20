# Story 99: Book reviews move to the shared record

**Origin:** operator decisions of 2026-10-20 on bringing Unbnd's reviews in line with Regulars and Brainstorm. The shared rules are drafted as the books actions contract (Brainstorm-UI `docs/dictionary/books-actions.md`, branch `docs/books-actions-contract`, not yet merged); this story builds Unbnd's side of it.

## Problem
Unbnd stores a rating as a kind 39999 item under the librarian's `book-ratings` list, removes one with a `["retracted","true"]` replacement, and sends it to its own relay and dcosl. Brainstorm's book view reads kind 1111 comments. Neither app sees the other's reviews. The places contract already settled one record for a place (kind 34259); the books contract applies it to books.

## Acceptance criteria
1. **The record** (contract §3): a review is kind 34259 with `d` `book:<book address>`, `a` the address with the hub as relay hint, `m` `book`, `rating` (fraction, three decimals) and `s` (whole stars), `alt`, and the words as content, at most 1,200 characters. Unbnd's composer requires stars.
2. **Which reviews stand** (contract §4 and §6): one pure function decides, for every read: signature-checked kind 34259 naming a book in the librarian's catalog (by `a`, else by `d`); nothing dated more than a day ahead; newest per `d` (tie: lowest id); one per person per book; taken down by the author's own kind 5 (by `e`; by `a` only for versions dated no later than the removal; removals dated more than a day ahead ignored). Every rating read in the API and the shelves worker goes through it; the duplicated "newest per book" helpers collapse into it.
3. **Editing** builds on the person's current review: same `d`, dated `max(now, previous + 1)`, every tag Unbnd does not set carried over unchanged and in order except `client` and `nonce`.
4. **Removing** is a NIP-09 kind 5 with `e`, `a` and `k` `34259`.
5. **Publishing:** to Unbnd's relay first (it gates the response), then in the background to the reviewer's NIP-65 write relays when they have a relay list, and always to the review set: the index `wss://search.brainstorm.world`, `wss://nos.lol`, `wss://relay.primal.net`. Never dcosl.
6. **Reading what other apps write:** a background sync pulls kind 34259 `m book` reviews and kind 5 `k 34259` removals from the review set into Unbnd's relay (the index read under `search: "include:spam"`), keeping only signature-checked events about catalog books; and pushes Unbnd's recent reviews and removals to the index, the backstop for a failed background publish.
7. **Whose ratings count:** a reviewer's weight counts from rank 5 (weight 0.05) up; below it the review is shown and never counted.
8. A review without stars from another app is listed and enters no number.
9. The old record is retired: its schema, the retraction idiom, the `book-ratings` concept, its dcosl up-sync filter and health count. Guide entries that describe rating and removal are updated in the same story.

## Out of scope
- Moving the 17 existing ratings (story 100).
- No number without trusted ratings, and the hidden gem / overhyped "wider network" (story 101).
- Brainstorm's side (a separate writeup for its team).
