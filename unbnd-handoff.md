# Unbnd — Wireframe-to-PRD Handoff Guide

**For:** Claude Code implementation
**Reference files:**
- `unbnd-prd.md` — Product requirements (what to build)
- `unbnd-wireframes.html` — Visual reference (how it should look)
- Project knowledge in the Unbnd Claude project

---

## How to Use This Package

The PRD defines **what** to build. The wireframes define **how it looks and feels**. This guide maps between them so every implementation decision has a clear source of truth.

When building a screen, Claude Code should:
1. Read the relevant PRD section for feature logic and data model
2. Open the wireframe HTML and find the matching screen
3. Extract the CSS from the wireframe's `<style>` block as the starting point for styling
4. Use the brand design tokens (documented below) for all colors, spacing, and typography

---

## Brand Design Tokens

These CSS custom properties are the single source of truth for all visual decisions. Every component, every screen, every state uses these values.

```css
:root {
  /* ── Core palette ── */
  --u-ink: #1A1A2E;          /* Primary text, headings, dark UI elements */
  --u-amber: #C4763C;        /* Primary accent — CTAs, links, ratings, brand color */
  --u-parchment: #FAF6F0;    /* Page background */
  --u-muted: #8B8698;        /* Secondary text, metadata, timestamps */
  --u-night: #0E0E1A;        /* Darkest tone (reserved for future dark mode) */
  --u-amber-light: #E8A96A;  /* Lighter amber (hover states, secondary accents) */

  /* ── Derived values ── */
  --u-border: rgba(26,26,46,0.08);        /* Default borders */
  --u-border-hover: rgba(26,26,46,0.15);  /* Interactive element borders */
  --u-surface: rgba(26,26,46,0.03);       /* Subtle background fills */
  --u-radius: 8px;                        /* Default border radius */
  --u-radius-lg: 12px;                    /* Card/modal border radius */

  /* ── Genre colors ── */
  --genre-literary: #085041;
  --genre-scifi: #133F7A;
  --genre-mystery: #8B5A1B;
  --genre-romance: #993556;
  --genre-fantasy: #4340A0;
  --genre-thriller: #7A2E14;
  --genre-biography: #27500A;
  --genre-history: #555362;

  /* ── Semantic colors ── */
  --signal-positive: #1D9E75;    /* "Well edited", "Original voice", verified badges */
  --signal-negative: #DC3545;    /* "AI Generated", warnings */
  --signal-sovereign: #7845FF;   /* Nostr/sovereign identity indicators */
}
```

---

## Logo Mark (SVG)

The logo mark is four geometric shapes forming an abstract broken circle. Use this inline SVG everywhere the mark appears:

```svg
<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 46 Q4 4 46 4 L46 46 Z" fill="#C4763C"/>
  <circle cx="72" cy="26" r="18" fill="#C4763C"/>
  <circle cx="26" cy="72" r="18" fill="#C4763C"/>
  <path d="M54 54 L54 96 Q96 96 96 54 Z" fill="#C4763C"/>
</svg>
```

Sizes used: 48px (hero), 26–28px (nav), 16px (footer). Fill color changes contextually:
- `#C4763C` (amber) — default, nav, hero
- `#8B8698` at 40–50% opacity — footer
- `#1D9E75` (green) — post-auth welcome state
- `currentColor` — when inheriting from parent

The wordmark "unbnd" uses a heavy (700) sans-serif at 20px in the nav.

---

## Screen-to-PRD Mapping

### Screen 1: Homepage

**Wireframe section:** `#homepage`
**PRD sections:** §5.1 Homepage, §9.5 House PoV and Personalization

**Components to build:**

