# Story 20: Real public profile at `/profile/:npub` (retire the Mira fixture) + Substack link display

**Status:** Done
**Created:** 2026-05-30
**Type:** Feature

## Background
Story 19 made the **signed-in user's own** `/profile/me` real: enriched shelf grid, honest activity counts, account-dropdown nav. The last fixture in the app is now the **public** profile route. `apps/web/src/routes/Profile.tsx` still renders the hard-coded Mira Calloway record from `apps/web/src/data/profile-fixtures.ts` for any `/profile/:handle`. This is the only screen lying to users.

This story makes the public profile real for **any** user, keyed by npub, and retires the Mira fixture. It is the trust-independent core (Lane 1) of **phase2-prd §2.4 "Public profiles + real activity"**: identity header, public shelves, and activity counts for a target user, all read from that user's own events (single-author reads — POV-first does not apply to the counts, and shelves are public-only). It also folds in **phase2-prd Appendix C-1 "External writing link"**, scoped to a Substack link, as the user requested it be named "Substack" specifically.

§2.4 lists several elements explicitly held for **later** Block B/C stories: the chronological activity feed, genre-affinity chart, the follow button + follower/following counts (need the kind-3 follow mechanism, §2.6), and the trust-tier badge (needs trust active, §2.5). This story ships the trust-independent subset only and does not expand PRD §11.3 out-of-scope (no social feed, no federation, no payments).

Affected personas: any visitor viewing a **Reader / Curator / Author** public profile, and the profile owner who wants to advertise their Substack.

## User-facing description
As a visitor, I want to open any user's public profile at `/profile/:npub` and see who they are (their picture, name, bio, nip05 when they have a kind-0, or an honest initials + npub fallback when they do not), the public shelves they have built with real covers and titles, and honest counts of what they have done (books rated, reviews, tags applied), so that I can judge a curator on real activity instead of a fabricated mock.

