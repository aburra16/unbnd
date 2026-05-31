# ADR 0024: Clickable identities — link every rater and the submitter to their profile

**Status:** Proposed
**Date:** 2026-05-31
**Story:** `engineering-team/stories/24-clickable-profiles.md`

## Context

Stories 20 (`/profile/:npub`) and 23 (follow) shipped the destination and the action, but the identities the app already renders are plain text. This story makes the displayed identities clickable so the follow graph can grow by browsing. It anchors in phase2-prd §2.4 (profiles must be reachable) and §2.6 (follows grow by discovery), and expands no out-of-scope item: no search, no feed, no new profile data, no new write path.

This is a **web-only, presentation-only** change. The story's API finding is verified against the code:

- `apps/api/src/ratings/summary.ts` — `PublicRating = { npub, score, reviewText?, reviewDate }`; `rawFromParsed` maps **every** deduped rater into `RatingsSummary.ratings`. Rate-only raters are not filtered server-side.
- `apps/api/src/routes/ratings.ts` — `GET /api/books/:slug/ratings` returns `{ ...raw, weighted }`, so `ratings` already carries every rater for the House/raw path; `weighted.ratings` carries the subset a given observer trusts (correct POV behavior, AC-6).
- The drop happens web-side: `apps/web/src/components/ReviewsList.tsx` filters to `reviewText.trim() !== ""`, so rate-only raters never render and are unreachable.

Constraints pulled from CLAUDE.md / handoff and confirmed against the code:

- **npub-display / hex-internal (AC-5).** `PublicRating.npub` and `SubmittedBook.submitter` are **already npub strings**. The `/profile/:npub` route (`apps/web/src/App.tsx`, `<Route path="/profile/:npub" element={<Profile />} />`) reads the param verbatim and `api.profile.get(idOrNpub)` accepts an npub. So a link is `to={`/profile/${rating.npub}`}` with **no `npubEncode` and no hex→npub conversion** — the API already hands us the addressable npub. We must never show or route a hex pubkey.
- **POV-first / perspective consistency (AC-6).** `RatingsPanel` (`apps/web/src/components/RatingsPanel.tsx`) computes `reviews = active.ratings | w.ratings` per the active House/Yours view and passes that array to `ReviewsList`. The new row consumes the **same already-derived array**; it links whoever the active perspective surfaces and never widens or recomputes the set. Trust math is untouched.
- **Derive from existing components.** `Avatar` (`apps/web/src/components/Avatar.tsx`) already does kind-0-picture-or-deterministic-initials with a seed-stable fallback color and a dead-URL→initials fallback. `useProfileMeta` (`apps/web/src/hooks/useProfileMeta.ts`) resolves kind-0 best-effort with a Story-19 in-memory + sessionStorage cache that fetches each id **at most once per page-load session** and dedupes across the page. `shortNpub` (`apps/web/src/lib/view-model.ts`) is the display treatment. React Router `Link` is the navigation primitive used elsewhere (`AccountMenu`, `Footer`). The star glyph already lives in `ReviewsList` (`★/☆`). No icon library, no new hex literal outside `tokens.css`.
- **No-slop copy.** The only new strings are the section label **"Rated by"**, a **"+N"** expander chip, and its accessible label. All plain; re-checked against `memory/feedback_unbnd_copy_and_visual.md`.

No DList shape is touched; this is presentation over data the app already fetches (kind 39999 ratings under `39998:<librarian>:book-ratings`, already read by `GET /api/books/:slug/ratings`).

### Gate decisions already settled (honored here, not re-litigated)

- Layout option **(a)**: reviews-prominent block stays; add a compact **"Rated by"** row.
- "Rated by" roster scope: **ALL raters** (a complete at-a-glance roster), reviewers included. A reviewer therefore appears both as a badge in the row and in their review below — accepted.
- Cap **5 badges + a "+N" chip**; "+N" **expands the row IN PLACE** into a wrapping grid of all raters. No new route, no dedicated "all raters" page (deferred to a possible future story at scale).
- Review byline becomes a link. Submitter on `/submissions` becomes a link.

## Options considered

### Option A — A `RatedByRow` component whose per-badge `Avatar`s self-fetch kind-0 via the cached `useProfileMeta`, lazy-mounting the overflow only on expand (CHOSEN)

A new component `RatedByRow` takes the active perspective's `ratings: PublicRating[]`. It renders the first ≤5 raters as circular `Avatar` badges (each a `Link` to `/profile/:npub`) plus a `+N` chip when there are more. `useState` toggles an expanded state; on expand the row becomes a wrapping grid that mounts a badge for **every** rater.

