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

export type TagConsensus = {
  slug: string;
  name: string;
  type: "genre" | "style" | "signal";
  applies: number;
  disputes: number;
};

export type BookTags = {
  genres: TagConsensus[];
  styles: TagConsensus[];
  signals: TagConsensus[];
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
  },
  books: {
    get(slug: string) {
      return authFetch<{ book: PublicBook }>(
        `/api/books/${encodeURIComponent(slug)}`,
      );
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
  },
  trust: {
    status() {
      return authFetch<{ enabled: boolean; hasScores: boolean; canPersonalize: boolean }>(
        "/api/trust/status",
      );
    },
    challenge() {
      return authFetch<{ challenge: string }>("/api/trust/challenge");
    },
    personalize(event: SignedEvent) {
      return authFetch<{ ok: true; building: boolean }>("/api/trust/personalize", {
        method: "POST",
        body: JSON.stringify({ event }),
      });
    },
  },
  profile: {
    get(idOrNpub: string) {
      return authFetch<{ profile: ProfileMeta }>(
        `/api/profile/${encodeURIComponent(idOrNpub)}`,
      );
    },
    meStats() {
      return authFetch<{ stats: ProfileStatsResponse }>(
        "/api/profile/me/stats",
      );
    },
  },
  tags: {
    list() {
      return authFetch<{ tags: TaxonomyElement[] }>("/api/tags");
    },
    book(slug: string) {
      return authFetch<BookTags>(
        `/api/books/${encodeURIComponent(slug)}/tags`,
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
};
