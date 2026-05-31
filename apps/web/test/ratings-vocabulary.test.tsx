// FAILING TESTS — Story 25 / ADR 0025, AC-6.
// The RatingsPanel must use the SAME "trusted consensus" / "community consensus"
// vocabulary as the tag block (copy-only change; no recompute). Intentionally
// red until RatingsPanel's captions/labels adopt that wording.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { RatingsSummary, WeightedRatings } from "../src/lib/api";

const ratingsList = vi.fn();

vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      ratings: { ...actual.api.ratings, list: (...a: unknown[]) => ratingsList(...a) },
    },
  };
});

// House-only vantage: the panel shows the house view with no Yours toggle.
vi.mock("../src/hooks/useTrustView", () => ({
  useTrustView: () => ({
    status: "house-only" as const,
    view: "house" as const,
    setView: vi.fn(),
    personalize: vi.fn(),
    error: null,
    npub: undefined,
  }),
}));

import { RatingsPanel } from "../src/components/RatingsPanel";

const WEIGHTED: WeightedRatings = {
  observer: "npub1xxxx",
  average: 4.6,
  trustedCount: 3,
  ratings: [],
};

beforeEach(() => ratingsList.mockReset());

describe("RatingsPanel — AC-6 shared trusted/community vocabulary", () => {
  it("uses 'trusted consensus' wording when a trust-weighted view exists", async () => {
    const summary: RatingsSummary = {
      count: 5,
      average: 4.2,
      ratings: [],
      weighted: WEIGHTED,
    };
    ratingsList.mockResolvedValue(summary);
    render(<RatingsPanel slug="orbital" />);
    expect(await screen.findByText(/trusted consensus/i)).toBeInTheDocument();
  });

  it("uses 'community consensus' wording when there is no trust-weighted view", async () => {
    const summary: RatingsSummary = {
      count: 5,
      average: 4.2,
      ratings: [],
      weighted: null,
    };
    ratingsList.mockResolvedValue(summary);
    render(<RatingsPanel slug="orbital" />);
    await waitFor(() => expect(ratingsList).toHaveBeenCalled());
    expect(await screen.findByText(/community consensus/i)).toBeInTheDocument();
  });
});
