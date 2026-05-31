# Story 24: Make user identities clickable → reach any profile (link every rater + the submitter)

**Status:** Draft
**Created:** 2026-05-31
**Type:** Feature

## Background
Stories 20 and 23 shipped the destination (public profiles at `/profile/:npub`) and the action (follow / unfollow), but neither is organically reachable from inside the app. There is no people-search, and the user identities the app already renders are plain text, not links. A reader who likes a curator's taste on a book page has no in-app path to that curator's profile, so the follow graph cannot grow by browsing.

This story makes the identities the app **already displays** clickable, each pointing at `/profile/:npub`. It is the read-side connective tissue between Story 20 (public profiles) and Story 23 (follow): see a name → reach the profile → follow. It anchors in **phase2-prd §2.4 "Public profiles + real activity"** (profiles must be reachable to matter) and **§2.6 follow graph** (follows grow by discovery). It does not expand PRD §11.3 out-of-scope: no social feed, no search, no new profile data, no new write path.

The user raised a specific gap. On a book page the only identities shown today are **review bylines** — raters who wrote review text (`ReviewsList.tsx` filters to `reviewText.trim() !== ""`). But the ratings payload already carries **every** rater (npub + score, `reviewText` optional). Rate-only users (a bare star score, no note) are in the data and are currently invisible, so they are unreachable and un-followable. This story must surface and link **all** raters on a book, not just the ones who wrote text.

Affected personas: a **Reader** or **Curator** browsing a book who wants to find and follow the people behind the ratings; the **profile owner** who becomes reachable instead of being a dead-end string.

## User-facing description
As a Reader browsing a book, I want every person who rated it — those who wrote a review and those who only left a star score — to be a clickable identity that takes me to their profile, so that I can find a curator whose taste I like and follow them.

