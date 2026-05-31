// FAILING TESTS — Story 25 / ADR 0025, AC-5 (web).
// BookDetail must re-fetch the book's tags with `?observer=<npub>` when the
// House⇄Yours perspective changes, mirroring how RatingsPanel re-requests
// ratings for "Yours". Intentionally red until BookDetail passes the active
// observer from useTrustView into api.tags.book and re-fetches on toggle.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BookTags, PublicBook, RatingsSummary } from "../src/lib/api";

const booksGet = vi.fn();
const tagsBook = vi.fn();
const tagsList = vi.fn();
const ratingsList = vi.fn();

vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: { ...actual.api.auth, me: vi.fn().mockRejectedValue(new Error("signed out")) },
      books: { ...actual.api.books, get: (...a: unknown[]) => booksGet(...a) },
      tags: {
        ...actual.api.tags,
        book: (...a: unknown[]) => tagsBook(...a),
        list: (...a: unknown[]) => tagsList(...a),
      },
      ratings: { ...actual.api.ratings, list: (...a: unknown[]) => ratingsList(...a) },
    },
  };
});

const YOURS_NPUB = "npub1yourstrustedvantage000000000000000000000000000000000000000";

// A sovereign reader with trust scores who has switched to the "Yours" vantage.
vi.mock("../src/hooks/useTrustView", () => ({
  useTrustView: () => ({
    status: "ready" as const,
    view: "yours" as const,
    setView: vi.fn(),
    personalize: vi.fn(),
    error: null,
    npub: YOURS_NPUB,
  }),
}));

const ORBITAL: PublicBook = {
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  format: "reference",
};
const TAGS: BookTags = { genres: [], styles: [], signals: [], weighted: false };
const NO_RATINGS: RatingsSummary = { count: 0, average: null, ratings: [], weighted: null };

import { BookDetail } from "../src/routes/BookDetail";

beforeEach(() => {
  booksGet.mockReset().mockResolvedValue({ book: ORBITAL });
  tagsBook.mockReset().mockResolvedValue(TAGS);
  tagsList.mockReset().mockResolvedValue({ tags: [] });
  ratingsList.mockReset().mockResolvedValue(NO_RATINGS);
});

describe("BookDetail — AC-5 tag read follows the observer (House⇄Yours)", () => {
  it("fetches the book's tags with the active observer npub when the view is 'Yours'", async () => {
    render(
      <MemoryRouter initialEntries={["/book/orbital"]}>
        <Routes>
          <Route path="/book/:slug" element={<BookDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Orbital" })).toBeInTheDocument();
    // The tags read must carry the observer so the consensus is computed from
    // the user's vantage — not a fixed house read.
    await waitFor(() =>
      expect(tagsBook).toHaveBeenCalledWith("orbital", YOURS_NPUB),
    );
  });
});
