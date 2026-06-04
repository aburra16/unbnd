// Typed fixtures + route map for the visual-regression harness (ADR 0039).
//
// Every object here is typed against the response types exported from
// `src/lib/api.ts`, so an API shape change surfaces as a typecheck error in
// this file rather than a silent drift. The `mockApi` helper installs two
// `page.route` handlers (one for /auth/**, one for /api/**) that fulfill the
// app's fetch fan-out from these fixtures before the first navigation. A
// catch-all default keeps any unanticipated request failing closed to a known
// state instead of hanging or hitting a real network.
//
// All fixture books omit `coverUrl` so the deterministic token-gradient cover
// placeholder renders. No external covers.openlibrary.org image loads.
import type { Page, Route } from "@playwright/test";
import type {
  BookTags,
  ForYou,
  HomepageShelves,
  ProfileMeta,
  ProfileStatsResponse,
  PublicBook,
  PublicUser,
  RatingsSummary,
  SearchResult,
  Shelf,
} from "../../../src/lib/api";

// Canonical fixture identifiers (ADR 0039 "Canonical fixtures"). These are
// fixture constants, never real catalog data, so they never drift with the
// live catalog.
export const FIXTURE_SLUG = "the-fixture-novel";
// A valid-bech32 npub for the all-zero pubkey: recognizably a fixture, never a
// real user (ADR 0039 fixes one valid npub constant). The ADR's illustrative
// value had a bad checksum; this is the corrected canonical constant.
export const FIXTURE_NPUB =
  "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme";
export const FIXTURE_QUERY = "fixture";

// A second fixture npub for a rating author, distinct from the profile subject.
const FIXTURE_RATER_NPUB =
  "npub1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs8j9gdm";

// --- Catalog books (cover-less) ---------------------------------------------

function book(slug: string, title: string, authorName: string): PublicBook {
  return {
    slug,
    title,
    authorName,
    blurb:
      "A fixed fixture blurb for the visual baseline. It carries enough text " +
      "to exercise the blurb block without depending on live catalog data.",
    publishYear: 2021,
    pageCount: 320,
    language: "en",
    format: "print",
  };
}

const HOME_BOOKS: PublicBook[] = [
  book("the-fixture-novel", "The Fixture Novel", "A. Fixture"),
  book("second-fixture", "Second Fixture", "B. Sample"),
  book("third-fixture", "Third Fixture", "C. Canon"),
  book("fourth-fixture", "Fourth Fixture", "D. Stable"),
  book("fifth-fixture", "Fifth Fixture", "E. Constant"),
  book("sixth-fixture", "Sixth Fixture", "F. Frozen"),
];

// The book-detail fixture carries a multi-paragraph blurb long enough to
// overflow the 4-line clamp at the 1280x800 capture viewport, so book-detail.png
// captures the collapsed-clamped state WITH the Read more control, and an
// openLibraryId so the Source: Open Library link renders in the baseline (ADR
// 0052 §6). Only this detail fixture book carries the long blurb + id, so
// book-detail.png is the sole intended baseline diff; the HOME_BOOKS stay short.
const THE_BOOK: PublicBook = {
  ...book(FIXTURE_SLUG, "The Fixture Novel", "A. Fixture"),
  blurb:
    "A sweeping novel of a coastal town across three generations, where the " +
    "lighthouse keeper's family weathers storms, fortunes, and the slow turning " +
    "of the tide. The prose is patient and the cast is wide, carrying the reader " +
    "from the herring boom to the quiet years after the cannery closed and the " +
    "young people left for the cities inland.\n\n" +
    "The middle chapters follow a daughter who stays behind, mending nets by " +
    "lamplight and keeping the light burning through a winter of wrecks. Her " +
    "letters to a brother who never writes back form the book's quiet spine, and " +
    "the town itself becomes a character: its harbour, its chapel, its long " +
    "memory of every ship that failed to round the point.",
  openLibraryId: "OL45804W",
};

