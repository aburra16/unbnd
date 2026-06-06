// Failing tests (red) for Story 23 AC-9 (web side) — the "Following" stat cell on
// the public profile /profile/:npub. ADR 0023 Decision 5: Profile.tsx surfaces
// the new `stats.followingCount` as a stat cell (present-number → cell, absent →
// no cell), exactly like the other present-only stats; a true 0 renders 0.
//
// Mirrors profile-public.test.tsx's mocking. The new FollowButton on the page
// reads useSession + the follow api methods, so they are mocked here too (a
// fixture-fallout note for the Implementer: profile-public.test.tsx will need the
// same additions once FollowButton lands).
//
// The current Profile.tsx statCells helper has no "Following" cell and the
// ProfileStatsResponse type carries no followingCount → red until the rewrite.
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

// FollowButton (rendered by Profile) reads useSession; settle to signed-out.
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

describe("Profile /profile/:npub — Following count cell (AC-9)", () => {
  it("renders a 'Following' stat cell with the target's followingCount", async () => {
    statsMock.mockResolvedValue({ stats: { followingCount: 42 } });
    renderAt(TARGET_NPUB);
    expect(await screen.findByText("Following")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders a present 0 as a 'Following' cell showing 0", async () => {
    statsMock.mockResolvedValue({ stats: { followingCount: 0 } });
    renderAt(TARGET_NPUB);
    expect(await screen.findByText("Following")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders NO 'Following' cell when followingCount is absent (omit-on-throw upstream)", async () => {
    statsMock.mockResolvedValue({ stats: { booksRated: 3 } });
    renderAt(TARGET_NPUB);
    expect(await screen.findByText("Books rated")).toBeInTheDocument();
    expect(screen.queryByText("Following")).not.toBeInTheDocument();
  });
});