| Component | PRD reference | Notes |
|-----------|--------------|-------|
| Nav bar | — | Logo mark + wordmark, Browse link, Submit link, Sign in button (logged out) or avatar (logged in) |
| Hero | §5.1 | Logo mark at 48px with reduced opacity, headline, subtitle, search bar |
| Search bar | §5.2 | Single SVG magnifier icon (hand-drawn, not icon library). Routes to search results page |
| PoV bar | §9.5 | Three states documented in wireframe: anonymous, building (progress bar), personalized (toggle). See PoV toggle wireframe for all states |
| Trending shelf | §5.1 "Trending" | Horizontal scroll, book cards with cover + title + author + trust-weighted rating. "This week" = 7-day window |
| Genre grid | §5.1 "Genre shelves" | 4-column grid, each card has 3px left accent bar in genre color, genre name, book count |
| Community favorites shelf | §5.1 "Community Favorites" | Same card pattern as trending, sorted by highest trust-weighted rating across all genres |
| CTA bar | — | Engagement prompt for anonymous/new users. "Get started" links to auth flow |
| Footer | — | Logo mark (muted), tagline "books unbound", About/Submit/Profile links |

**Data requirements:**
- Trending: query books sorted by rating count + trust-weighted score in last 7 days
- Genre grid: query genre concept for all genres with book counts
- Community favorites: query books sorted by trust-weighted rating (all time)
- PoV state: check user's follow count against 10-follow threshold

---

### Screen 2: Book Detail Page

**Wireframe section:** `#book-detail`
**PRD sections:** §5.4 Book Detail Page, §6.2 Book Record Schema, §6.4 Rating Schema, §6.5 Genre Tag Schema, §6.6 Quality Signal Schema, §9.2 Trust-Weighted Ratings

**Components to build:**

| Component | PRD reference | Notes |
|-----------|--------------|-------|
| Breadcrumb | — | Home / Primary genre / Book title |
| Cover + metadata header | §5.4 Header | Cover image (or colored placeholder with title), title, author (linked), year, page count, language, ISBN |
| Genre tags | §5.4, §6.5 | Amber-tinted pills showing community-assigned genres with trust-weighted confidence |
| Quality signals | §5.4, §6.6 | Green pills for positive ("Well edited", "Original voice"), red for negative ("AI Generated") |
| Blurb | §6.2 `blurb` field | Book description text |
| Action bar | §5.4 Actions | Rate (primary CTA), Want to Read, Write Review, Add Tags, Share. All text, no icons |
| Ratings block | §9.2 | Three-part layout: large aggregate rating + distribution bars + "from curators you trust" personalized score |
| Reviews list | §5.4 Reviews | Sorted by reviewer trust score. Each review: avatar initials, name, stars, trust badge, text, helpful count |
| Where to read | §5.4 Purchase/read links | External links with source labels. No commerce in MVP |
| Author card | §5.4 Author section | Avatar, name, verified badge (if claimed), bio, "more by" book covers |

**Data requirements:**
- Book metadata: query DList item by slug from book-submission concept
- Ratings: query all rating DList items pointing to this book, compute trust-weighted average
- Personalized rating: if user has personalized PoV, recompute average using their GrapeRank scores
- Genre tags: query genre-tag DList items, aggregate by genre with trust weighting
- Quality signals: query quality-signal DList items, aggregate by signal type with trust weighting
- Reviews: query rating DList items that have reviewText, sort by rater's trust score
- Author: if authorPubkey is set, fetch profile data

---

### Screen 3: Auth Flow

**Wireframe section:** `#auth-flow`
**PRD sections:** §5.7 Authentication System, §8.1–8.4 Authentication Architecture

**States to build:**

| State | PRD reference | Notes |
|-------|--------------|-------|
| Method selection | §5.7 | Two active methods: email (@ icon), Nostr (lightning SVG). Google/Apple below "coming soon" divider, grayed out |
| Email signup | §8.1 Tier 2 Email | Three fields: display name, email, password. Sovereignty note at bottom explaining exportable keys |
| Nostr NIP-07 | §8.1 Tier 1 | Extension detection → pubkey display → confirm/cancel. Sovereignty note with purple dot |
| Welcome | — | Post-signup landing. Two CTAs: "Browse books" and "Find curators to follow". Personalization hook |

