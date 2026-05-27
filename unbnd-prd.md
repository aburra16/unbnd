# Unbnd — Product Requirements Document

**Version:** 1.0 (MVP)
**Author:** Avi Burra
**Date:** 2026-05-27
**Domain:** unbnd.ink
**Status:** Draft

---

## 1. Product Vision

Unbnd is a book discovery and curation platform where readers find books through people they trust, not algorithms optimized for commercial outcomes.

The publishing and book discovery ecosystem is broken in two places. On the distribution side, Amazon KDP and Ingram control access to readers. On the discovery side, Goodreads — owned by Amazon since 2013 — is the dominant platform for finding what to read, and it has been neglected for over a decade. Its recommendations serve Amazon's retail interests, its reviews are gameable, and indie authors are invisible unless they learn to manipulate the system.

Unbnd replaces Goodreads' centralized recommendation engine with community-driven curation powered by Web of Trust. When a reader you trust loves a book, that signal carries real weight. When a respected curator tags something as "literary fiction" or flags it as "AI generated," that tag is weighted by their community reputation. The result is a discovery experience driven by human judgment rather than commercial optimization.

Under the hood, Unbnd runs on the nostr protocol using Tapestry's Decentralized List (DList) primitives and the GrapeRank algorithm for trust scoring. But the user never sees any of this. They see a bookstore. They see ratings. They see personalized recommendations from people whose taste they respect. The infrastructure is sovereign and censorship-resistant; the experience is accessible to anyone with a web browser.

---

## 2. MVP Positioning

**The MVP comp is Goodreads, not KDP.**

KDP is a distribution platform — "I have a manuscript, I need it in front of readers." That requires payment rails, file hosting, and potentially DRM. That is Phase 2+.

Goodreads is a discovery and curation platform — "I'm a reader, help me find what to read next; I'm an author, help readers find me." That maps directly to what Unbnd's underlying primitives do: list, tag, rate, and surface through trust.

**What the MVP does that Goodreads doesn't:**

- Trust-weighted ratings: a respected curator's review carries more weight than a bot's or a stranger's.
- Community-driven genre tagging with quality signals (including "AI generated" flags).
- No commercial bias in recommendations — no retailer steering readers toward higher-margin titles.
- Sovereign infrastructure: user data, ratings, and social graph are not owned by Amazon.
- Portable identity: users who choose sovereign login own their data permanently.

**What the MVP deliberately omits (Goodreads features we cut):**

- Reading progress tracking ("currently reading," "50% done").
- Social feed ("your friends are reading...").
- Author Q&A and discussion groups.
- Integration with library systems or retailers.
- Direct book sales or file hosting.

---

## 3. User Personas

### 3.1 The Reader

**Who:** Anyone who reads books and wants better recommendations. Not a nostr user. Not a technologist. A person who is frustrated with Goodreads' stale UI, Amazon-biased recommendations, and unreliable reviews.

**Goal:** Find their next book based on the taste of people they trust, not an algorithm.

**Core loop:** Discover → Read → Rate → Discover better things (their ratings and follows train the trust network to give them increasingly relevant recommendations).

**Key requirement:** Zero friction. No technical hurdles. No knowledge of nostr, protocols, or cryptographic keys. They sign up, they browse, they find books.

### 3.2 The Curator

**Who:** Book bloggers, prolific reviewers, genre experts, people who read 100+ books a year and have strong opinions about categorization and quality. On Goodreads, their expertise is flattened — their review counts the same as someone who gives everything five stars.

**Goal:** Have their taste and expertise recognized and weighted appropriately. Influence what the community sees.

**Core loop:** Read → Tag/Rate → Build reputation → Influence discovery for readers who trust them.

**Key requirement:** Their ratings and tags carry weight proportional to their community trust. They can see their influence growing.

### 3.3 The Author

**Who:** An indie author (or any author) who wants their book discoverable outside the Amazon ecosystem. Not necessarily self-published — could be traditionally published but frustrated with Goodreads as the only discovery platform.

**Goal:** Get their book in front of readers who will appreciate it, based on genuine community enthusiasm rather than paid promotion or algorithmic manipulation.

**Core loop:** Submit/claim book → See community reaction → Share their Unbnd page → Attract readers.

**Key requirement:** Easy submission or claiming process. Clear visibility into how the community is receiving their work.

---

## 4. User Journeys

### 4.1 Reader: First Visit → Engaged User

**Entry:** Reader clicks a link shared on social media, or searches for "book recommendations" and finds unbnd.ink.

**Step 1 — Browse (no account).** Reader lands on the homepage. They see curated shelves: trending books, genre categories, "community favorites." They can search by title, author, or genre. They can click into any book and see its detail page — metadata, community ratings, genre tags, reviews from top curators. Everything is browsable without an account. This is critical: the value proposition must be visible before asking for any commitment.