As a Reader on the community submissions page, I want the person who added a submission to be a clickable identity, so that I can reach their profile.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] **AC-1 — Every rater is surfaced on a book page, not just reviewers.** Given a book whose ratings include both reviews (with text) and rate-only scores (no text), when a visitor opens the book detail page, then every distinct rater that the ratings response returns for the active perspective is represented in the UI (a reviewer in the reviews treatment, a rate-only rater in the "Rated by" treatment per the layout decision below), with the rater count matching the number of raters in the response. No rater present in the response is omitted from the page.
- [ ] **AC-2 — Each rater identity links to its profile.** Given any rater shown on the book page (review byline OR rate-only entry), when the visitor activates that identity, then they navigate to `/profile/<that rater's npub>`, where `<npub>` is the exact npub string the ratings response carries for that rater. The link target is the npub-addressed profile route from Story 20.
- [ ] **AC-3 — A rate-only rater shows name + score and links.** Given a rater in the response with no review text, when the book page renders, then that rater appears in the "Rated by" treatment showing their identity (short-npub display, with the `Avatar`) and their star score, and the identity is a link to `/profile/:npub`. No fabricated review text is shown for a rate-only rater.
- [ ] **AC-4 — Submitter on the submissions page links.** Given a community submission whose `submitter` npub is present, when a visitor opens `/submissions`, then the "added by <submitter>" identity is a link to `/profile/<submitter npub>`. Given a submission with no `submitter`, then no "added by" text and no broken link render (current behavior preserved).
- [ ] **AC-5 — npub for display, hex never required.** Given any of these links, when it renders, then the visible identity uses the short-npub display treatment already in use (`shortNpub`) and the href is built from the npub the API returned; no hex pubkey is shown and no client-side hex→npub conversion is introduced for identities that already arrive as npub.
- [ ] **AC-6 — Perspective consistency on the book page.** Given the book page is in the House view vs. the "Yours" (trust-weighted) view, when raters render, then the set of raters shown matches the set in the active perspective's response (House/raw shows all raters; the trust-weighted view shows the raters that perspective returns), and every shown rater links to its profile in both views. (The story links whoever the existing response surfaces per perspective; it does not change which raters a perspective returns.)
- [ ] **AC-7 — Layout is preserved, reviews keep their weight.** Given the chosen layout, when the book page renders with reviews present, then the written-review treatment remains the prominent block (clickable byline) and the rate-only raters appear in a separate compact "Rated by" affordance; the existing ratings summary block (average + count) is unchanged, and no existing spacing/section is clobbered.
- [ ] **AC-8 — No fabrication, no empty placeholders.** Given a book with zero ratings, when the page renders, then neither the reviews block nor the "Rated by" affordance renders (no empty shell, no placeholder raters). Given a book with only rate-only scores and no reviews, then the reviews block does not render and the "Rated by" affordance does render.
- [ ] **AC-9 — Review byline resolves the rater's display name and links.** Given a reviewer whose kind-0 carries a display name, when their review renders, then the byline shows that resolved display name (not the short-npub). Given a reviewer with no kind-0 name, when their review renders, then the byline falls back to the short-npub display (`shortNpub`). In both cases the byline is a link to `/profile/<that rater's npub>` (the exact npub from the ratings response). The name is resolved via the same cached profile-metadata path the "Rated by" badges use, so a reviewer who also appears as a badge resolves a single kind-0.

## Recommended UI layout — surfaced as a gate decision

Two candidates for surfacing all raters on the book page:

- **(a) Reviews-prominent + compact "Rated by" row.** Keep the written-reviews block as-is (now with a clickable byline). Add a separate compact "Rated by" affordance below/beside it: a row or list of all raters (or just the rate-only ones), each `Avatar` + short-npub + their star score, each a link to `/profile/:npub`.
- **(b) Unified ratings list.** Collapse reviews into a single ratings list where review text is an optional part of each row; every rater appears uniformly in one list.

**PO recommendation: (a).** A written review is a higher-effort, higher-signal contribution than a bare star, and the page should keep showing that. Option (b) flattens that distinction and visually demotes reviews to "a rating that happens to have text," which loses the editorial weight reviews carry on a discovery surface. Option (a) also derives cleanly from existing components (the current `ReviewsList` block stays; the "Rated by" row reuses `Avatar` + `shortNpub` + the star glyph already in `ReviewsList`) and is the smaller, lower-risk change. The user leans (a) as well; this is flagged as a gate decision (Open Q1) so it is settled before Architecture. Whether "Rated by" lists *all* raters (reviewers included, for a complete at-a-glance roster) or *only the rate-only* raters (reviewers already appear above) is a sub-decision for the Architect/handoff; PO leans rate-only to avoid showing a reviewer twice, but either is acceptable as long as no rater is unreachable (AC-1).

The "Rated by" label is the proposed copy (plain, no slop). Architect/implementer may pick an equally plain alternative; it must pass the copy rules in `memory/feedback_unbnd_copy_and_visual.md`.

## API finding (verified, not assumed)
**The API already exposes every rater's npub. No server change is needed for the House view.**
- `apps/api/src/ratings/summary.ts`: `PublicRating = { npub, score, reviewText?, reviewDate }`. `toPublic` emits the npub for every rater. `rawFromParsed` maps **every** deduped rater (`deduped.map(toPublic)`) into `RatingsSummary.ratings`.
- `apps/api/src/routes/ratings.ts` `GET /api/books/:slug/ratings` responds `{ ...raw, weighted }`, so `ratings` already contains every rater (text or rate-only); rate-only raters are **not** filtered server-side.
- The web side is where rate-only raters disappear: `apps/web/src/components/ReviewsList.tsx` filters to `reviewText.trim() !== ""`. So this is a **web-only** change for the House/raw path.
- Caveat for the Architect: in the trust-weighted views, `weighted.ratings` (`weightedRatings`) only includes raters with a positive trust weight for that observer. That is correct POV behavior, not a bug — AC-6 links whoever the active perspective returns and does not ask any perspective to widen its set.

## DList shapes touched
No new DList shape and no new read. This is a presentation change over data the app already fetches.
- `kind:39999` — book ratings under `39998:<librarian>:book-ratings` (already read by `GET /api/books/:slug/ratings`; this story links the raters it already returns).
- The submitter npub on `/submissions` (`SubmittedBook.submitter`, `apps/web/src/routes/CommunitySubmissions.tsx`) is already fetched; this story links it.

## Out of scope
Stated explicitly; each is a separate story and must not creep in:
- **People-search / npub search.** Deferred until Brainstorm's kind-0 / Vespa search exists; it will be a sectioned second search source behind the existing provider seam. Not this story.
- **Follow buttons on bylines.** This story makes identities *links* only. Follow-on-byline is a thin follow-up once links land; not here.
- **Clickable shelf-OWNER attribution on a shelf-browse page.** Belongs with the deferred shelves-extras / public-shelf-browse story. Not here.
- **Any new profile data, any kind-0 read/write, any new endpoint.** Display-and-link over existing data only.
- **Changing which raters a perspective returns** (trust math is untouched; AC-6 links the existing set).
- PRD §11.3 Phase-2+ items generally: social feed, payments, Blossom hosting, ebook sales, federation, email notifications.

## House rules applied
- **No AI-slop copy:** the only new string is the "Rated by" label (plain, no banned constructions). Re-checked against `memory/feedback_unbnd_copy_and_visual.md`.
- **npub display / hex internal:** identities arrive as npub from the API; links use that npub; no hex shown, no new hex→npub conversion.
- **Derive from existing components + brand tokens:** reuse `Avatar`, `shortNpub`, the existing star glyph, and the React Router `Link` already used elsewhere. No icon libraries, no new hex literals outside `tokens.css`.
- **Honest:** no fabricated raters, no fabricated review text for rate-only raters, no empty placeholders (AC-8).

## Open questions
Resolve at the gate, before approving the story.

- **Q1 (layout — the gate decision): option (a) reviews-prominent + compact "Rated by" row, vs. option (b) unified ratings list.** PO recommends (a) and believes the user leans (a). Confirm (a) so the Architect designs the "Rated by" affordance rather than a unified list.
- **Q2 ("Rated by" roster scope):** does the "Rated by" affordance list *all* raters (reviewers + rate-only, a complete roster) or *only rate-only* raters (reviewers already appear in the reviews block above)? PO leans rate-only to avoid double-listing a reviewer; confirm or defer to the Architect/handoff.
- **Q3 (reviews-block byline → link, confirm):** today the review byline (`review-name`) is plain text. Confirm making the existing review byline itself the link (consistent with rate-only entries) is in scope here, so reviewers and rate-only raters are both reachable. PO recommends: yes. **Resolved (gate):** yes, and the byline additionally **resolves the rater's kind-0 display name now** (fallback `shortNpub`) via the same cached `useProfileMeta` the "Rated by" badges use — name resolution is in scope this story, not a deferred follow-up (see AC-9; ADR 0024 decision/implementation note 4).
- **Q4 (label wording):** "Rated by" as the section label. Acceptable, or prefer another plain alternative? (Must pass the copy rules.)

## Linked artifacts
- ADR: `engineering-team/decisions/0024-clickable-profiles.md`
- Test plan: `engineering-team/stories/24-clickable-profiles.test-plan.md`
- Review: (filled in after Review phase)