Each badge is a small leaf component (`RaterBadge`) that calls `useProfileMeta(rating.npub)` itself and composes `Avatar` exactly as `AccountMenu` does: `const meta = useProfileMeta(npub); const name = displayNameOf(meta, shortNpub(npub)); <Avatar label={name} seed={npub} picture={meta?.picture} />`. Because a hook only fires for a **mounted** component, lazy-on-expand falls out of the mount boundary: render only the first 5 `RaterBadge`s initially, and mount the remaining `RaterBadge`s **only after** `expanded === true`. The collapsed render fetches at most 5 kind-0s; the rest fetch lazily the first time the user expands.

- **Pros.**
  - Reuses the exact Avatar+useProfileMeta composition already proven in `AccountMenu`/`Profile`; no new fetch path, no new endpoint.
  - The Story-19 cache dedupes repeat raters across the page (a reviewer shown both in the row and in their review byline link resolves one kind-0, not two) and persists across navigation/refresh with no avatar flash.
  - Lazy-on-expand is structural (mount boundary), not bespoke gating logic — the 5 hidden-by-default raters cost zero relay round-trips until the reader asks for them.
  - Deterministic fallback color and dead-picture→initials are already handled by `Avatar`; nothing to fabricate.
- **Cons.**
  - One kind-0 round-trip per distinct shown rater (capped at 5 on first paint; the rest on expand). For a popular book with dozens of raters, expanding fires a burst of fetches — acceptable, and the cache means each id is hit once.
  - Many simultaneous hooks on expand; React handles this fine, and the cache + once-per-session guard bounds the work.

### Option B — A single batched profile fetch for all raters up front, passed down as props

`RatedByRow` (or `RatingsPanel`) fetches kind-0 for every rater in one batched call (new `/api/profiles?npubs=…` or N parallel `api.profile.get`), then passes resolved `{picture,name}` to dumb badge components.

