// Failing tests (red) for Story 66 / ADR 0065 — taste match on book detail:
// the per-byline chip (RatedByRow), the Most-trusted / Best-taste-match sort
// control (RatingsPanel), and the pure reorder (sortRatingsByTasteMatch). All
// three are stubs today → the feature assertions fail red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PublicRating, RatingsSummary } from "../../src/lib/api";
import { sortRatingsByTasteMatch } from "../../src/lib/view-model";
import { RatedByRow } from "../../src/components/RatedByRow";
import { RatingsPanel } from "../../src/components/RatingsPanel";

// RaterBadge / reviewer bylines self-fetch kind-0; stub the hook so no network.
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => undefined,
  displayNameOf: (_m: unknown, fallback: string) => fallback,
}));
// RatingsPanel chrome is driven by useTrustView; api kept stubbed for parity.
const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));
vi.mock("../../src/lib/api", () => ({
  api: { ratings: { list: vi.fn() } },
}));

const rating = (npub: string, score = 5): PublicRating => ({
  npub,
  score,
  reviewText: undefined,
  reviewDate: "2026-01-01",
});

// ── AC-2 / AC-3: pure reorder ──────────────────────────────────────────────
describe("sortRatingsByTasteMatch", () => {
  it("orders matched raters by percentage desc, then unmatched in original order", () => {
    const a = rating("npubA");
    const b = rating("npubB");
    const c = rating("npubC");
    const matches = {
      npubA: { thresholdMet: true, percentage: 60, commonBooks: 5 },
      npubB: { thresholdMet: true, percentage: 90, commonBooks: 5 },
      npubC: { thresholdMet: false, commonBooks: 2 },
    };
    expect(sortRatingsByTasteMatch([a, b, c], matches).map((r) => r.npub)).toEqual([
      "npubB",
      "npubA",
      "npubC",
    ]);
  });
});

// ── AC-1 / AC-4: byline chip on book detail ────────────────────────────────
describe("RatedByRow — taste-match byline chip", () => {
  function renderExpanded(ratings: PublicRating[], tasteMatches: Record<string, unknown>) {
    render(
      <MemoryRouter>
        <RatedByRow ratings={ratings} tasteMatches={tasteMatches as never} />
      </MemoryRouter>,
    );
    // Expand to the per-rater grid (the collapsed pile is avatars only).
    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
  }

  it("shows a match chip only on raters whose match clears the threshold", async () => {
    const list = Array.from({ length: 6 }, (_, i) => rating(`npub${i}`));
    const matches = {
      npub0: { thresholdMet: true, percentage: 90, commonBooks: 5 },
      npub1: { thresholdMet: false, commonBooks: 2 }, // below threshold → no chip
    };
    renderExpanded(list, matches);
    expect(await screen.findByText(/90% match/i)).toBeInTheDocument();
    // Exactly one byline shows a match (npub0); the below-threshold one does not.
    expect(screen.getAllByText(/% match/i)).toHaveLength(1);
  });
});

// ── AC-2 / AC-3 / AC-5: the sort control ───────────────────────────────────
describe("RatingsPanel — taste-match sort control", () => {
  const houseRatings: RatingsSummary = {
    count: 1,
    average: 5,
    ratings: [rating("npubX")],
    weighted: null,
  };
  const trust = (over: Record<string, unknown> = {}) => ({
    status: "house-only",
    view: "house",
    setView: vi.fn(),
    personalize: vi.fn(),
    error: null,
    npub: undefined,
    ...over,
  });

  beforeEach(() => trustMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  function renderPanel(extra: Record<string, unknown>) {
    return render(
      <MemoryRouter>
        <RatingsPanel slug="b1" house={houseRatings} yours={null} status="ready" {...extra} />
      </MemoryRouter>,
    );
  }

  it("shows the Best-taste-match sort control when signed in (tasteMatches present)", async () => {
    trustMock.mockReturnValue(trust());
    renderPanel({ tasteMatches: {}, sortBy: "trusted", onSortChange: vi.fn() });
    expect(await screen.findByRole("button", { name: /best taste match/i })).toBeInTheDocument();
  });

  it("does not show the sort control when signed out (no tasteMatches)", () => {
    trustMock.mockReturnValue(trust());
    renderPanel({});
    expect(screen.queryByRole("button", { name: /best taste match/i })).not.toBeInTheDocument();
  });

  it("clicking Best taste match calls onSortChange('match')", async () => {
    const onSortChange = vi.fn();
    trustMock.mockReturnValue(trust());
    renderPanel({ tasteMatches: {}, sortBy: "trusted", onSortChange });
    fireEvent.click(await screen.findByRole("button", { name: /best taste match/i }));
    expect(onSortChange).toHaveBeenCalledWith("match");
  });
});
