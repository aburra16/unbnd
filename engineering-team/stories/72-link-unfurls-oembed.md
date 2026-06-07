# Story 72: Link unfurls and per-book metadata

**Status:** Approved
**Created:** 2026-06-07
**Type:** Feature

## Background
When a Founding Curator shares a book link, that link is how their curation travels. Today the web app is a static single-page app: every route serves the same generic HTML shell, so a book link pasted into the places curators actually post (group chats, social platforms, forums) unfurls as a bland, identical preview — the same title and image for every book, or nothing. The curation does not travel; the link is dead weight.

This story makes a shared book link render as a rich, book-specific card on other platforms: cover, title, author, the raw community rating, and top tags. That is the Block 2 gate for the social loop — "a shared book link unfurls as a rich card on the platforms curators actually post to" (social-loop PRD §10, Block 2 gate). It serves the Founding Curator (journey 4.1 step 5, their curation traveling) and the Trusting Reader who receives the link (4.2 step 1).

Anchor: `product-team/prd/social-loop.md` §5.5. The rating on the card is the **raw** community rating specifically because it is viewer-independent — an unfurl is seen by everyone identically, so a per-observer trust-weighted number would be meaningless and a POV violation (PRD §5.5 behavior; the same raw-vs-weighted principle as Hidden Gems / hype-gap, #70–#71).

## User-facing description
As a Founding Curator, I want the book links I share to unfurl as rich, book-specific cards on other platforms, so that the books I curate travel with their cover, author, community rating, and tags instead of a generic, dead preview.

## Acceptance criteria
Testable from the outside.

- [ ] Given a book that exists in the catalog, when its book URL (`/book/:slug`) is fetched the way a link-unfurling crawler fetches it, then the response carries book-specific preview metadata: the book's cover, title, and author (not the generic SPA shell's title/image).
- [ ] Given a book with community ratings, when the same URL is fetched, then the preview metadata includes the book's **raw** community rating and its top tags.
- [ ] Given the same URL, then a machine-discoverable oEmbed endpoint is advertised for that book, and requesting it returns a card payload (cover, title, author, raw rating, top tags) for auto-discovery by platforms that consume oEmbed.
- [ ] The rating shown on the card and in the metadata is the raw community rating, never an observer-weighted / trust-weighted number, and carries no trust score, tier, or "trusted" label.
- [ ] Given a book with no ratings yet, when its card is generated, then the card omits a rating entirely (no fabricated "0.0" or empty stars) — honest-empty, consistent with the rest of the app.
- [ ] Given a slug that resolves to no catalog book, when its URL or oEmbed endpoint is fetched, then no book card is fabricated (the request does not emit fake book metadata).
- [ ] A human visitor opening the same `/book/:slug` link in a browser still gets the normal interactive book page (the metadata addition does not break or replace the SPA experience).

## DList shapes touched
- `kind:39999` — book record (the per-book metadata source: title, author, cover, slug; under the librarian's `39998:<librarian>:books` concept). Read-only.
- `book-ratings` — the **raw** community rating aggregate for the book (the same raw average the book-detail page and Hidden Gems use; viewer-independent, no trust weighting on this path). Read-only.
- No new concept or kind. No event is written by this story.

## Out of scope
- The "value before account" read behavior on the shared-link landing (the full page readable with no account, the single write-action prompt). That is the sibling story #73 (also PRD §5.5). This story is only the unfurl card + per-book metadata/oEmbed surface.
- Any change to how the raw or trust-weighted ratings are computed (#70–#71 own that; this story consumes the existing raw aggregate).
- Author-claim editing of the metadata that appears on the card (shipped earlier; the card reflects whatever the catalog record holds).
- Unfurls for any route other than `/book/:slug` (profiles, shelves, the homepage).
- Hosting or generating new cover images. The card reuses the catalog record's existing cover URL. (PRD §11.3 out-of-scope — no file hosting; this story introduces none.)

## Open questions
For the Architect (Phase 2) — this is an architecture addition, not a one-endpoint job. The PO is naming the *what*; the *how* is the Architect's call.
1. **Rendering approach.** The SPA serves one static shell for all routes, so per-book head/preview tags are not per-route today. The Architect scopes how `/book/:slug` gets book-specific preview metadata: server-rendered head, bot-aware serving (detect crawlers and serve a metadata document), build-time static per-book documents, or an edge meta-injector. Constraint: a human visitor must still get the interactive SPA (AC-7).
2. **oEmbed shape + discovery.** The endpoint contract (request URL/params, JSON payload fields) and how it is advertised for auto-discovery. Architect picks against the oEmbed spec and the standard preview-metadata conventions platforms consume.
3. **Caching / load.** Crawlers may hit many book URLs; the Architect decides whether and how the per-book metadata read is cached (and whether it can reuse the existing homepage-shelves/serve caching posture — never compute trust on the request path).
4. **"Top tags" definition.** Which tags, how many, and their ordering on the card (e.g., the book's net-positive genre/tag assertions, top N). Architect confirms against the existing tag aggregation.

## Linked artifacts
- ADR: `engineering-team/decisions/0070-link-unfurls-oembed.md` (Accepted)
- Test plan: `engineering-team/stories/72-link-unfurls-oembed.test-plan.md`
- Review: `engineering-team/reviews/72-link-unfurls-oembed.md` (PASS)
