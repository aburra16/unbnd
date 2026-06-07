// Thin fetch wrapper for the apps/api auth endpoints, per ADR 0003.
// In dev the Vite proxy routes /auth/* to localhost:8787, so base is "".
const base = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? "");

export type PublicUser = {
  id: string;
  email: string | null;
  displayName: string;
  npub: string;
};

export type SignedEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type NostrEventTemplate = {
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
};

export type PublicRating = {
  npub: string;
  score: number;
  reviewText?: string;
  reviewDate: string;
};

// Community submission (ADR 0016). The form's intent; the server/ client builds
// the kind-39999 record from it.
export type SubmissionInput = {
  title: string;
  authorName: string;
  isbn13?: string;
  isbn10?: string;
  blurb?: string;
  coverUrl?: string;
  publishYear?: number;
  pageCount?: number;
  language?: string;
  purchaseUrl?: string;
  subjects?: string[];
  isAuthor?: boolean;
};

// Per-submission trust signals (Story 30 / ADR 0031 §3). Honest counts +
// identities + the trust-weighted average, or null ("no trusted signal yet").
export type SubmissionSignals = {
  trustedAverage: number | null;
  curatorRatingCount: number;
  curatorTagCount: number;
  curators: string[];
} | null;

export type SubmittedBook = {
  slug: string;
  title: string;
  authorName: string;
  isbn13?: string;
  coverUrl?: string;
  publishYear?: number;
  createdAt: number;
  /** Present on the public list: the submitter's npub. */
  submitter?: string;
  /** Story 30: whether the session user clears the curator gate for this row. */
  canPromote?: boolean;
  /** Story 30: the promotion job's state, when one exists. */
  promotionStatus?: string | null;
  /** Story 30: trust signals as decision support, or null. */
  signals?: SubmissionSignals;
};

// Trust-weighted view from an observer's vantage (ADR 0014); null when no
// rater is trusted from that vantage.
export type WeightedRatings = {
  observer: string;
  average: number;
  trustedCount: number;
  ratings: PublicRating[];
};

export type RatingsSummary = {
  count: number;
  average: number | null;
  ratings: PublicRating[];
  weighted?: WeightedRatings | null;
  // Story 28 / ADR 0029: the signed-in caller's own current rating, sourced
  // server-side from the raw set (never the trust-weighted subset), cap-safe.
  // Additive: null for anon/never-rated; absent on old responses (client then
  // falls back to scanning `ratings` by npub).
  yourRating?: PublicRating | null;
};

// Catalog read shapes (ADR 0010). Mirror apps/api PublicBook + tag consensus.
export type PublicBook = {
  slug: string;
  title: string;
  authorName: string;
  blurb?: string;
  coverUrl?: string;
  publishYear?: number;
  pageCount?: number;
  language?: string;
  subjects?: readonly string[];
  openLibraryId?: string;
  isbn13?: string;
  purchaseUrl?: string;
  format: string;
};

// A book's author claimant (Story 31 / ADR 0032). npub only — the hex pubkey
// never crosses the wire. Resolved to a display name client-side via useProfileMeta.
// `verified` (Story 32 / ADR 0033) is present only when the book read ran the
// trust seam; absent/false behaves as the unverified "claimed" state.
export type BookClaimant = {
  npub: string;
  verified?: boolean;
};

// The author-overlaid fields applied to `effectiveBook` (Story 32 / ADR 0033 §5),
// so the UI can attribute a blurb/cover/link as author-provided ("From the author").
export type AuthorProvidedField = "blurb" | "coverUrl" | "purchaseUrl";

export type TagConsensus = {
  slug: string;
  name: string;
  type: "genre" | "style" | "signal";
  applies: number;
  disputes: number;
  // Trust-weighted: true when ≥1 positively-trusted asserter backed this tag
  // from the active observer's vantage (ADR 0025). False on the raw/community view.
  trusted: boolean;
  // ADR 0034 §5: true ONLY on an accusatory tag surfaced by a live librarian
  // reveal. The web renders it attributed to a review action, never as
  // community consensus, with no curator count. Absent on every other tag.
  revealed?: boolean;
};

