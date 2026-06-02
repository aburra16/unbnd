import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Home } from "../src/routes/Home";
import { BookDetail } from "../src/routes/BookDetail";
import { GenreBrowse } from "../src/routes/GenreBrowse";
import { Browse } from "../src/routes/Browse";
import { About } from "../src/routes/About";
import { CommunitySubmissions } from "../src/routes/CommunitySubmissions";
import { Submit } from "../src/routes/Submit";
import { Profile } from "../src/routes/Profile";
import type {
  BookTags,
  PublicBook,
  RatingsSummary,
  TaxonomyElement,
} from "../src/lib/api";

// The live routes read from the API; mock the client so the smoke tests
// assert the live-data render shape (ADR 0010), not fixtures.
const booksGet = vi.fn();
const booksList = vi.fn();
const booksRecent = vi.fn();
const tagsList = vi.fn();
const tagsBook = vi.fn();
const tagsGenreBooks = vi.fn();
const ratingsList = vi.fn();

vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: { ...actual.api.auth, me: vi.fn().mockRejectedValue(new Error("signed out")) },
      books: {
        get: (...a: unknown[]) => booksGet(...a),
        list: (...a: unknown[]) => booksList(...a),
        recent: (...a: unknown[]) => booksRecent(...a),
      },
      tags: {
        list: (...a: unknown[]) => tagsList(...a),
        book: (...a: unknown[]) => tagsBook(...a),
        genreBooks: (...a: unknown[]) => tagsGenreBooks(...a),
      },
      ratings: { ...actual.api.ratings, list: (...a: unknown[]) => ratingsList(...a) },
      submissions: { ...actual.api.submissions, list: vi.fn().mockResolvedValue({ submissions: [] }) },
      // MIGRATED for Story 31 / ADR 0032: BookDetail wires a claim action via
      // api.claims.* (only invoked when signed-in; the smoke test is signed-out).
      claims: { template: vi.fn(), submit: vi.fn(), submitCustodial: vi.fn() },
      // Story 20: the public profile reads from the API by-npub twins, not the
      // retired Mira fixture. Story 31 adds the by-author "Books by this author"
      // read; mock it empty so the section is absent in the smoke render.
      profile: {
        ...actual.api.profile,
        shelves: vi.fn().mockResolvedValue({ shelves: [] }),
        stats: vi.fn().mockResolvedValue({ stats: {} }),
        claimedBooks: vi.fn().mockResolvedValue({ books: [] }),
      },
    },
  };
});

// Story 20: Profile's identity header comes from useProfileMeta(npub). Stub it so
// the smoke test renders the honest npub-fallback header (no kind-0), never Mira.
vi.mock("../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => null,
  displayNameOf: (_meta: unknown, fallback: string) => fallback,
}));

const ORBITAL: PublicBook = {
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  blurb: "Six astronauts circle the Earth.",
  publishYear: 2023,
  format: "reference",
};
const NO_TAGS: BookTags = { genres: [], styles: [], signals: [] };
const NO_RATINGS: RatingsSummary = { count: 0, average: null, ratings: [] };
const TAXONOMY: TaxonomyElement[] = [
  { slug: "literary-fiction", type: "genre", name: "Literary fiction", sensitivity: "normal" },
];

beforeEach(() => {
  // MIGRATED for Story 31 / ADR 0032 §2a: the book read returns `{ book, claimants }`.
  booksGet.mockReset().mockResolvedValue({ book: ORBITAL, claimants: [] });
  booksList.mockReset().mockResolvedValue({ books: [ORBITAL] });
  booksRecent.mockReset().mockResolvedValue({ books: [ORBITAL] });
  tagsList.mockReset().mockResolvedValue({ tags: TAXONOMY });
  tagsBook.mockReset().mockResolvedValue(NO_TAGS);
  tagsGenreBooks.mockReset().mockResolvedValue({ books: ["orbital"] });
  ratingsList.mockReset().mockResolvedValue(NO_RATINGS);
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
});

describe("Route smoke tests against live data (mocked API)", () => {
  it("renders Home with the hero, recently-added shelf, and genre grid", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Discover books through/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /Recently added/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /Explore genres/i }),
    ).toBeInTheDocument();
  });

  it("renders BookDetail for /book/orbital from the API", async () => {
    render(
      <MemoryRouter initialEntries={["/book/orbital"]}>
        <Routes>
          <Route path="/book/:slug" element={<BookDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Orbital" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Samantha Harvey/)).toBeInTheDocument();
    // RatingsPanel loads ratings asynchronously — await the empty state.
    expect(await screen.findByText(/Be the first to rate it/i)).toBeInTheDocument();
  });

  it("renders GenreBrowse for /genre/literary-fiction with its book grid", async () => {
    render(
      <MemoryRouter initialEntries={["/genre/literary-fiction"]}>
        <Routes>
          <Route path="/genre/:slug" element={<GenreBrowse />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: /Literary fiction/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(booksList).toHaveBeenCalledWith(["orbital"]));
  });

  it("renders an empty genre honestly", async () => {
    tagsGenreBooks.mockResolvedValue({ books: [] });
    render(
      <MemoryRouter initialEntries={["/genre/mystery"]}>
        <Routes>
          <Route path="/genre/:slug" element={<GenreBrowse />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/No books carry this genre yet/i),
    ).toBeInTheDocument();
  });

  it("renders the Browse route with a genre grid", async () => {
    render(
      <MemoryRouter initialEntries={["/browse"]}>
        <Routes>
          <Route path="/browse" element={<Browse />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: /Browse by genre/i }),
    ).toBeInTheDocument();
  });

  it("renders the About route", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Routes>
          <Route path="/about" element={<About />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /About Unbnd/i }),
    ).toBeInTheDocument();
  });

  it("renders the Community submissions route", async () => {
    render(
      <MemoryRouter initialEntries={["/submissions"]}>
        <Routes>
          <Route path="/submissions" element={<CommunitySubmissions />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: /Community submissions/i }),
    ).toBeInTheDocument();
  });

  it("renders the Submit route", () => {
    render(
      <MemoryRouter initialEntries={["/submit"]}>
        <Routes>
          <Route path="/submit" element={<Submit />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /Submit a book to Unbnd/i }),
    ).toBeInTheDocument();
  });

  it("renders the public Profile route for /profile/:npub from live data (no Mira fixture)", async () => {
    const NPUB =
      "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
    render(
      <MemoryRouter initialEntries={[`/profile/${NPUB}`]}>
        <Routes>
          <Route path="/profile/:npub" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
    );
    // Honest npub-fallback header (no kind-0 resolved), never the Mira mock.
    expect(await screen.findByText(NPUB)).toBeInTheDocument();
    expect(screen.queryByText("Mira Calloway")).not.toBeInTheDocument();
  });
});