// --- Endpoint bodies (each typed against lib/api.ts) ------------------------

const BOOKS_RECENT: { books: PublicBook[] } = { books: HOME_BOOKS };

const TAGS_LIST: {
  tags: { slug: string; type: "genre" | "style" | "signal"; name: string; sensitivity: "normal" | "accusatory" }[];
} = {
  tags: [
    { slug: "literary-fiction", type: "genre", name: "Literary fiction", sensitivity: "normal" },
    { slug: "science-fiction", type: "genre", name: "Science fiction", sensitivity: "normal" },
    { slug: "mystery", type: "genre", name: "Mystery", sensitivity: "normal" },
    { slug: "history", type: "genre", name: "History", sensitivity: "normal" },
  ],
};

const HOMEPAGE_SHELVES: HomepageShelves = {
  computedAt: "2026-06-03T00:00:00.000Z",
  trending: { books: HOME_BOOKS.slice(0, 4) },
  favorites: { books: HOME_BOOKS.slice(1, 5) },
  genres: [
    { slug: "literary-fiction", name: "Literary fiction", books: HOME_BOOKS.slice(0, 3) },
  ],
};

const FORYOU: ForYou = { state: "anonymous", books: [] };

const TRUST_STATUS = {
  enabled: false,
  hasScores: false,
  canPersonalize: false,
};

const BOOK_GET: {
  book: PublicBook;
  claimants: never[];
  authorProvided: never[];
} = {
  book: THE_BOOK,
  claimants: [],
  authorProvided: [],
};

const BOOK_TAGS: BookTags = {
  genres: [
    { slug: "literary-fiction", name: "Literary fiction", type: "genre", applies: 7, disputes: 0, trusted: false },
    { slug: "science-fiction", name: "Science fiction", type: "genre", applies: 3, disputes: 0, trusted: false },
  ],
  styles: [
    { slug: "lyrical", name: "Lyrical", type: "style", applies: 4, disputes: 0, trusted: false },
  ],
  signals: [],
  weighted: false,
};

const BOOK_RATINGS: RatingsSummary = {
  count: 3,
  average: 4.3,
  ratings: [
    { npub: FIXTURE_RATER_NPUB, score: 5, reviewText: "A fixed fixture review for the baseline.", reviewDate: "2026-01-10" },
    { npub: FIXTURE_RATER_NPUB, score: 4, reviewDate: "2026-01-12" },
    { npub: FIXTURE_RATER_NPUB, score: 4, reviewDate: "2026-01-15" },
  ],
  weighted: null,
  yourRating: null,
};

const PROFILE_META: { profile: ProfileMeta } = {
  profile: {
    npub: FIXTURE_NPUB,
    displayName: "Fixture Curator",
    about: "A fixed fixture profile for the visual baseline.",
  },
};

const PROFILE_SHELVES: { shelves: Shelf[] } = {
  shelves: [
    { slug: "read", name: "Read", count: 3, books: HOME_BOOKS.slice(0, 3) },
    { slug: "want-to-read", name: "Want to read", count: 2, books: HOME_BOOKS.slice(3, 5) },
  ],
};

const PROFILE_STATS: { stats: ProfileStatsResponse } = {
  stats: { booksRated: 12, reviews: 5, tagsApplied: 20, followingCount: 8 },
};

const PROFILE_CLAIMED: { books: PublicBook[] } = { books: [] };

const FOLLOW_STATUS = { following: false };

const SEARCH_RESULT: SearchResult = {
  hits: HOME_BOOKS.slice(0, 4).map((b) => ({
    slug: b.slug,
    title: b.title,
    authorName: b.authorName,
    blurb: b.blurb,
    publishYear: b.publishYear,
    format: b.format,
  })),
  total: 4,
  offset: 0,
  limit: 24,
};

// --- Auth fixtures -----------------------------------------------------------

const SIGNED_IN_USER: PublicUser = {
  id: "fixture-user",
  email: null,
  displayName: "Fixture Curator",
  npub: FIXTURE_NPUB,
};

