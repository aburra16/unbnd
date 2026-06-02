// MIGRATED — Story 25 / ADR 0025 AC-5 (web), now under ADR 0029's controlled wiring.
//
// Intent preserved: BookDetail re-fetches the book's tags with `?observer=<npub>`
// when the House⇄Yours perspective is "Yours", so the tag consensus is computed
// from the user's own vantage (mirroring how the ratings read follows the
// observer). That POV/observer wiring is unchanged by ADR 0029.
//
// What ADR 0029 changes here: the ratings read is no longer two sibling
// components each calling `api.ratings.list` (RatingsPanel + RatingControl).
// BookDetail now calls the shared `useBookRatings(slug)` hook ONCE and passes
// slices down (house/yours/status → RatingsPanel; yourRating/applyWrite →
// RatingControl). So this test mocks `useBookRatings` (the new owner) instead of
// `api.ratings.list`, and still asserts the tag read carries the active observer.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BookTags, PublicBook } from "../src/lib/api";

const booksGet = vi.fn();
const tagsBook = vi.fn();
const tagsList = vi.fn();

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
      // MIGRATED for Story 31 / ADR 0032: BookDetail wires a claim action via
      // api.claims.*; keep the methods on the mocked api so the import resolves.
      // This test settles signed-out (auth.me rejects), so no claim is invoked.
      claims: {
        template: vi.fn(),
        submit: vi.fn(),
        submitCustodial: vi.fn(),
      },
    },
  };
});

// MIGRATED for Story 31: BookDetail renders <AuthorBadge>, which resolves names
// via useProfileMeta. Stub it so the badge can render with no claimants (the
// trust-view assertions below are unchanged).
vi.mock("../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => null,
  displayNameOf: (_meta: unknown, fallback: string) => fallback,
}));

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

// ADR 0029: BookDetail owns the rating read through `useBookRatings(slug)` and
// passes the slices to the (now controlled) RatingsPanel/RatingControl. We mock
// the hook so the render is driven by its props, not by sibling self-fetches.
const useBookRatingsMock = vi.fn();
vi.mock("../src/hooks/useBookRatings", () => ({
  useBookRatings: (...a: unknown[]) => useBookRatingsMock(...a),
}));

const ORBITAL: PublicBook = {
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  format: "reference",
};
const TAGS: BookTags = { genres: [], styles: [], signals: [], weighted: false };

import { BookDetail } from "../src/routes/BookDetail";

beforeEach(() => {
  // MIGRATED for Story 31 / ADR 0032 §2a + Story 32 / ADR 0033 §5: the book read
  // returns `{ book, claimants, authorProvided }`. Typed to the new shape so a
  // dropped field fails. This test settles signed-out, so no verified author edit
  // surface mounts; authorProvided is empty (no overlay applied).
  booksGet.mockReset().mockResolvedValue({ book: ORBITAL, claimants: [], authorProvided: [] });
  tagsBook.mockReset().mockResolvedValue(TAGS);
  tagsList.mockReset().mockResolvedValue({ tags: [] });
  useBookRatingsMock.mockReset().mockReturnValue({
    house: { count: 0, average: null, ratings: [], weighted: null },
    yours: null,
    yourRating: null,
    status: "ready",
    applyWrite: vi.fn(),
    reload: vi.fn(),
  });
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

  it("drives the book page from the single useBookRatings owner (one read, not sibling self-fetches)", async () => {
    render(
      <MemoryRouter initialEntries={["/book/orbital"]}>
        <Routes>
          <Route path="/book/:slug" element={<BookDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Orbital" });
    // BookDetail calls the shared owner once with the slug; the panel/control no
    // longer race on api.ratings.list.
    await waitFor(() => expect(useBookRatingsMock).toHaveBeenCalledWith("orbital"));
  });
});