export type BookTags = {
  genres: TagConsensus[];
  styles: TagConsensus[];
  signals: TagConsensus[];
  // The resolved observer (npub) the consensus was computed from, when present.
  observer?: string;
  // Section state: at least one surfaced tag carries trusted signal (ADR 0025).
  weighted?: boolean;
  // ADR 0034 §2: once-computed, fail-closed picker affordance — true only when
  // the session user clears the curator gate from the house vantage. Gates
  // whether the picker offers accusatory tags (server is the real enforcement).
  canAssertAccusatory?: boolean;
};

export type TaxonomyElement = {
  slug: string;
  type: "genre" | "style" | "signal";
  name: string;
  sensitivity: "normal" | "accusatory";
};

// Shelves (ADR 0018, enriched in ADR 0019 Decision 1). A grouped read of the
// user's own membership assertions; each shelf book is a catalog PublicBook
// (cover/title/author), with unresolvable slugs omitted and the count recounted.
export type Shelf = {
  slug: string;
  name: string;
  count: number;
  books: PublicBook[];
};

// Honest own-profile counts (ADR 0019 Decision 2). Each field is present only
// when its server-side read succeeded; an absent field is hidden, never a
// fabricated 0. A genuine 0 is present.
export type ProfileStatsResponse = {
  booksRated?: number;
  reviews?: number;
  tagsApplied?: number;
  // The target's own kind-3 `p`-tag count (ADR 0023, AC-9). Present only when
  // the kind-3 read succeeded (a true 0 is present); absent on omit-on-throw.
  followingCount?: number;
  // Trust-anchored followers count (Story 74 / ADR 0072, the NIP-85 attestation).
  // Omitted on 0 / no datum → the profile shows "No followers yet."
  followersCount?: number;
  // Keys whose underlying read hit the relay-cap ceiling (ADR 0021): their value
  // is a floor ("N+"), not exact. Absent/empty ⇒ nothing capped.
  capped?: ("booksRated" | "reviews" | "tagsApplied")[];
};

export type ShelfInput = {
  bookSlug: string;
  shelfSlug: string;
  shelfName?: string;
  polarity: 1 | -1;
};

// Search (ADR 0013). Provider-neutral hits; the web only ever talks to
// /api/search, never the search backend.
export type SearchHit = {
  slug: string;
  title: string;
  authorName: string;
  blurb?: string;
  coverUrl?: string;
  publishYear?: number;
  isbn13?: string;
  format: string;
  score?: number;
};

export type SearchResult = {
  hits: SearchHit[];
  total: number;
  offset: number;
  limit: number;
};

// kind-0 profile metadata (ADR 0012). Always carries npub; the rest is
// best-effort from public relays (present for sovereign users with a profile).
export type ProfileMeta = {
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  about?: string;
  // ADR 0020: a "Writes on Substack" link, server-validated as an http(s) URL.
  substack?: string;
};

// Homepage trust shelves (Story 35 / ADR 0036 §3). The serve API returns ordered
// books per shelf, hydrated to PublicBook — no trust score / tier / "trusted"
// flag on the wire (CLAUDE.md). Empty arrays = honest empty; `computedAt` is null
// when the cache is empty. A genre row carries its slug + display name.
export type HomepageShelfGenre = {
  slug: string;
  name: string;
  books: PublicBook[];
};

export type HomepageShelves = {
  computedAt: string | null;
  trending: { books: PublicBook[] };
  favorites: { books: PublicBook[] };
  // Story 71 / ADR 0069. Optional for back-compat with older serve responses.
  hiddenGems?: { books: PublicBook[] };
  genres: HomepageShelfGenre[];
};

// The For-You personalized shelf (Story 36 / ADR 0037 §5). Read-time, from the
// signed-in user's own vantage; never cached. `state` carries the why so the
// homepage renders correctly: "personalized" (+ books, possibly empty),
// "not_personalized" (the invitation), "anonymous" (nothing). No trust number /
// tier crosses the wire — the shelf only selects + orders books.
export type ForYou = {
  state: "personalized" | "not_personalized" | "anonymous";
  books: PublicBook[];
};