**Implementation notes:**
- Email signup: on submit, generate secp256k1 keypair, derive encryption key from password via Argon2id, encrypt private key, also encrypt with server backup key (§8.4), store both, create JWT session
- NIP-07: detect `window.nostr`, call `getPublicKey()`, display npub for confirmation, on confirm call `signEvent()` with a challenge to verify, create JWT session
- Logo mark in welcome state uses `#1D9E75` (green) instead of amber to signal success
- "Coming soon" methods are visible but non-interactive — they signal the roadmap without promising delivery

---

### Screen 4: Genre Browse

**Wireframe section:** `#genre-browse`
**PRD sections:** §5.3 Genre Browse, §6.3 Genre Schema

**Components to build:**

| Component | PRD reference | Notes |
|-----------|--------------|-------|
| Genre header | §5.3 | 3px accent bar in genre color, genre name, book count, description text |
| Subgenre pills | §5.3 "Subgenre navigation" | Filter pills for subgenres. "All" active by default. From genre taxonomy hierarchy (parentGenre field) |
| Sort + filter controls | §5.3 "Filter and sort" | Sort dropdown (trust-weighted rating default, most recent, pub year, most reviewed). Grid/List view toggle |
| Curator stack | §5.3 "top curators" | Overlapping avatar dots showing top curators active in this genre + count |
| Book grid | §5.3 | 5-column grid. Each card: cover, title, author, trust-weighted rating, quality signal badges |
| Pagination | — | Numbered pages with ellipsis for large sets |

**Data requirements:**
- Genre metadata: query genre DList item by slug
- Books in genre: query genre-tag DList items for this genre slug, resolve book references, sort by trust-weighted rating
- Subgenres: query genre DList items where parentGenre matches this genre slug
- Active curators: query unique pubkeys from recent genre-tag DList items for this genre, count and show top 3 avatars

---

### Screen 5: Book Submission Form

**Wireframe section:** `#submission-form`
**PRD sections:** §5.8 Book Submission / Author Claiming, §6.2 Book Record Schema

**Components to build:**

| Component | PRD reference | Notes |
|-----------|--------------|-------|
| Duplicate check | §5.8 "Duplicate detection" | Search input + check button. Shows match result with three options: view existing, claim as author, not a match |
| Book details section | §6.2 schema | Title (required), author name (required), blurb (textarea), ISBN-13, ISBN-10, pub year, page count, language dropdown |
| Discovery section | §6.2, §6.3 | Genre pill selector (up to 3), cover image URL, purchase/read URL |
| Author toggle | §5.8 "Claim" | Toggle switch: "I am the author of this book." Adds verified badge and edit access |
| Submit button + note | — | Primary CTA. Explanatory note about signed attribution |

**Form fields map to bookSubmission schema (§6.2):**

| Form field | Schema field | Required |
|------------|-------------|----------|
| Title | `title` | Yes |
| Author name | `authorName` | Yes |
| Blurb | `blurb` | No |
| ISBN-13 | `isbn13` | No |
| ISBN-10 | `isbn10` | No |
| Publication year | `publishYear` | No |
| Page count | `pageCount` | No |
| Language | `language` | No |
| Genre selection | (creates genre-tag DList items) | No |
| Cover image URL | `coverUrl` | No |
| Purchase URL | `purchaseUrl` | No |
| Author toggle | `authorPubkey` (set to user's pubkey) | No |

**On submit:** create kind 39999 DList item with bookSubmission word-wrapper JSON, signed by user's key (server-side for custodial, client-side for NIP-07). If genres selected, also create genre-tag DList items.

---

### Screen 6: User Profile

**Wireframe section:** `#user-profile`
**PRD sections:** §5.5 User Profile Page, §5.6 Shelves / Reading Lists, §9.1 GrapeRank Scoring

**Components to build:**

| Component | PRD reference | Notes |
|-----------|--------------|-------|
| Profile header | §5.5 | Avatar (initials in colored circle), display name, trust badge, handle, bio, follow + share buttons |
| Stats row | §5.5 "Stats" | 5 stats in bordered row: books rated, reviews, tags applied, followers, following |
| Trust card | §5.5 "Trust score" | Ring visualization with numeric score, description text, progress bar. Trust badge text derived from percentile |
| Genre affinity | — | Horizontal bar chart showing genres this user is most active in, with book counts |
| Shelves | §5.6 | Each shelf: name, book count, row of mini cover thumbnails + overflow count. Default shelves (Read, Want to Read) + custom lists |
| Activity feed | §5.5 "Recent activity" | Color-coded dot per activity type (amber=rating, genre color=tagging, red=AI flag, purple=shelf). Text description + timestamp |

**Data requirements:**
- Profile: user's display name, avatar, bio (from nostr kind 0 profile or custodial account)
- Trust score: user's GrapeRank score from house PoV (or observer's PoV if personalized)
- Stats: count of rating events, review events, tag events by this pubkey; follower/following from kind 3 events
- Genre affinity: aggregate genre-tag events by this pubkey, group by genre, count
- Shelves: query shelf DList items by this pubkey, resolve book references for cover display
- Activity: recent events (ratings, tags, shelf additions) by this pubkey, sorted by timestamp