type AuthState = "signed-out" | "signed-in";

// --- Route map ---------------------------------------------------------------
//
// Ordered list of matchers against the request URL pathname (+ query for
// search). The first match wins; unmatched /api/* paths fall through to the
// documented empty-but-valid default below.
type Matcher = {
  test: (url: URL) => boolean;
  body: unknown;
};

const API_ROUTES: Matcher[] = [
  { test: (u) => u.pathname === "/api/tags", body: TAGS_LIST },
  { test: (u) => u.pathname === "/api/homepage/shelves", body: HOMEPAGE_SHELVES },
  { test: (u) => u.pathname === "/api/foryou", body: FORYOU },
  { test: (u) => u.pathname === "/api/trust/status", body: TRUST_STATUS },
  { test: (u) => u.pathname === "/api/search", body: SEARCH_RESULT },
  { test: (u) => u.pathname === `/api/books/${FIXTURE_SLUG}/tags`, body: BOOK_TAGS },
  { test: (u) => u.pathname === `/api/books/${FIXTURE_SLUG}/ratings`, body: BOOK_RATINGS },
  { test: (u) => u.pathname === `/api/books/${FIXTURE_SLUG}`, body: BOOK_GET },
  { test: (u) => u.pathname.startsWith("/api/profile/follows/"), body: FOLLOW_STATUS },
  { test: (u) => /\/shelves$/.test(u.pathname) && u.pathname.startsWith("/api/profile/"), body: PROFILE_SHELVES },
  { test: (u) => /\/stats$/.test(u.pathname) && u.pathname.startsWith("/api/profile/"), body: PROFILE_STATS },
  { test: (u) => /\/claimed-books$/.test(u.pathname) && u.pathname.startsWith("/api/profile/"), body: PROFILE_CLAIMED },
  // The bare /api/books?limit=… recent list (no trailing path segment).
  { test: (u) => u.pathname === "/api/books", body: BOOKS_RECENT },
  // /api/profile/:npub (single segment after /api/profile/, no sub-resource).
  {
    test: (u) =>
      /^\/api\/profile\/[^/]+$/.test(u.pathname) &&
      !u.pathname.startsWith("/api/profile/follows/"),
    body: PROFILE_META,
  },
];

// Documented empty-but-valid default for any unmapped /api/* path. An empty
// object is a valid shape for the optional-everything responses the app reads;
// a missing fixture surfaces as the content-sentinel assertion failing loudly,
// never a silent live-network call.
const API_DEFAULT = {};

function jsonFulfill(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export type MockApiOptions = { auth: AuthState };

/**
 * Install the route-mock for one page. Call before `page.goto`.
 *
 * - /auth/** : /auth/me resolves the session (signed-out 401-shaped body by
 *   default so `useSession` resolves to "signed-out"); any other /auth/* path
 *   returns an empty-valid 200.
 * - /api/**  : matched against the route map; unmapped paths return the
 *   documented empty-valid default.
 */
export async function mockApi(page: Page, opts: MockApiOptions): Promise<void> {
  await page.route("**/auth/**", (route) => {
    // `/auth/welcome` (and other client routes) are SPA navigations that share
    // the /auth path prefix. Only intercept the app's data fetches; let the
    // document/asset navigation through so index.html serves the SPA.
    if (route.request().resourceType() === "document") {
      return route.continue();
    }
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/me") {
      if (opts.auth === "signed-in") {
        return jsonFulfill(route, { user: SIGNED_IN_USER });
      }
      // Signed-out: a 401 with an error body, the shape `useSession` treats as
      // "not signed in" (it catches the thrown ApiError and resolves signed-out).
      return jsonFulfill(
        route,
        { error: { code: "unauthorized", message: "Not signed in." } },
        401,
      );
    }
    return jsonFulfill(route, {});
  });

  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const match = API_ROUTES.find((m) => m.test(url));
    return jsonFulfill(route, match ? match.body : API_DEFAULT);
  });
}