// Story 64 / ADR 0063: the OL metadata lookup result for submit-form autofill.
// `found: false` carries every "no usable result" case; the endpoint is always
// 200, so `api.ol.lookup` resolves (never throws) and the web reads `found`.
export type OlLookup = {
  found: boolean;
  title?: string;
  authorName?: string;
  coverUrl?: string;
  pageCount?: number;
  publishYear?: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(
      res.status,
      err?.code,
      err?.message ?? "Something went wrong. Try again.",
    );
  }
  return body as T;
}

export const api = {
  auth: {
    signup(input: { email: string; password: string; displayName: string }) {
      return authFetch<{ user: PublicUser }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    login(input: { email: string; password: string }) {
      return authFetch<{ user: PublicUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    logout() {
      return authFetch<void>("/auth/logout", { method: "POST" });
    },
    me() {
      return authFetch<{ user: PublicUser }>("/auth/me");
    },
    nostr: {
      challenge(pubkey: string) {
        return authFetch<{ challenge: string }>("/auth/nostr/challenge", {
          method: "POST",
          body: JSON.stringify({ pubkey }),
        });
      },
      verify(event: SignedEvent) {
        return authFetch<{ user: PublicUser }>("/auth/nostr/verify", {
          method: "POST",
          body: JSON.stringify({ event }),
        });
      },
    },
  },
  ratings: {
    template(input: {
      bookSlug: string;
      score: number;
      reviewText?: string;
      reviewDate: string;
    }) {
      return authFetch<{ template: NostrEventTemplate }>(
        "/api/ratings/template",
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    submit(event: SignedEvent) {
      return authFetch<{
        rating: { score: number; reviewText?: string; reviewDate: string };
        summary: RatingsSummary;
      }>("/api/ratings", { method: "POST", body: JSON.stringify({ event }) });
    },
    // Custodial (email) users: the server signs server-side (ADR 0006). No
    // client signature — just the rating intent. Same endpoint, branched by
    // tier server-side.
    submitCustodial(input: {
      bookSlug: string;
      score: number;
      reviewText?: string;
      reviewDate: string;
    }) {
      return authFetch<{
        rating: { score: number; reviewText?: string; reviewDate: string };
        summary: RatingsSummary;
      }>("/api/ratings", { method: "POST", body: JSON.stringify(input) });
    },
    list(bookSlug: string, observer?: string) {
      const q = observer ? `?observer=${encodeURIComponent(observer)}` : "";
      return authFetch<RatingsSummary>(
        `/api/books/${encodeURIComponent(bookSlug)}/ratings${q}`,
      );
    },
    // Per-rater taste match for the book's raters (Story 66 / ADR 0065), keyed by
    // npub. `signedIn:false` when signed out. Read-time, never cached.
    tasteMatches(bookSlug: string) {
      return authFetch<TasteMatchesResult>(
        `/api/books/${encodeURIComponent(bookSlug)}/taste-matches`,
      );
    },
  },
  // Author claiming (Story 31 / ADR 0032). Both tiers reuse the shipped
  // template→sign→submit (sovereign) / server-signed (custodial) paths — no new
  // crypto. The librarian secret is never involved; the author signs their claim.
  claims: {
    template(input: { bookSlug: string }) {
      return authFetch<{ template: NostrEventTemplate }>("/api/claims/template", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    submit(event: SignedEvent) {
      return authFetch<{ claimed: boolean; claimants: BookClaimant[] }>("/api/claims", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    submitCustodial(input: { bookSlug: string }) {
      return authFetch<{ claimed: boolean; claimants: BookClaimant[] }>("/api/claims", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },
  // Verified-author metadata overlay (Story 32 / ADR 0033 §4). The server gates
  // the write to the Verified author of the book and accepts only blurb / cover
  // URL / purchase link. Both tiers reuse the shipped signing paths — no new
  // crypto, no librarian secret. A null field clears the author value (reverts to
  // canonical at read time).
  authorEdits: {
    template(input: {
      bookSlug: string;
      blurb?: string | null;
      coverUrl?: string | null;
      purchaseUrl?: string | null;
    }) {
      return authFetch<{ template: NostrEventTemplate }>(
        "/api/author-edits/template",
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    submit(event: SignedEvent) {
      return authFetch<{ ok: true; book: PublicBook }>("/api/author-edits", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    submitCustodial(input: {
      bookSlug: string;
      blurb?: string | null;
      coverUrl?: string | null;
      purchaseUrl?: string | null;
    }) {
      return authFetch<{ ok: true; book: PublicBook }>("/api/author-edits", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },
  books: {
    get(slug: string) {
      return authFetch<{
        book: PublicBook;
        claimants: BookClaimant[];
        authorProvided: AuthorProvidedField[];
      }>(`/api/books/${encodeURIComponent(slug)}`);
    },
    list(slugs: string[]) {
      const q = slugs.map((s) => encodeURIComponent(s)).join(",");
      return authFetch<{ books: PublicBook[] }>(`/api/books?slugs=${q}`);
    },
    recent(limit = 24) {
      return authFetch<{ books: PublicBook[] }>(`/api/books?limit=${limit}`);
    },
  },
  search(
    q: string,
    opts: { limit?: number; offset?: number; genre?: string } = {},
  ) {
    const p = new URLSearchParams({ q });
    if (opts.limit != null) p.set("limit", String(opts.limit));
    if (opts.offset != null) p.set("offset", String(opts.offset));
    if (opts.genre) p.set("genre", opts.genre);
    return authFetch<SearchResult>(`/api/search?${p.toString()}`);
  },
  submissions: {
    template(input: SubmissionInput) {
      return authFetch<{ template: NostrEventTemplate }>("/api/submissions/template", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    create(event: SignedEvent) {
      return authFetch<{ ok: true }>("/api/submissions", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    createCustodial(input: SubmissionInput) {
      return authFetch<{ ok: true }>("/api/submissions", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    mine() {
      return authFetch<{ submissions: SubmittedBook[] }>("/api/submissions/mine");
    },
    list() {
      return authFetch<{ submissions: SubmittedBook[] }>("/api/submissions");
    },
    // Story 30 / ADR 0031: a curator promotes a submission into the catalog. The
    // server enforces the gate (anon 401, below-gate 403); a re-promote of the
    // same slug returns `{ status: "already" }`.
    promote(slug: string) {
      return authFetch<{ status: "queued" | "already" }>(
        `/api/submissions/${encodeURIComponent(slug)}/promote`,
        { method: "POST" },
      );
    },
  },
  // Story 64 / ADR 0063: best-effort OL metadata lookup for submit-form autofill.
  ol: {
    lookup(isbn: string) {
      return authFetch<OlLookup>(`/api/ol/lookup?isbn=${encodeURIComponent(isbn)}`);
    },
  },
  trust: {
    status() {
      return authFetch<{ enabled: boolean; hasScores: boolean; canPersonalize: boolean }>(
        "/api/trust/status",
      );
    },
    challenge() {
      // ADR 0026: the server returns the unsigned kind-27235 TEMPLATE to sign
      // (was a bare { challenge } string). The provider owns its shape.
      return authFetch<{ template: NostrEventTemplate }>("/api/trust/challenge");
    },
    personalize(event: SignedEvent) {
      return authFetch<{ ok: true; building: boolean }>("/api/trust/personalize", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    // ADR 0026: custodial in-session trigger — empty body, the server signs the
    // template with the session's ephemeral-wrapped key. No NIP-07 prompt.
    personalizeCustodial() {
      return authFetch<{ ok: true; building: boolean }>("/api/trust/personalize", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
  },
  profile: {
    get(idOrNpub: string) {
      return authFetch<{ profile: ProfileMeta }>(
        `/api/profile/${encodeURIComponent(idOrNpub)}`,
      );
    },
    // Substack link write (ADR 0022). Sovereign: fetch the server-merged
    // unsigned kind-0 template, sign it with NIP-07, submit. Custodial: the
    // server merges + signs. An empty url clears the field.
    substackTemplate(url: string) {
      return authFetch<{ template: NostrEventTemplate }>(
        "/api/profile/substack/template",
        { method: "POST", body: JSON.stringify({ url }) },
      );
    },
    setSubstack(event: SignedEvent) {
      return authFetch<{ substack: string | null }>("/api/profile/substack", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    setSubstackCustodial(url: string) {
      return authFetch<{ substack: string | null }>("/api/profile/substack", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
    },
    // Custodial display-name rename (ADR 0028). The server merges the new name
    // into the freshest kind-0, signs it, and updates the DB in lockstep.
    setDisplayName(displayName: string) {
      return authFetch<{ displayName: string }>("/api/profile/display-name", {
        method: "POST",
        body: JSON.stringify({ displayName }),
      });
    },
    meStats() {
      return authFetch<{ stats: ProfileStatsResponse }>(
        "/api/profile/me/stats",
      );
    },
    // Public by-pubkey twins (ADR 0020): a target user's enriched shelves and
    // honest activity counts, read by npub (or hex). Same shapes as the /me reads.
    shelves(npub: string) {
      return authFetch<{ shelves: Shelf[] }>(
        `/api/profile/${encodeURIComponent(npub)}/shelves`,
      );
    },
    stats(npub: string) {
      return authFetch<{ stats: ProfileStatsResponse }>(
        `/api/profile/${encodeURIComponent(npub)}/stats`,
      );
    },
    // Taste Match (Story 65 / ADR 0064): observer-relative agreement between the
    // signed-in viewer and the path npub. `signedIn:false` when signed out;
    // `self` when viewing your own profile; otherwise the match (honest below the
    // overlap threshold). Read-time, never cached.
    tasteMatch(npub: string) {
      return authFetch<TasteMatchResult>(
        `/api/profile/${encodeURIComponent(npub)}/taste-match`,
      );
    },
    // Curator status (Story 67/68 / ADR 0066/0067): seed OR vouched OR emergent,
    // plus the trusted-vouch count. Drives the profile Curator badge + count.
    curatorStatus(npub: string) {
      return authFetch<{ isCurator: boolean; vouchCount: number }>(
        `/api/profile/${encodeURIComponent(npub)}/curator`,
      );
    },
    // The session user's own status + vouch-eligibility (Story 68 / ADR 0067).
    // Drives the Curate nav (isCurator) + the Vouch control visibility (canVouch).
    meCurator() {
      return authFetch<{ isCurator: boolean; canVouch: boolean }>("/api/me/curator");
    },
    // Does the session user currently vouch this subject (the control's state).
    vouchStatus(npub: string) {
      return authFetch<{ vouched: boolean }>(
        `/api/profile/${encodeURIComponent(npub)}/vouch-status`,
      );
    },
    // Vouch / withdraw (Story 68): sovereign fetches the template, signs, submits;
    // custodial is server-signed. Mirrors the follow write path.
    vouchTemplate(input: { subject: string; action: "vouch" | "withdraw" }) {
      return authFetch<{ template: NostrEventTemplate }>("/api/curator-roles/template", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    vouch(event: SignedEvent) {
      return authFetch<{ ok: boolean }>("/api/curator-roles", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    vouchCustodial(input: { subject: string; action: "vouch" | "withdraw" }) {
      return authFetch<{ ok: boolean }>("/api/curator-roles", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    // Follow / unfollow the kind-3 contact list (ADR 0023). Sovereign: fetch the
    // server-merged unsigned kind-3 template, sign it with NIP-07, submit.
    // Custodial: the server merges + signs. Status is the viewer's own kind-3
    // membership for the target.
    followTemplate(input: { target: string; action: "follow" | "unfollow" }) {
      return authFetch<{ template: NostrEventTemplate }>(
        "/api/profile/follow/template",
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    follow(
      event: SignedEvent,
      hint: { target: string; action: "follow" | "unfollow" },
    ) {
      return authFetch<{ following: boolean }>("/api/profile/follow", {
        method: "POST",
        body: JSON.stringify({ event, target: hint.target, action: hint.action }),
      });
    },
    followCustodial(input: { target: string; action: "follow" | "unfollow" }) {
      return authFetch<{ following: boolean }>("/api/profile/follow", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    followStatus(target: string) {
      return authFetch<{ following: boolean }>(
        `/api/profile/follows/${encodeURIComponent(target)}`,
      );
    },
    // "Books by this author" (Story 31 / ADR 0032): the catalog books the PATH
    // npub has claimed, hydrated to PublicBooks. Empty when none (section absent).
    claimedBooks(npub: string) {
      return authFetch<{ books: PublicBook[] }>(
        `/api/profile/${encodeURIComponent(npub)}/claimed-books`,
      );
    },
  },
  tags: {
    list() {
      return authFetch<{ tags: TaxonomyElement[] }>("/api/tags");
    },
    book(slug: string, observer?: string) {
      const q = observer ? `?observer=${encodeURIComponent(observer)}` : "";
      return authFetch<BookTags>(
        `/api/books/${encodeURIComponent(slug)}/tags${q}`,
      );
    },
    genreBooks(slug: string) {
      return authFetch<{ books: string[] }>(
        `/api/genres/${encodeURIComponent(slug)}/books`,
      );
    },
    template(input: {
      bookSlug: string;
      tagSlug: string;
      tagType: "genre" | "style" | "signal";
      polarity: 1 | -1;
    }) {
      return authFetch<{ template: NostrEventTemplate }>("/api/tags/template", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    submit(event: SignedEvent) {
      return authFetch<{ ok: true }>("/api/tags", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    submitCustodial(input: {
      bookSlug: string;
      tagSlug: string;
      tagType: "genre" | "style" | "signal";
      polarity: 1 | -1;
    }) {
      return authFetch<{ ok: true }>("/api/tags", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },
  shelves: {
    mine() {
      return authFetch<{ shelves: Shelf[] }>("/api/shelves/mine");
    },
    template(input: ShelfInput) {
      return authFetch<{ template: NostrEventTemplate }>(
        "/api/shelves/template",
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    submit(event: SignedEvent) {
      return authFetch<{ ok: true }>("/api/shelves", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
    submitCustodial(input: ShelfInput) {
      return authFetch<{ ok: true }>("/api/shelves", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },
  // Homepage trust shelves (Story 35 / ADR 0036 §3). Read-only, served from the
  // off-path cache; never computes on the request. Distinct from the user-shelf
  // namespace (`shelves` above).
  homepage: {
    shelves() {
      return authFetch<HomepageShelves>("/api/homepage/shelves");
    },
  },
  // The For-You personalized shelf (Story 36 / ADR 0037). Credentialed (the
  // session cookie is the vantage) — `authFetch` sends `credentials: "include"`.
  foryou() {
    return authFetch<ForYou>("/api/foryou");
  },
};

// Taste Match response (Story 65 / ADR 0064). Discriminated so a thresholdMet
// match always carries its percentage. The web hides the chip on `signedIn:false`
// and `self`.
export type TasteMatchResult =
  | { signedIn: false }
  | { signedIn: true; self: true }
  | { signedIn: true; self: false; thresholdMet: false; commonBooks: number }
  | {
      signedIn: true;
      self: false;
      thresholdMet: true;
      commonBooks: number;
      percentage: number;
    };

// Per-rater taste match for the book-detail bylines (Story 66 / ADR 0065).
export type BylineTasteMatch = {
  commonBooks: number;
  thresholdMet: boolean;
  percentage?: number;
};

// The book-detail taste-matches read, keyed by rater npub. The web hides chips
// + the sort control on `signedIn:false`.
export type TasteMatchesResult =
  | { signedIn: false }
  | { signedIn: true; matches: Record<string, BylineTasteMatch> };