**Step 2 — Discover something compelling.** The reader clicks into a book that catches their eye. They see the average community rating, but also a breakdown: "Rated 4.8 by 12 curators you might trust." They see genre tags with trust-weighted confidence scores. They see short reviews from curators with visible reputation. They see a link to where the book can be purchased or read (Amazon, author's site, Blossom, wherever).

**Step 3 — Hit the engagement wall.** The reader wants to rate a book, save it to a reading list, or follow a curator whose taste they like. They're prompted to create an account. The prompt is gentle, not a wall — they can dismiss it and keep browsing.

**Step 4 — Create an account.** Options presented: "Continue with Google," "Continue with email," "Sign in with Nostr." No explanation of what nostr is. It's just another login option, like "Sign in with Apple." The nostr option is for people who already know; everyone else uses email or OAuth.

**Step 5 — Rate and engage.** They rate the book they were looking at. They follow the curator whose reviews resonated. They add books to their "Want to Read" shelf. Each action is simple and familiar — stars for ratings, a heart/follow button for curators, a bookmark for shelves.

**Step 6 — Return visits.** Homepage now shows personalized recommendations: "Based on your ratings and the curators you follow." This is where the WoT shines — recommendations improve as the reader's trust graph develops. They rate more books, follow more curators, and the system learns what "people you trust" actually means for them.

### 4.2 Curator: Building Reputation

**Entry:** An active reader who has rated 20+ books and wants to do more — tag genres, write reviews, influence what others see.

**Step 1 — Start tagging.** On any book's detail page, the curator can add genre tags from the community taxonomy (literary fiction, sci-fi, noir, etc.) or propose new tags. They can add quality signals ("well edited," "original voice," "AI generated"). Each tag is attributed to them.

**Step 2 — Write reviews.** The curator writes a short or long review on the book detail page. Reviews are displayed with the curator's trust score visible — readers can see at a glance whether this reviewer is respected by the community.

**Step 3 — Build a following.** As the curator tags and reviews consistently, other users follow them. Their GrapeRank score increases as they accumulate trust from users who are themselves trusted. They can see their follower count and trust score on their profile page.

**Step 4 — Curate lists.** The curator creates named lists: "Best Literary Fiction of 2026," "Underrated Sci-Fi," "Skip These (AI Slop)." These lists are browsable by anyone and carry the curator's trust weight. A list from a highly trusted curator surfaces prominently.

### 4.3 Author: Submitting a Book

**Entry:** An indie author who wants their book on Unbnd.

**Step 1 — Search for existing entry.** Author searches Unbnd for their book. If it exists (seeded from Open Library), they can "claim" it — linking it to their account. This adds an "Author Verified" badge and lets them edit the blurb, update the cover, and add a preferred purchase link.

**Step 2 — Submit a new book.** If the book doesn't exist (new release, very indie, not in Open Library), the author clicks "Submit a Book." They fill out a form: title, author name, blurb, cover image URL, page count, publication year, language, genre (self-selected), and a link to where it can be purchased or read. The form enforces the book metadata schema. Duplicate detection checks ISBN first, then fuzzy title+author match.

**Step 3 — Community response.** After submission, the book enters the catalog. Community members discover it, tag it, rate it. The author can see this activity on their book's detail page. They can share the unbnd.ink link to their book anywhere — social media, their newsletter, their website.

---

## 5. Feature Specification (MVP)

### 5.1 Homepage

**Purpose:** First impression and primary browse surface.

**Content:**
- Hero section with value proposition and search bar.
- "Trending" shelf: books with the most community activity in the past 7/30 days, weighted by trust.
- Genre shelves: horizontal scrollable rows per top-level genre (Fiction, Nonfiction, Sci-Fi, Mystery, etc.), showing top-rated books in each.
- "Community Favorites" shelf: highest trust-weighted rating across all genres.
- "Recently Added" shelf: newest submissions and catalog entries.
- For logged-in users: "Recommended for You" shelf based on their ratings, follows, and trust graph.

**Behavior:**
- All shelves are browsable without an account.
- Each book in a shelf shows: cover image, title, author, average trust-weighted rating (stars), and top genre tag.
- Clicking a book goes to its detail page.
- Clicking a genre label goes to the genre browse page.

### 5.2 Search

**Purpose:** Find any book by title, author, ISBN, or keyword.

**Implementation:** Full-text search across the book catalog. Powered by Meilisearch (or equivalent) for sub-10ms query times across millions of records. Results ranked by relevance with trust-weighted rating as a secondary sort signal.

**Behavior:**
- Search bar in the header, always accessible.
- Results show: cover, title, author, rating, top genre tags.
- Filters: genre, rating threshold, publication year range, language.
- Sort options: relevance, rating (trust-weighted), publication year, recently added.

### 5.3 Genre Browse

**Purpose:** Explore books within a genre or subgenre.

**Content:**
- Genre header with description.
- All books tagged with this genre, sorted by trust-weighted rating by default.
- Subgenre navigation if applicable (Fiction → Literary Fiction → Autofiction).
- Filter and sort controls matching search.

**Behavior:**
- Genre tags are community-curated. A book's genre assignment reflects the weighted consensus of all taggers, not just the author's self-selection.
- Books can appear in multiple genres.
- A genre page shows the number of books tagged and the top curators active in that genre.

### 5.4 Book Detail Page

**Purpose:** The core content page. Everything about a single book.

**Sections:**

**Header:** Cover image (large), title, author name (linked to author profile if claimed), publication year, page count, language, genre tags (community-assigned, with confidence scores).

**Ratings summary:** Average trust-weighted rating (stars). Number of ratings. Distribution chart (how many 1-star, 2-star, etc.). "People you trust rate this X" (for logged-in users with a trust graph).

**Purchase/read links:** External links to where the book can be obtained — Amazon, author's website, Blossom URL, Gumroad, library, wherever. Multiple links allowed. Author-submitted links appear first. Unbnd does not sell books in Phase 1.

**Reviews:** Community reviews sorted by reviewer trust score (highest-trust first). Each review shows: reviewer name, their trust score, their star rating, their review text, timestamp. Logged-in users can upvote reviews, which further weights them.

**Quality signals:** Community-applied signals displayed as badges: "Well Edited," "Original Voice," "AI Generated," "Needs Copy Edit," etc. Each signal shows the number of taggers and the aggregate trust weight of the signal.

**Author section (if claimed):** Author bio, linked nostr profile or website, other books by this author on Unbnd.

**Actions (logged-in users):**
- Rate (1–5 stars).
- Add to shelf ("Want to Read," "Reading," "Read," or custom shelves).
- Write a review.
- Add genre tags.
- Add quality signals.
- Share (copy link, share to social).

### 5.5 User Profile Page

**Purpose:** Public-facing profile for any user (reader, curator, or author).

**Content:**
- Display name, avatar (from nostr profile if available, or uploaded).
- Trust score (displayed as a community reputation indicator, not a raw number — something like "Top 5% Curator" or a tier badge).
- Stats: books rated, reviews written, tags applied, followers, following.
- Shelves: publicly visible shelves (Want to Read, Read, custom lists).
- Recent activity: latest ratings, reviews, tags.

**Author-specific additions:**
- "Books by this author" section.
- "Author Verified" badge if they've claimed their books.

### 5.6 Shelves / Reading Lists

**Purpose:** Personal organization and social discovery.

**Default shelves:** "Want to Read," "Reading," "Read."

**Custom shelves:** Users can create named lists — "Best of 2026," "Recommend to Mom," "AI Slop Hall of Shame." Custom shelves can be public or private.

**Social function:** A curator's public shelves are browsable by anyone. "Show me what @bookblogger has on their 'Best Literary Fiction' shelf" becomes a discovery path.

### 5.7 Authentication System

**Three-tier identity model:**

**Tier 1 — Nostr-Native (Sovereign):**
- Login via NIP-07 browser extension.
- User owns their keys. Identity is portable. All events signed by their key.
- Presented as "Sign in with Nostr" — one option among equals.
- Stretch: add Nostr Connect (bunker) support as an additional sovereign login method.

**Tier 2 — Custodial (Email/OAuth):**
- MVP: sign up with email + password. Unbnd generates a nostr keypair behind the scenes.
- For email users: private key encrypted at rest using a key derived from their password (Argon2 or equivalent). Server-managed backup key for password recovery (see §8.4).
- Stretch: add Google / Apple / GitHub OAuth as additional Tier 2 login methods (server-managed key encryption for OAuth users).
- All events signed server-side. User never sees a keypair.
- Presented as "Continue with email" (MVP) / "Continue with Google" (stretch).

**Tier 3 — Anonymous Browse:**
- No account. Full read access to the catalog, ratings, reviews.
- Cannot rate, tag, review, or create shelves.
- Prompted to create an account when attempting a write action.

**MVP auth methods:** NIP-07 + Email/Password.
**Stretch auth methods:** Nostr Connect (bunker), Google OAuth, Apple OAuth.

**Upgrade path (Tier 2 → Tier 1):**
- Any custodial user can export their nsec at any time via Settings.
- They can transition to NIP-07 without losing any history — everything was signed with a real nostr key from the start.
- This is prominently documented and positioned as a feature, not a hidden option.

### 5.8 Book Submission / Author Claiming

**Submit a new book:**
- Any logged-in user can submit a book (not just the author — anyone can add a book they've read that isn't in the catalog).
- Form fields: title (required), author name (required), blurb, cover image URL, ISBN-13, ISBN-10, page count, publication year, language, genre (self-selected from taxonomy), link to purchase/read.
- Duplicate detection: check ISBN first, then fuzzy title + author match. If potential duplicate found, show the match and offer "Is this the same book?" before allowing the new entry.
- Submission creates a kind 39999 DList item signed by the submitter's key.

**Claim an existing book (author flow):**
- Author searches for their book, clicks "I'm the author — claim this book."
- Claiming links the book to the author's account, adds "Author Verified" badge, and grants edit access to the metadata (blurb, cover, purchase links).
- Verification in MVP is trust-based, not automated: the claim is visible to the community, and curators can flag suspicious claims.

---

## 6. Data Model

### 6.1 Underlying Protocol

All data is stored as nostr events using the Tapestry DList protocol:

- **Kind 39998:** Replaceable DList Header — defines a concept (the "books" catalog, the "genres" taxonomy, etc.).
- **Kind 39999:** Replaceable DList Item — an element within a concept (a specific book, a specific genre, a specific rating).
- **a-tag addressing:** Every event has a stable address in the format `kind:pubkey:d-tag`, used as the primary identifier.
- **z-tag parent pointer:** Every item points to its parent concept header.
- **json tag:** Carries structured metadata in word-wrapper JSON format.

### 6.2 Book Record Schema (kind 39999)

Each book is a DList item under the "books" concept header. The word-wrapper JSON payload:

```json
{
  "word": {
    "slug": "the-great-gatsby",
    "name": "The Great Gatsby",
    "title": "The Great Gatsby",
    "wordTypes": ["word", "bookSubmission"]
  },
  "bookSubmission": {
    "slug": "the-great-gatsby",
    "title": "The Great Gatsby",
    "authorName": "F. Scott Fitzgerald",
    "authorPubkey": null,
    "isbn13": "9780743273565",
    "isbn10": "0743273567",
    "openLibraryId": "OL468431W",
    "coverUrl": "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
    "pageCount": 180,
    "publishYear": 1925,
    "language": "en",
    "subjects": ["fiction", "classics", "american-literature"],
    "blurb": "Set in the Jazz Age on Long Island...",
    "format": "reference",
    "fileUrl": null,
    "purchaseUrl": "https://openlibrary.org/works/OL468431W",
    "source": "openlibrary"
  }
}
```

**Field definitions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| slug | string | yes | URL-safe unique identifier |
| title | string | yes | Book title |
| authorName | string | yes | Author display name |
| authorPubkey | string | no | Hex pubkey of author (if claimed) |
| isbn13 | string | no | ISBN-13 |
| isbn10 | string | no | ISBN-10 |
| openLibraryId | string | no | Open Library work ID (provenance) |
| coverUrl | string | no | URL to cover image |
| pageCount | integer | no | Page count |
| publishYear | integer | no | Original publication year |
| language | string | no | ISO 639-1 language code |
| subjects | array | no | Open Library subject tags (raw import data) |
| blurb | string | no | Description / back-cover copy |
| format | string | no | "reference" (catalog entry), "ebook", "both" |
| fileUrl | string | no | URL to downloadable ebook (Phase 2) |
| purchaseUrl | string | no | URL to purchase or read |
| source | string | yes | "openlibrary", "author", "community" |

### 6.3 Genre Schema (kind 39999)

Each genre is a DList item under the "genres" concept header:

```json
{
  "word": {
    "slug": "book-genre--literary-fiction",
    "name": "book genre: literary fiction",
    "title": "Book Genre: Literary Fiction",
    "wordTypes": ["word", "bookGenre"]
  },
  "bookGenre": {
    "slug": "literary-fiction",
    "name": "Literary Fiction",
    "description": "Character-driven fiction emphasizing prose style, thematic depth, and psychological complexity.",
    "parentGenre": "fiction"
  }
}
```

### 6.4 Rating Schema (kind 39999)

Each rating is a DList item under the "ratings" concept header, referencing a book:

```json
{
  "word": {
    "slug": "rating--the-great-gatsby--<rater-pubkey-prefix>",
    "name": "rating: The Great Gatsby",
    "wordTypes": ["word", "bookRating"]
  },
  "bookRating": {
    "bookSlug": "the-great-gatsby",
    "bookAtag": "39999:<book-author-pubkey>:the-great-gatsby",
    "score": 5,
    "reviewText": "A masterpiece of American literature...",
    "reviewDate": "2026-05-27"
  }
}
```

### 6.5 Genre Tag Schema (kind 39999)

Each genre tag applied to a book is a DList item under the "book-genre-tags" concept header:

```json
{
  "word": {
    "slug": "genre-tag--the-great-gatsby--literary-fiction--<tagger-pubkey-prefix>",
    "name": "genre tag: The Great Gatsby → Literary Fiction",
    "wordTypes": ["word", "bookGenreTag"]
  },
  "bookGenreTag": {
    "bookSlug": "the-great-gatsby",
    "bookAtag": "39999:<pubkey>:the-great-gatsby",
    "genreSlug": "literary-fiction"
  }
}
```

### 6.6 Quality Signal Schema (kind 39999)

Same pattern for quality signals ("AI Generated," "Well Edited," etc.):

```json
{
  "word": {
    "slug": "quality-signal--the-great-gatsby--well-edited--<tagger-pubkey-prefix>",
    "name": "quality signal: The Great Gatsby → Well Edited",
    "wordTypes": ["word", "bookQualitySignal"]
  },
  "bookQualitySignal": {
    "bookSlug": "the-great-gatsby",
    "bookAtag": "39999:<pubkey>:the-great-gatsby",
    "signalSlug": "well-edited"
  }
}
```

### 6.7 Shelf Schema (kind 39999)

User shelves are DList items under a "shelves" concept header:

```json
{
  "word": {
    "slug": "shelf--<user-pubkey-prefix>--want-to-read",
    "name": "shelf: Want to Read",
    "wordTypes": ["word", "bookShelf"]
  },
  "bookShelf": {
    "slug": "want-to-read",
    "name": "Want to Read",
    "visibility": "public",
    "books": [
      "the-great-gatsby",
      "eidolon"
    ]
  }
}
```

---

## 7. Catalog Seeding Strategy

### 7.1 Source: Open Library

The book catalog must be populated before launch. An empty bookstore is a dead bookstore. No one will rate or tag books if there are no books to rate or tag.

**Open Library** (openlibrary.org) is the Internet Archive's open book database. It is the right source because:
- Truly open: bulk data dumps freely available, no API key required for most operations.
- 40M+ records with rich metadata.
- Cover images available via simple URL pattern.
- Works/editions distinction allows deduplication.

### 7.2 Import Pipeline

1. Download Open Library bulk data dump (works dump + editions dump + authors dump).
2. Filter: English-language works, published after 1900, with at least one ISBN, and cover art available. Target: ~500K works.
3. Deduplicate: one DList item per "work" (abstract concept), aggregating best metadata from across editions.
4. Transform: convert to the bookSubmission schema (§6.2).
5. Sign: all seeded events signed by the "Unbnd Librarian" system key — a dedicated nostr keypair for imported catalog entries.
6. Import: publish events to strfry, let streaming ETL ingest into Neo4j.
7. Index: Meilisearch indexes all book records for search.

### 7.3 Scale Considerations

500K DList items is more than existing Tapestry deployments have tested but within reasonable bounds. Before committing to full import:
- Spike test: seed 100K books, verify strfry, Neo4j, and Meilisearch all handle it.
- Benchmark query performance at scale.
- Verify UI pagination works gracefully.
- If 500K performs well and the filters yield more qualifying works, consider expanding toward 1M+.

### 7.4 Ongoing Catalog Maintenance

- Periodic re-import to capture new Open Library entries (monthly or quarterly).
- Author-submitted books enter in real-time via the submission flow.
- Community-submitted books enter in real-time via the submission flow.
- Duplicate detection runs on every new submission against the existing catalog.

---

## 8. Authentication Architecture

### 8.1 Three-Tier Model

See §5.7 for the user-facing spec. This section covers the technical architecture.

**Tier 1 — Nostr-Native:**
- Client-side signing via NIP-07 or Nostr Connect.
- Unbnd server never touches the private key.
- Events are signed in the browser and published directly.
- Session management via NIP-98 HTTP Auth or a lightweight JWT issued after verifying a signed challenge.

**Tier 2 — Email/Password Custodial:**
- On registration: generate a nostr keypair (secp256k1).
- Derive an encryption key from the password using Argon2id (high memory cost).
- Encrypt the nostr private key with the derived key.
- Store the encrypted private key in the database.
- On login: derive the encryption key from the provided password, decrypt the private key, use it for the session.
- On every write action (rate, tag, review): sign the nostr event server-side with the decrypted key, publish to strfry.
- Password change: re-encrypt the private key with the new password-derived key.

**Tier 2 — OAuth Custodial:**
- On registration: generate a nostr keypair.
- Encrypt the private key with a server-managed encryption key (less sovereign than password-derived, but the user chose convenience over sovereignty — that's their right).
- Store the encrypted private key in the database, linked to the OAuth provider ID.
- On login: OAuth flow → decrypt the private key → use it for the session.

**Tier 2 → Tier 1 Upgrade:**
- Settings page: "Export your Nostr key."
- Decrypt the private key, display the nsec (with appropriate warnings).
- User saves the nsec, sets up NIP-07.
- On next login, they choose "Sign in with Nostr."
- All historical data is intact — same pubkey, same events.

### 8.2 Session Management

- JWTs for session tokens (short-lived, refreshable).
- For Tier 2 users: the decrypted private key is held in server memory for the duration of the session, never written to disk unencrypted, and discarded on session end.
- For Tier 1 users: no private key on the server at any point.

### 8.3 Security Considerations

- Password-derived key encryption (Tier 2 email) is the strongest custodial model — Unbnd cannot sign events without the user's password.
- OAuth custodial (Tier 2 OAuth, stretch goal) uses server-managed keys — Unbnd *can* theoretically sign events without the user present. This is an acceptable tradeoff for the convenience-first user, and the upgrade path to Tier 1 is always available.
- All private keys at rest are encrypted. Database breach does not expose keys (for email users, the attacker would also need the password; for OAuth users, the attacker would need the server-managed encryption key).

### 8.4 Key Recovery

For email/password users, forgetting the password would normally mean losing access to the password-derived encryption key and therefore the nostr private key. To prevent identity loss:

- On registration, the nostr private key is also encrypted with a **server-managed backup key** and stored separately.
- Standard password reset flow: user receives a reset link, sets a new password, and the system re-encrypts the private key using the new password-derived key (decrypting first via the server-managed backup key).
- This is a sovereignty tradeoff — the server can technically decrypt the key via the backup path. Users who want full sovereignty should use Tier 1 (Nostr-native login) where the server never holds keys.
- The backup key exists solely for recovery. It is not used for routine signing operations.

---

## 9. Trust and Curation System

### 9.1 GrapeRank Scoring

Every user has a trust score computed by the GrapeRank algorithm, personalized per observer. This means:
- Reader A might trust Curator X highly (because people A follows also follow X).
- Reader B might not trust Curator X at all (different trust graph).
- The same book can have different effective ratings for different readers, based on whose ratings are weighted most heavily in their trust graph.

### 9.2 Trust-Weighted Ratings

A book's displayed rating is not a simple average. It is a weighted average where each rater's score is multiplied by their GrapeRank trust score (from the observer's perspective). This means:
- A 5-star rating from a highly trusted curator contributes more than a 5-star rating from an unknown account.
- Gaming the ratings requires accumulating genuine trust from real users — not just creating bot accounts.
- Different users see slightly different aggregate ratings based on their personal trust graph.

For anonymous/logged-out users: ratings are weighted by a global GrapeRank (computed from a default "community" observer perspective).

### 9.3 Trust-Weighted Genre Tags

Same principle for genre tags. If 10 people tag a book as "sci-fi" and 3 people tag it as "literary fiction," the displayed genre isn't just majority-rules — it's trust-weighted. If the 3 "literary fiction" taggers are highly trusted curators and the 10 "sci-fi" taggers are low-trust accounts, the book may display "literary fiction" as its primary genre.

### 9.4 Quality Signals

Quality signals ("Well Edited," "Original Voice," "AI Generated," "Needs Copy Edit") are binary tags with trust-weighted confidence scores. A signal is displayed when the trust-weighted consensus exceeds a configurable threshold.

"AI Generated" is a special signal with prominence in the UI — it's displayed as a badge on book cards and detail pages when the threshold is met. This is a timely and differentiated feature.

### 9.5 House PoV and Personalization

Trust-weighted curation requires a point-of-view — whose trust graph are we computing from? Unbnd uses a two-tier model borrowed from Brainstorm's approach at brainstorm.world:

**House PoV (default for all users):**

Unbnd maintains its own nostr identity (the "Unbnd" npub). GrapeRank scores are pre-computed from this house perspective. Every user — anonymous, custodial, sovereign — sees results weighted by the house PoV by default. This solves the cold-start problem: a new user immediately gets useful, trust-weighted results because the house has already established a trust graph across active curators.

The house PoV is the editorial voice of the platform. It reflects which curators Unbnd's house account follows, which is itself a form of curation. This is transparent — the house PoV follow list is public.

**Personalized PoV (opt-in for engaged users):**

As a user follows curators and rates books, they silently build a nostr social graph. Follows are kind 3 events signed by their key (custodial or sovereign). Ratings are DList items signed by their key. The user experiences this as "I follow curators I like and rate books I read." Behind the scenes, they're accumulating the inputs GrapeRank needs.

Once a user has sufficient signal (approximately 10+ follows), a "Personalize your recommendations" option appears in their settings or as a prompt on the homepage. Activating it triggers a GrapeRank computation from their npub's perspective. From that point on, all trust-weighted displays — ratings, genre tags, quality signals, browse shelves — reflect their personal trust graph rather than the house PoV.

**Tier-specific behavior:**

- **Anonymous (Tier 3):** House PoV only. No personalization possible.
- **Custodial (Tier 2):** House PoV by default. Personalization available once they've built enough follow/rating signal. Their GrapeRank runs from the custodial npub the system generated for them — the computation is identical to a sovereign user's.
- **Sovereign (Tier 1):** May already have a rich follow graph from their existing nostr life. Personalization can be offered immediately if their follow list has sufficient signal. This is a strong incentive for nostr-native login — instant personalized curation.

**Implementation:**

Personalized GrapeRank is a background job, not real-time. When a user activates personalization (or periodically thereafter), the system queues a GrapeRank computation for their npub. This runs the same customer pipeline that brainstorm.world uses. Results are cached and served until the next recomputation. The user sees "Updating your recommendations..." briefly, then gets their personalized view.

A toggle in settings allows switching between "House recommendations" and "My recommendations" at any time, so users can compare.

---

## 10. Technical Architecture

### 10.1 Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React (Vite) | SPA hosted at unbnd.ink |
| Backend API | Node.js / Express | REST API, auth, event signing |
| Nostr Relay | strfry | Local event store (DList events, profiles, ratings) |
| Graph Database | Neo4j | Concept graph, trust scores, relationship queries |
| Search | Meilisearch | Full-text search across book catalog |
| Trust Engine | GrapeRank | Trust scoring pipeline |
| Database | PostgreSQL (or SQLite) | User accounts, sessions, encrypted keys |

### 10.2 Deployment

- Single Digital Ocean droplet to start (can be Docker Compose).
- Domain: unbnd.ink, SSL via Let's Encrypt.
- CI/CD: GitHub Actions → SSH deploy (same pattern as Tapestry's brainstorm.world).
- The Tapestry Docker container (strfry + Neo4j + Express) forms the data layer.
- The Unbnd application layer sits on top: its own Express server handling auth, user management, and serving the React frontend, proxying DList operations to the Tapestry API.

### 10.3 Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                unbnd.ink (DO Droplet)            │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │         Unbnd Application Layer            │  │
│  │                                            │  │
│  │  React SPA ──── Express API ──── Postgres  │  │
│  │  (frontend)     (auth, user     (accounts, │  │
│  │                  mgmt, API       encrypted  │  │
│  │                  gateway)        keys)      │  │
│  └───────────────┬───────────────────────────┘  │
│                  │ (internal API calls)          │
│  ┌───────────────┴───────────────────────────┐  │
│  │         Tapestry Data Layer                 │  │
│  │                                             │  │
│  │  strfry ─── Neo4j ─── Meilisearch          │  │
│  │  (relay)    (graph)   (search)              │  │
│  │                                             │  │
│  │  GrapeRank pipeline                         │  │
│  │  Streaming ETL (strfry → Neo4j)             │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  nginx (reverse proxy, SSL termination)            │
└────────────────────────────────────────────────────┘
```

---

## 11. MVP Scope Boundaries

### 11.1 In Scope (must ship)

- [ ] Catalog seeded with Open Library data (target: ~500K books).
- [ ] Homepage with browse shelves (trending, genres, community favorites).
- [ ] Full-text search across catalog.
- [ ] Genre browse pages.
- [ ] Book detail page with metadata, ratings, reviews, genre tags, quality signals.
- [ ] Authentication: NIP-07 (sovereign) + email/password (custodial) + anonymous browse.
- [ ] User ratings (1–5 stars).
- [ ] User reviews (text).
- [ ] Community genre tagging.
- [ ] Community quality signals (including "AI Generated").
- [ ] User shelves (Want to Read, Reading, Read, custom).
- [ ] User profile pages.
- [ ] Book submission form (for books not in catalog).
- [ ] Author claiming flow (for books already in catalog).
- [ ] Trust-weighted rating display (house PoV by default).
- [ ] Personalized GrapeRank (opt-in for engaged users with 10+ follows).
- [ ] House PoV / personal PoV toggle.
- [ ] Responsive web design (mobile-friendly).

### 11.2 Stretch (ship if time allows)

- Nostr Connect (bunker) login.
- Google / Apple OAuth login.

### 11.3 Out of Scope (Phase 2+)

- Payment / Lightning integration.
- File hosting / Blossom integration.
- Ebook sales or distribution.
- Editing bounty marketplace.
- Print on demand.
- Social feed / activity stream.
- Reading progress tracking.
- Discussion groups / forums.
- Library system integration.
- Mobile native apps.
- Email notifications.
- Federation / multi-instance.

---

## 12. Phase Roadmap

### Phase 1: MVP (Pre-Grant, 6–8 weeks)

Build and launch the core discovery and curation platform. Demonstrate that trust-weighted book curation works. Deploy to unbnd.ink.

### Phase 2: Grant-Funded Build (6–12 months, OpenSats + HRF)

- Lightning payment integration (V4V + fixed price).
- Blossom file hosting for ebooks.
- Reader-facing UI polish (designed bookstore experience).
- Editing bounty marketplace.
- Trusted list publication to relay network.
- OAuth providers (Google, Apple).
- Email notifications.

### Phase 3: Network Effects (12–24 months)

- Multi-instance federation.
- Author reputation system.
- Print on demand partnership.
- Public API for other clients.
- Audiobook integration (bounty-funded narration).

---

## 13. Success Metrics (MVP)

| Metric | Target | Why it matters |
|--------|--------|----------------|
| Catalog size at launch | 100K+ books | Must feel like a real bookstore, not an empty shelf |
| Page load time | < 2s | Basic UX requirement |
| Search latency | < 100ms | Must feel instant |
| Accounts created (first month) | 100+ | Proves the auth model works for normies |
| Books rated (first month) | 500+ | Proves engagement loop works |
| Genre tags applied (first month) | 1,000+ | Proves curation is happening |
| Nostr-native logins | 10%+ of accounts | Proves the bridge works both ways |
| Grant application submitted | 1+ (OpenSats or HRF) | The MVP's primary purpose |

---

## 14. Grant Positioning

### 14.1 OpenSats Application

**Lead with:** "I'm building sovereign publishing infrastructure for nostr — an open-source book discovery platform where communities curate through Web of Trust, with no dependence on Amazon or Goodreads."

**Technical angle:** The platform demonstrates DList primitives and GrapeRank applied to a real consumer use case. All data is portable nostr events. The custodial auth model bridges mainstream users onto sovereign infrastructure without requiring technical knowledge.

**Founder-market fit:** Author of three novels, experienced the publishing gatekeeping firsthand, host of Plebchain Radio, co-founder of NosFabrica (the team building the underlying protocol). Building the tool he wished existed.

### 14.2 HRF Application

**Lead with:** "I'm building a censorship-resistant book discovery platform where no government, corporation, or payment processor can prevent a book from being found by its audience."

**Censorship angle:** Books are banned, suppressed, and deplatformed with increasing frequency. Amazon has removed titles without explanation. Payment processors have pressured publishers. Unbnd ensures that once a book is in the catalog — stored as nostr events across relays — it cannot be removed by any single entity.

**Use cases:** Writers in authoritarian regimes, banned books, deplatformed voices, pseudonymous publishing for at-risk authors.

---

## 15. Open Questions

1. **GrapeRank computation for millions of ratings:** The existing GrapeRank pipeline handles the Tapestry scale. Does it handle millions of book ratings across hundreds of thousands of users? Needs stress testing.

2. **Cover image hosting:** Open Library provides cover URLs, but they're not fast or reliable. Do we proxy/cache covers, or accept the dependency for MVP?

3. **Review moderation:** Trust-weighted curation handles quality ranking, but does it handle abuse (spam reviews, harassment)? Is WoT-based downweighting sufficient, or does the MVP need a manual moderation layer?

4. ~~**Custodial key recovery:**~~ **Resolved.** Server-managed backup key. See §8.4.

5. **Open Library data freshness:** How often do we re-import? Is a monthly batch sufficient, or do new releases need faster ingestion?

6. **Naming for the system signing key:** "Unbnd Librarian" is a working name. The seeded catalog entries need a clearly identifiable system author that the community understands is imported reference data, not a human's curation.

7. **Personalized GrapeRank compute cost:** Running the customer GrapeRank pipeline per-user is resource-intensive. At what user count does this become a scaling concern on a single droplet? May need to throttle personalization requests or batch them during off-peak hours.

---

## Appendix A: Genre Taxonomy (Seed)

Top-level genres for initial catalog:

**Fiction:** Literary Fiction, Science Fiction, Fantasy, Mystery, Thriller, Horror, Romance, Historical Fiction, Humor, Short Stories, Young Adult, Children's

**Nonfiction:** Biography/Memoir, History, Science, Philosophy, Psychology, Business, Self-Help, Politics, True Crime, Essays, Travel, Food/Cooking, Health, Technology, Religion/Spirituality

**Special signals (not genres):** AI Generated, Well Edited, Original Voice, Needs Copy Edit, Recommended, DNF (Did Not Finish)

This taxonomy is community-curated and extensible. Any user can propose new genres or signals. Adoption is determined by trust-weighted consensus.

---

## Appendix B: Competitive Landscape

| Platform | Strength | Weakness | Unbnd Advantage |
|----------|----------|----------|-----------------|
| Goodreads | Massive catalog, network effects | Amazon-owned, stale UI, gameable reviews, algorithmic bias | Trust-weighted curation, no commercial bias, modern UX |
| StoryGraph | Modern UI, mood-based recs | Small catalog, single developer, centralized | Community-driven, open protocol, sovereign data |
| BookWyrm | Federated (ActivityPub), open source | Small network, ActivityPub limitations, no trust scoring | GrapeRank trust weighting, nostr portability, larger catalog via seeding |
| LibraryThing | Deep metadata, strong community | Aging platform, small user base | Modern stack, trust-weighted discovery |
| Amazon KDP | Distribution monopoly | Discovery is retail-optimized, not reader-optimized | Phase 2+ addresses distribution; MVP addresses discovery |
