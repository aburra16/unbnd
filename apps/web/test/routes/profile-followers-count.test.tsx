// Story 74 / ADR 0072 (web) — the followers count on /profile/:npub. The trust-
// anchored count (NIP-85 kind:30382) arrives as `stats.followersCount`. Present
// > 0 → a "Followers" stat cell; absent OR 0 → an honest "No followers yet."
// Mirrors profile-following-count.test.tsx's mocking.
//
// RED until Profile.tsx renders the followers count + the empty state, and the
// ProfileStatsResponse type carries followersCount.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Profile } from "../../src/routes/Profile";

const TARGET_NPUB =
  "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";

const profileMetaMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (...a: unknown[]) => profileMetaMock(...a),
  displayNameOf: (meta: { displayName?: string; name?: string } | null, fallback: string) =>
    meta?.displayName ?? meta?.name ?? fallback,
}));

vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => ({ status: "signed-out", refresh: vi.fn() }),
}));

const shelvesMock = vi.fn();
const statsMock = vi.fn();
const followStatusMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    auth: { me: vi.fn().mockRejectedValue(new Error("signed out")) },
    profile: {
      get: (...a: unknown[]) => Promise.resolve({ profile: { npub: a[0] } }),
      shelves: (...a: unknown[]) => shelvesMock(...a),
      stats: (...a: unknown[]) => statsMock(...a),
      followStatus: (...a: unknown[]) => followStatusMock(...a),
      claimedBooks: vi.fn().mockResolvedValue({ books: [] }),
      curatorStatus: vi.fn().mockResolvedValue({ isCurator: false }),
    },
  },
}));

beforeEach(() => {
  profileMetaMock.mockReset().mockReturnValue({ npub: TARGET_NPUB, name: "Reader" });
  shelvesMock.mockReset().mockResolvedValue({ shelves: [] });
  statsMock.mockReset().mockResolvedValue({ stats: {} });
  followStatusMock.mockReset().mockResolvedValue({ following: false });
});
afterEach(() => vi.clearAllMocks());

function renderAt(npub: string) {
  return render(
    <MemoryRouter initialEntries={[`/profile/${npub}`]}>
      <Routes>
        <Route path="/profile/:npub" element={<Profile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Profile /profile/:npub — Followers count (Story 74)", () => {
  it("renders a 'Followers' cell with the trust-anchored followersCount", async () => {
    statsMock.mockResolvedValue({ stats: { followersCount: 128 } });
    renderAt(TARGET_NPUB);
    expect(await screen.findByText("Followers")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.queryByText(/no followers yet/i)).not.toBeInTheDocument();
  });

  it("shows 'No followers yet.' when followersCount is absent (honest-empty)", async () => {
    statsMock.mockResolvedValue({ stats: { booksRated: 3 } });
    renderAt(TARGET_NPUB);
    expect(await screen.findByText(/no followers yet\./i)).toBeInTheDocument();
    expect(screen.queryByText("Followers")).not.toBeInTheDocument();
  });

  it("shows 'No followers yet.' on a 0 datum (never a fabricated 0 cell)", async () => {
    statsMock.mockResolvedValue({ stats: { followersCount: 0 } });
    renderAt(TARGET_NPUB);
    expect(await screen.findByText(/no followers yet\./i)).toBeInTheDocument();
    expect(screen.queryByText("Followers")).not.toBeInTheDocument();
  });
});