As a profile owner, I want a "Writes on Substack" link to appear on my profile when my Nostr identity carries a Substack URL, so that readers can find my writing.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] **AC-1 — Real identity header from kind-0.** Given a target user with a published kind-0, when a visitor opens `/profile/:npub`, then the header shows that user's name (display_name/name), picture, bio (about), and nip05 resolved from their kind-0, with no Mira Calloway data anywhere on the page.
- [ ] **AC-2 — Initials + npub fallback.** Given a target user with no resolvable kind-0 (e.g. a custodial user who never published one), when a visitor opens `/profile/:npub`, then the header shows the initials avatar + the npub (the existing `Avatar` + npub-display fallback used on `/profile/me`), and the page still renders shelves and counts. No fabricated name, no error page.
- [ ] **AC-3 — Public shelves for the target user.** Given a target user who owns at least one public shelf with at least one resolvable book, when a visitor opens `/profile/:npub`, then that user's shelves render as the enriched cover/title/author grid (the Story-19 `BookGrid`/`BookCard` treatment), read by the **target user's pubkey** (not the viewer's session). Each shelf's displayed count reflects only the books actually shown (a shelf entry whose catalog record cannot be resolved is omitted and the count recounts to survivors, matching Story-19 AC-2).
- [ ] **AC-4 — Activity counts for the target user, honest.** Given a target user, when a visitor opens `/profile/:npub`, then "Books rated", "Reviews", and "Tags applied" show that user's counts using the same definitions as Story 19 (see "Precise count definitions" below), author-scoped to the **target** pubkey. Any single count whose read fails is omitted (the cell is hidden), never shown as a fabricated `0`; a genuinely-computed `0` may render as `0`.
- [ ] **AC-5 — Mira fixture retired.** Given the codebase after this story, when `apps/web/src/data/profile-fixtures.ts` is searched, then the Mira Calloway `ProfileRecord` and the `getProfileRecord` lookup it feeds are gone, and `apps/web/src/routes/Profile.tsx` no longer imports from `profile-fixtures.ts`. No route renders the fixture.
- [ ] **AC-6 — Invalid npub → honest not-found.** Given an `:npub` segment that is not a valid npub or hex pubkey, when a visitor opens that URL, then the page shows the existing `NotFound` state (or an equivalent honest "no such profile" message), not a crash and not the Mira mock.
- [ ] **AC-7 — Substack link display.** Given a target user whose kind-0 carries a Substack URL (the agreed kind-0 field — Architect names the exact key), when a visitor opens `/profile/:npub` **and** when the owner opens `/profile/me`, then a single "Writes on Substack" link rendered as a text link (no icon library; typographic `↗` glyph permitted per the design rules) points at that URL and opens it. Given no such field, then no Substack link and no empty placeholder render.
- [ ] **AC-8 — Substack URL validation on read.** Given a kind-0 whose Substack field is not a well-formed `http(s)` URL, when the profile renders, then the malformed value is ignored (no link rendered, no broken `href`). Light validation only; no domain verification.

## DList shapes touched
No new DList shape. Public single-author reads of existing kinds, keyed by the **target** pubkey, plus a kind-0 (NIP-01 metadata) read on public relays.

- `kind:0` — NIP-01 user metadata (identity header + the Substack field). Read path already exists: `apps/api/src/nostr/profile.ts` (`fetchProfileMeta` / `parseKind0`) and `GET /api/profile/:id` (`apps/api/src/routes/profile.ts`). The Substack field is a new key on the parsed `ProfileMeta`.
- `kind:39999` — book-shelf membership under `39998:<librarian>:book-shelves` (the target user's public shelves; read by `authors:[targetHex]`).
- `kind:39999` — book records under `39998:<librarian>:books` (catalog enrichment for cover/title/author; reuse `parseBook` → `PublicBook`).
- `kind:39999` — book ratings under `39998:<librarian>:book-ratings` (counts; read by `authors:[targetHex]`).
- `kind:39999` — book-tag assertions under `39998:<librarian>:book-tag-assertions` (counts; read by `authors:[targetHex]`).

The exact public route shapes, and whether the shelves/counts reads are new public endpoints or generalisations of the Story-19 session-gated ones, are **the Architect's call**. PO recommendations below are non-binding.

## PO recommendation (non-binding — Architect decides the mechanism)

**Reuse Story-19 logic, swap the author filter from session to target.** Story 19's `/api/shelves/mine` and `/api/profile/me/stats` are session-gated and author-scoped to `user.pubkeyHex`. The same pure functions work unchanged for a public target; only the author and the gate change:
- **Shelves:** reuse `groupOwnShelves` (`apps/api/src/shelves/aggregate.ts`) + the existing `parseBook → PublicBook` enrichment that `/api/shelves/mine` already performs (`apps/api/src/routes/shelves.ts` ~L193–220), keyed by `authors:[targetHex]`. PO recommends exposing it as `GET /api/profile/:npub/shelves` so the public profile surface is one consistent namespace (`/api/profile/:npub`, `/api/profile/:npub/shelves`, `/api/profile/:npub/stats`); `GET /api/shelves?owner=<npub>` is a viable alternative. Architect picks.
- **Counts:** reuse `countOwnRatings` (`apps/api/src/ratings/summary.ts`) and `countOwnAppliedTags` (`apps/api/src/tags/aggregate.ts`) exactly as `/api/profile/me/stats` calls them, but author-scoped to the target and **not** session-gated (public read). PO recommends `GET /api/profile/:npub/stats`, parallel to the existing `/api/profile/me/stats`, with the same per-field omit-on-failure wrapping (a failing read hides only its field).
- **Identity:** `GET /api/profile/:id` already returns `{ npub, name?, picture?, nip05?, about? }` and always includes the npub. Extend `ProfileMeta` / `parseKind0` to also surface the Substack field; the rest of AC-1/AC-2 is already covered by this endpoint.
- **Web:** `Profile.tsx` should be re-derived from the `/profile/me` layout (`ProfileMe.tsx`) so the two profile views share `Avatar`, `BookGrid`/`BookCard`, `ProfileStats`, and the npub-display fallback. The PO does NOT mandate sharing a component, but the visual treatment must match Story 19. Resolve identity via the existing public endpoint, not the session-scoped `useProfileMeta` hook keyed to the logged-in user.

## Precise count definitions (identical to Story 19 — reused verbatim, author = target)
- **Books rated** = number of *distinct books* on which the **target** user has a current rating. Latest-wins per book (re-rating the same book counts once). A rating with no review text still counts here. (`countOwnRatings(...).booksRated`.)
- **Reviews** = number of the target user's *current* ratings whose review text is non-empty after trim. Subset of Books rated. (`countOwnRatings(...).reviews`.)
- **Tags applied** = number of distinct *(book, tag)* pairs whose latest assertion by the **target** user has polarity +1 (apply). Disputes (latest -1) and retracted pairs are excluded. (`countOwnAppliedTags(...)`.)

## Substack field — where it lives, and the SET split

**Where it lives:** in the user's **kind-0 metadata**, NOT a proprietary DB column. It travels with the npub, so a sovereign user keeps it when they leave Unbnd, and it is the same place kind-0 already carries `website` (phase2-prd C-1 engineering note). The exact key name (a dedicated `substack` field vs. reusing/labelling `website`) is the Architect's call; the displayed label is fixed as "Writes on Substack".

**DISPLAY is in this story (cheap, read-only).** AC-7/AC-8 read the field from kind-0 and render the link on both `/profile/:npub` and `/profile/me`. No write path needed for display.

**SET is a tight follow-up story, NOT this one.** Setting the Substack link requires a **kind-0 edit write path** that does not exist yet and carries a real hazard:
- Fetch the user's current kind-0, **merge** the Substack field WITHOUT clobbering their other kind-0 fields (name, picture, nip05, lud16, etc.), re-sign, and publish (local + dual-publish).
- The signing path differs by tier: sovereign users sign via NIP-07 (`ExtensionSigner`, client-side); custodial users go through the existing server-side ephemeral-wrap signing (`apps/api/src/auth/ephemeral.ts`). Both must reuse the audited signer stack — **no hand-rolled crypto, no new signer**.
- This is the first kind-0 *write* in the app (all prior kind-0 work is read-only), plus a settings UI surface, plus the merge-don't-clobber hazard. That is its own story with its own ACs.

**PO recommendation: split.** THIS story = public-profile read (AC-1–AC-6) + Substack **display** (AC-7–AC-8). A follow-up story (proposed "21: Edit your Nostr profile — set Substack + safe kind-0 merge") = the settings UI + kind-0 edit/merge/re-sign/publish write path. The display is independently valuable and shippable now; the write path is a distinct, hazard-bearing surface that deserves its own Architecture pass. Flagged for the Architect: the kind-0 read endpoint and `ProfileMeta` shape this story extends are the same ones the follow-up will write through, so design the field key now even though the write lands later.

## Routing decision (PO call)
**Address public profiles by npub: `/profile/:npub`.** Reasons: npub is always available (the API guarantees it even with no kind-0), it is stable and self-certifying, and `GET /api/profile/:id` already accepts npub-or-hex. nip05-handle addressing (`/profile/:handle`) needs a handle→pubkey resolution step and a uniqueness/squatting policy we have not designed; defer to a later story. The current `:handle` param on `Profile.tsx` becomes `:npub`. (Open Q1 on the old `/profile/mira-calloway` link — see below.)

## Out of scope
Stated explicitly; these are later Block B/C stories and must not creep in:
- **Setting** the Substack link / any kind-0 edit write path / a profile-settings UI (the recommended follow-up story 21; only DISPLAY is in scope here).
- **Chronological activity feed** / recent-activity stream (phase2-prd §2.4 "Recent activity"; PRD §11.3 social feed). Counts only, no feed.
- **Genre-affinity chart** (phase2-prd §2.4). The fixture's `GenreAffinity` component is dropped with the fixture; no real genre chart this story.
- **Trust-tier badge** (phase2-prd §2.4: "the only trust-dependent element"; needs trust active per §2.5). The fixture's `TrustCard` is dropped with the fixture; no trust badge until trust is live. The public profile honestly omits it.
- **Follow button + follower / following counts** (phase2-prd §2.4 / §2.6; needs the kind-3 follow mechanism). Separate Block B story. The fixture's follower/following stat cells are dropped.
- nip05-**handle** addressing `/profile/:handle` (deferred per the routing decision).
- Private / NIP-44-encrypted shelves (shelves are public-only today, Story 18; PRD §11.3 encryption surfaces stay out).
- Any top-nav change (consistent with Story 19's account-dropdown-only decision).
- PRD §11.3 Phase-2+ items generally: payments, Blossom file hosting, ebook sales, federation, email notifications.

## Open questions
Resolve before approving the story.

- **Q1 (old fixture link target):** the homepage / any byline currently linking to `/profile/mira-calloway` will 404 once the fixture is gone. Confirm the Architect should sweep for and update/remove any in-app link to the Mira handle as part of retiring the fixture (PO recommends: yes, retire dangling links so no nav dead-ends).
- **Q2 (Substack field key):** dedicated `substack` key in kind-0, vs. reuse the standard `website` field, vs. a labelled convention. PO leans a dedicated `substack` key so the "Writes on Substack" label is honest and `website` stays free for a general homepage. Architect's call; flagged because the SET follow-up must write the same key.
- **Q3 (custodial user with no kind-0 — confirm AC-2):** custodial users do not publish a kind-0 today, so their public profile shows initials + npub + (empty-state) shelves/counts. Confirm this honest fallback is the intended experience for the common custodial case, rather than gating the public route to sovereign users. PO recommends: render for everyone, fall back honestly.
- **Q4 (counts read cost):** these are full author-scoped scans per profile view (same cost profile as Story-19 Q3, now triggerable by any visitor on any npub). Trivial at staging volume. Flag for the Architect whether any caching/rate consideration is warranted before this is publicly reachable; not a blocker.

## Linked artifacts
- ADR: `engineering-team/decisions/0020-public-profiles.md`
- Test plan: `engineering-team/stories/done/20-public-profiles.test-plan.md`
- Review: `engineering-team/reviews/20-public-profiles.md` (PASS, 2026-05-30)