- **Pros.** One fetch site; badges become pure.
- **Cons.** Requires either a **new endpoint** (out of scope — "any new endpoint" is explicitly excluded) or N up-front fetches that defeat the point of lazy-on-expand (we'd fetch all raters even though only 5 are visible). It also bypasses the Story-19 cache's dedup-and-persist behavior, reintroducing the avatar-flash problem Story 19 fixed, and duplicates resolution logic the hook already owns. Rejected.

## Decision

We chose **Option A**. It reuses the audited, already-shipped Avatar + `useProfileMeta` composition, gets per-page dedup and no-flash persistence for free from the Story-19 cache, and achieves lazy-on-expand purely through the React mount boundary (mount the overflow badges only after `expanded`). It introduces no endpoint, no new fetch path, and no new dependency.

The byline link and submitter link are minimal in-place edits (wrap the existing identity text in a `Link`), not new components.

## Consequences

- **Enables.** Every rater (reviewer or rate-only) is reachable from a book page; the submitter is reachable from `/submissions`; review bylines are reachable. The read-side connective tissue between Stories 20 and 23 lands without touching trust math or the API.
- **Constrains.** The row shows whatever the active perspective's array contains; if a future story wants a row that differs from the perspective set, that's a separate decision. The in-place expand intentionally has no dedicated all-raters page — at large scale a future story may add one (noted, not built).
- **New debt / follow-ups.** Follow-on-byline buttons, people-search, and a dedicated all-raters route remain out of scope (story "Out of scope"). The per-badge kind-0 cost is bounded by the cache but is worth a glance if a book ever has hundreds of raters.
- **Affects existing fixtures?** No new fixture shape. `PublicRating` and `SubmittedBook` already carry the npub fields the UI needs. Tester may add fixtures exercising mixed reviewer/rate-only sets, >5 raters (expand), 0 raters, and an absent submitter, but no production fixture file must change shape.
- **New dependency?** No.
- **PRD section change required?** No. The change satisfies §2.4 / §2.6 and expands no §11.3 out-of-scope item.

## Implementation notes

Concrete targets for the Implementer. **Web only. No API edits.**

### 1. New component — `apps/web/src/components/RatedByRow.tsx` (+ `RatedByRow.css`)

```tsx
// Props
type Props = { ratings: PublicRating[] }; // the ACTIVE perspective's array

const CAP = 5;
// AC-8: zero raters → render nothing.
if (ratings.length === 0) return null;

// Dedup by npub so a rater who appears twice in the array (defensive) is one badge.
// Order: preserve the perspective array's order; show first CAP, +N for the rest.
const [expanded, setExpanded] = useState(false);
const shown = expanded ? raters : raters.slice(0, CAP);
const overflow = raters.length - CAP;
```

- Section element labelled **"Rated by"** (a heading or a leading label span; reuse `ReviewsList`'s `reviews-head`/`reviews-title` styling family so it sits consistently under the summary). Plain copy, no slop.
- Collapsed: render `shown` (≤5) `RaterBadge`s, then, when `overflow > 0`, a `+{overflow}` chip `<button>` that sets `expanded = true`. Accessible label e.g. `aria-label={`Show all ${raters.length} raters`}`; visible text `+{overflow}`. The chip is a button (in-place expand), **not** a Link.
- Expanded: drop the chip and render a wrapping grid (CSS `flex-wrap` / `grid`) of a `RaterBadge` for **every** rater. Lazy-on-expand is achieved by only mounting the overflow badges when `expanded` (i.e. render `shown`, where `shown` grows from `slice(0, CAP)` to the full list on expand) — the extra `useProfileMeta` hooks fire only after the user expands. Do **not** mount all N badges up front.
- Stacked/overlapping look in the collapsed row via negative margin on `.rated-by-badge` (CSS only); the expanded grid uses normal gaps. Sizes/colors from `tokens.css`; no new hex literal.

### 2. New leaf — `RaterBadge` (in the same file)

```tsx
function RaterBadge({ rating, size }: { rating: PublicRating; size?: number }) {
  const meta = useProfileMeta(rating.npub);              // self-fetch, cached (Story 19)
  const name = displayNameOf(meta, shortNpub(rating.npub));
  return (
    <Link to={`/profile/${rating.npub}`} className="rated-by-badge"
          title={name} aria-label={name}>
      <Avatar label={name} seed={rating.npub} picture={meta?.picture} size={size ?? 30} />
    </Link>
  );
}
```

- `useProfileMeta` is the only fetch path; the cache dedupes repeat raters across the page and persists across nav/refresh (no flash).
- `title`/`aria-label` carry the name on hover (AC: hover/title shows the name). The score can ride alongside in the expanded grid (e.g. a small `★ {score}` next to the badge) to satisfy AC-3's "name + score"; keep it derived from the existing star glyph helper, not a new icon. In the collapsed overlapping row the score may be omitted for density (hover/title still identifies the rater); the expanded grid is the place that shows name + score per AC-3.
- `to={`/profile/${rating.npub}`}` — raw npub, no `npubEncode` (AC-5).

### 3. Placement — `apps/web/src/components/RatingsPanel.tsx`

- Mount `<RatedByRow ratings={reviews} />` **after** `<RatingsBlock .../>` (the summary: average + count, which stays unchanged — AC-7) and **before** (or immediately around) `<ReviewsList ratings={reviews} />`. `reviews` is the already-derived active-perspective array, so the row honors House/Yours automatically (AC-6).
- Recommended order inside `.ratings-panel`: controls → caption → `RatingsBlock` (summary, untouched) → `RatedByRow` → `ReviewsList`. The reviews block keeps its prominence (AC-7); the row is the compact roster under the summary.

### 4. Review byline link — `apps/web/src/components/ReviewsList.tsx`

- Wrap the existing `.review-name` content in a `Link`: `<Link to={`/profile/${r.npub}`} className="review-name">{shortNpub(r.npub)}</Link>` (or wrap the inner text and keep the `div`). Keep layout/weight: the `.review-name` styling stays; just make it a link. No new fetch here — the byline already shows `shortNpub`; resolving the byline's kind-0 name is out of scope for this minimal edit (the row's badge carries the avatar).
- Import `Link` from `react-router-dom`.

### 5. Submitter link — `apps/web/src/routes/CommunitySubmissions.tsx`

- Replace the plain `added by ${shortNpub(s.submitter)}` text with a `Link` when `s.submitter` is present:
  `{s.submitter ? <> · added by <Link to={`/profile/${s.submitter}`}>{shortNpub(s.submitter)}</Link></> : null}`.
- Absent submitter → render nothing (no "added by", no broken link) — current behavior preserved (AC-4). Import `Link`; the file's local `shortNpub` already exists.

### 6. Honesty / edge (AC-8)

- `RatedByRow` returns `null` for zero raters (no empty shell, no placeholder raters).
- `Avatar` already provides the deterministic seed-color fallback and dead-picture→initials; no fabricated faces.
- A book with only rate-only scores: `ReviewsList` returns `null` (its existing text filter), `RatedByRow` renders the roster. A book with reviews + rate-only: both render; reviewers appear in both treatments (accepted).

### Brand tokens used

Existing tokens only — surface/parchment background, card surface, amber accent for the link/chip affordance, type sizes and radii from `apps/web/src/styles/tokens.css`. Star glyph (`★/☆`) reused from `ReviewsList`. No new icon library, no new hex literal outside `tokens.css`.

## Out of scope

- People-search / npub search (deferred).
- Follow buttons on bylines/badges (links only this story).
- A dedicated "all raters" route/page (the +N expands in place; a route is deferred to a possible future at-scale story).
- Resolving the review byline's display name from kind-0 (the byline keeps `shortNpub`; the avatar lives on the row badge). Can be a thin follow-up.
- Any change to which raters a perspective returns (trust math untouched).
- Any API change.
