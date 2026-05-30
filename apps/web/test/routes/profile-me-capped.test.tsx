// Failing tests (red) for Story 21 AC-6 (web wiring) — the capped array flows from
// the stats response through statCells into an honest "N+" cell on /profile/me.
// Mirrors profile-me-polish.test.tsx. Targets the additive `capped?: string[]` on
// ProfileStatsResponse (api.ts) and the statCells mapping that sets a cell's
// `capped` from `stats.capped?.includes(key)` (ProfileMe.tsx). Neither exists yet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileMe } from "../../src/routes/ProfileMe";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => null,
  displayNameOf: (_meta: unknown, fallback: string) => fallback,
}));

const submissionsMineMock = vi.fn();
const shelvesMineMock = vi.fn();
const meStatsMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: { mine: (...a: unknown[]) => submissionsMineMock(...a) },
    shelves: { mine: (...a: unknown[]) => shelvesMineMock(...a) },
    profile: { meStats: (...a: unknown[]) => meStatsMock(...a) },
  },
}));

const sovereignUser = {
  id: "u1",
  email: null,
  displayName: "Reader",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
};

beforeEach(() => {
  submissionsMineMock.mockReset().mockResolvedValue({ submissions: [] });
  shelvesMineMock.mockReset().mockResolvedValue({ shelves: [] });
  meStatsMock.mockReset().mockResolvedValue({ stats: {} });
  sessionMock.mockReset().mockReturnValue({
    status: "signed-in",
    user: sovereignUser,
    refresh: vi.fn(),
  });
});
afterEach(() => vi.clearAllMocks());

function renderMe() {
  return render(
    <MemoryRouter>
      <ProfileMe />
    </MemoryRouter>,
  );
}

describe("ProfileMe — capped stat renders an honest N+ (AC-6)", () => {
  it("renders a capped stat key as the floored value with a trailing +", async () => {
    meStatsMock.mockResolvedValue({
      stats: { booksRated: 12, reviews: 5, tagsApplied: 10000, capped: ["tagsApplied"] },
    });
    renderMe();
    await waitFor(() => expect(meStatsMock).toHaveBeenCalled());
    expect(await screen.findByText("10,000+")).toBeInTheDocument();
    // The un-capped stats stay plain numerals.
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText("12+")).not.toBeInTheDocument();
  });

  it("renders all stats plain when capped is absent", async () => {
    meStatsMock.mockResolvedValue({ stats: { booksRated: 12, reviews: 5, tagsApplied: 31 } });
    renderMe();
    await waitFor(() => expect(meStatsMock).toHaveBeenCalled());
    expect(await screen.findByText("31")).toBeInTheDocument();
    expect(screen.queryByText("31+")).not.toBeInTheDocument();
  });
});
