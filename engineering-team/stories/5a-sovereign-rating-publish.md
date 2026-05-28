# Story 5a: Sovereign rating publish + generic publish/read-back core

**Status:** Draft
**Created:** 2026-05-28
**Type:** Feature

## Background

Cycle 1 built the `BookRating` schema (`@unbnd/schemas`, kind 39999, d-tag `rating--<slug>--<pubkey8>`, word-wrapper payload) but nothing in the app signs or publishes one. Cycle 4 made sovereign (Tier 1) users authenticate through the same uniform session as custodial users. This story closes the read→write loop for the **sovereign** path and builds the reusable core every later write story needs (PRD §4.1 step 5 "Rate and engage", §5.4 Actions "Rate 1–5 stars").

This is the first write path. It establishes the generic "publish a signed DList event to strfry, then read it back" plumbing. Genre tags, quality signals, shelves, and follows will all reuse it. Scoping to the sovereign path first keeps that core small and verifiable: the client already holds the key (NIP-07), so the server only validates a signed event and relays it — no key-handling lifecycle on the server. Custodial server-side signing (the heavier §8.2 ephemeral-wrap mechanism) is split into story 5b.

The read-back is deliberately **honest, not trust-weighted**. GrapeRank is not wired yet, so the book's rating summary shows a raw count and a raw arithmetic mean, presented as a plain community average. It does **not** display a trust-weighted score or any GrapeRank number — inventing one would violate the no-fake-numbers rule. Trust-weighting is a later personalization cycle (PRD §9.5).

## User-facing description

As a Reader (PRD §3.1) signed in with Nostr, I want to rate a book from 1 to 5 stars with an optional short review, so that my rating is recorded under my own key and contributes to the book's community rating, and so I can change it later.

End users see: on a book detail page, a sovereign-signed-in reader picks a star rating (and optionally writes a short review) and submits; their extension prompts them to sign; their rating is saved and reflected in the book's average. A signed-out visitor sees a prompt to sign in. A custodial (email) user sees a brief "this is coming for email accounts" state in place of the control — the custodial write path lands in 5b.

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: A sovereign signed-in user can submit a rating — `{ book reference, score 1–5, optional reviewText, reviewDate }`. The submission is encoded as a kind-39999 `BookRating` event via the existing `@unbnd/schemas` builder (d-tag `rating--<bookSlug>--<raterPubkey[:8]>`, with `z`/`a`/`p`/`score`/`review-date` tags and the word-wrapper payload). Out-of-range score (0, 6, non-integer) → 400.
- [ ] AC-2: The client signs the event via NIP-07 (`window.nostr.signEvent`) and posts the **signed** event to a publish endpoint. The server never receives a key.
- [ ] AC-3: The server validates the posted event through the audited signature stack (`nostr-tools.verifyEvent` / Applesauce, per the crypto policy): valid signature, `kind === 39999`, and `event.pubkey === the session user's pubkey`. A pubkey mismatch → 403 (no rating on behalf of another identity). An invalid signature or wrong kind → 400. No session → 401.
- [ ] AC-4: On a valid event the server publishes it to strfry and confirms acceptance (strfry `OK` / equivalent). A publish failure surfaces as a 502-class error, not a silent success.
- [ ] AC-5: A `publishEvent`-style core is generic over DList event kinds (not rating-specific), so later write stories reuse it. (Verified by its signature/tests operating on an arbitrary signed event, plus the rating route calling through it.)
- [ ] AC-6: A read endpoint returns, for a given book, the list of ratings and a summary — **raw count** and **raw arithmetic mean**, presented as a plain community average. No trust-weighted score and no GrapeRank number appears anywhere in the response or UI.
- [ ] AC-7: Re-rating the same book by the same user **replaces** the prior rating (same d-tag → replaceable event); the read-back count does not double for a user who rates twice.
- [ ] AC-8: The book detail page lets a sovereign signed-in reader choose 1–5 stars and an optional review and submit; success reflects their rating, failure shows a plain error. Signed-out → sign-in prompt; custodial → a brief "coming for email accounts" note (the 5b placeholder). Copy follows the no-slop rules; stars are the control, no raw trust numbers shown.

## DList shapes touched

- `kind:39999` — `bookRating` item (**created and published**). D-tag `rating--<slug>--<pubkey8>`; replaceable per (rater, book). Builder already exists in `@unbnd/schemas`.
- `kind:39998` — the concept header the rating's `z` tag anchors to (**referenced**, not created here). The Architect confirms which header against the existing `BookRecord` / concept-header schemas.

## Out of scope

- **Custodial server-side signing** — story 5b (the §8.2 session-scoped ephemeral-wrap signing service).
- **Trust-weighting / GrapeRank** (PRD §5.4 "trust-weighted rating", "people you trust rate this X") — later personalization cycle. Read-back is raw/unweighted, labeled honestly.
- Genre tagging, quality-signal writes, shelves, review upvotes, follows (kind 3) — later stories.
- Rate limiting on the write endpoint — reverse-proxy layer, cycle 5.
- Live/real-time updates via a strfry subscription to the browser — read-back is a request-time query.

## Open questions

The Architect resolves these in the ADR.

1. **Parent header.** Which kind-39998 header does the rating's `z` tag anchor to (per-book ratings header vs the book record vs a ratings concept)? Resolve against the `BookRecord`/concept-header schemas.
2. **Read-back source.** Query strfry directly at request time, or read the Neo4j projection (if the strfry→Neo4j sync covers ratings)? Whichever, the summary stays raw/unweighted.
3. **Publish transport.** How `apps/api` talks to strfry to publish (WebSocket `["EVENT", ...]` and await `OK`, vs an existing client). Confirm against the cycle-2 strfry probe/infra.
4. **Endpoint shape** for posting a signed event and the verify-pubkey-matches-session check.

## Linked artifacts

- ADR: `engineering-team/decisions/0005-sovereign-rating-publish.md`
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