**Author profile additions (when user has claimed books):**
- "Books by this author" section between trust card and shelves
- "Author Verified" badge next to display name
- Same profile layout, additional section

---

## PoV Toggle States

**Wireframe section:** `#pov-toggle` (separate reference)
**PRD section:** §9.5 House PoV and Personalization

Three states of the PoV bar component, used on homepage and genre browse:

| State | Condition | Display |
|-------|-----------|---------|
| Anonymous/new | No account or 0 follows | Amber dot + "Curated from Unbnd house perspective" + disabled Personalize button + hint "Sign in and follow curators to personalize" |
| Building | Logged in, < 10 follows | Same as above but with progress bar (N/10) and hint "Follow N more curators to unlock" |
| Personalized | 10+ follows, GrapeRank computed | Green checkmark dot + "Curated from Your perspective" + "personalized" badge + House/Yours toggle switch + "last updated Xh ago" hint |

---

## Design Principles for Implementation

These are non-negotiable rules extracted from the wireframe design decisions:

1. **No icon libraries.** No Tabler, no Lucide, no FontAwesome, no Heroicons. Every visual element is either typography, a brand color, the SVG logo mark, or a hand-crafted SVG (search magnifier, lightning bolt for Nostr). If you need a visual indicator, use a colored dot, a text character (★, →, @), or a typographic treatment.

2. **Amber is the only accent color.** All interactive elements (links, CTAs, tags, ratings, trust badges) use `--u-amber`. The only exceptions are semantic signals: green for positive quality signals and verified badges, red for negative signals (AI Generated), purple for sovereign/Nostr identity indicators.

3. **Genre colors are contextual, not decorative.** Each genre has a signature color used for its accent bar, tinted backgrounds, and tags. These colors appear only in genre-related contexts. They don't replace amber as the primary accent.

4. **Form inputs use white (#FFFFFF) backgrounds** against the parchment page. This creates a subtle lift that makes input areas feel active and editable.

5. **Book covers are the primary visual element.** They should be the most visually prominent thing on any page that shows books. If real cover images aren't available, use gradient-colored rectangles with the title set in a light color at the bottom.

6. **Trust badges use percentile language** ("Top 3% curator") not raw GrapeRank scores. The user never sees a number like "0.847" — they see a human-readable tier.

7. **The parchment-on-parchment elevation model:** page background is `--u-parchment` (#FAF6F0), cards/inputs lift with white (#FFFFFF), outer device frame uses a darker parchment (#EFEBE4). This creates depth without shadows.

8. **Typography hierarchy:** 22–26px bold for page titles, 15–16px semibold for section headers, 13–14px regular for body text, 11–12px for metadata and hints. All using the system sans-serif font stack — no custom font loading needed for MVP.

9. **Spacing is generous.** Sections have 1.5–2rem bottom margins. Cards have 14–18px internal padding. The design should feel airy, not cramped. Parchment needs room to breathe.

10. **Responsive behavior:** All layouts should work at mobile widths. Genre grid collapses from 4-col to 2-col. Book grids collapse from 5-col to 3-col to 2-col. Shelves remain horizontal-scrollable at all widths.
