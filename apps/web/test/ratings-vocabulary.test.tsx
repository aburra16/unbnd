// Story 25 / ADR 0025, AC-6 — MIGRATED to the ADR 0029 controlled contract.
// The RatingsPanel must use the SAME "trusted consensus" / "community consensus"
// vocabulary as the tag block (copy-only; no recompute). Under ADR 0029 the
// panel is CONTROLLED: BookDetail's useBookRatings hook owns the read and passes
// the `house`/`yours`/`status` slices as props (the panel no longer self-fetches
// via api.ratings.list). The vocabulary assertions are preserved verbatim,
// re-expressed against the controlled `house` prop.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RatingsSummary, WeightedRatings } from "../src/lib/api";

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

describe("RatingsPanel — AC-6 shared trusted/community vocabulary", () => {
  it("uses 'trusted consensus' wording when a trust-weighted view exists", async () => {
    const summary: RatingsSummary = {
      count: 5,
      average: 4.2,
      ratings: [],
      weighted: WEIGHTED,
    };
    render(<RatingsPanel slug="orbital" house={summary} yours={null} status="ready" />);
    expect(await screen.findByText(/trusted consensus/i)).toBeInTheDocument();
  });

  it("uses 'community consensus' wording when there is no trust-weighted view", async () => {
    const summary: RatingsSummary = {
      count: 5,
      average: 4.2,
      ratings: [],
      weighted: null,
    };
    render(<RatingsPanel slug="orbital" house={summary} yours={null} status="ready" />);
    expect(await screen.findByText(/community consensus/i)).toBeInTheDocument();
  });
});
