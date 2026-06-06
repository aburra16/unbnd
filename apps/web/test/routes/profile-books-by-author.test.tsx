// Failing tests (red) for Story 31 / ADR 0032 §4 — the "Books by this author"
// profile section, on BOTH the public profile (/profile/:npub via Profile) and
// the own profile (/profile/me via ProfileMe). Fed by api.profile.claimedBooks,
// rendered as a BookGrid of claimed catalog books linking to each detail page;
// ABSENT when empty (no placeholder). Read by the PATH/own npub, never the viewer
// session.
//
// Boundary mocks only (api / useSession / useProfileMeta). Role-scoped queries.
// Red until Profile/ProfileMe render the section + api.profile.claimedBooks exists.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const TARGET_NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";

const profileMetaMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (...a: unknown[]) => profileMetaMock(...a),
  displayNameOf: (meta: { displayName?: string; name?: string } | null, fallback: string) =>
    meta?.displayName ?? meta?.name ?? fallback,
}));

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

// api: all the profile reads the routes touch, plus the new claimedBooks.
const shelvesMock = vi.fn();
const statsMock = vi.fn();
const followStatusMock = vi.fn();
const claimedBooksMock = vi.fn();
const meStatsMock = vi.fn();
const shelvesMineMock = vi.fn();
const submissionsMineMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    auth: { me: vi.fn().mockRejectedValue(new Error("signed out")) },
    profile: {
      get: (...a: unknown[]) => Promise.resolve({ profile: { npub: a[0] } }),
      shelves: (...a: unknown[]) => shelvesMock(...a),
      stats: (...a: unknown[]) => statsMock(...a),
      followStatus: (...a: unknown[]) => followStatusMock(...a),
      claimedBooks: (...a: unknown[]) => claimedBooksMock(...a),
      meStats: (...a: unknown[]) => meStatsMock(...a),
      // Story 67 / ADR 0066: the CuratorBadge resolves curator status on mount.
      curatorStatus: vi.fn().mockResolvedValue({ isCurator: false }),
    },
    shelves: { mine: (...a: unknown[]) => shelvesMineMock(...a) },
    submissions: { mine: (...a: unknown[]) => submissionsMineMock(...a) },
  },
}));

import { Profile } from "../../src/routes/Profile";
import { ProfileMe } from "../../src/routes/ProfileMe";

const claimedBooks = {
  books: [
    { slug: "ol-a", title: "Orbital", authorName: "Samantha Harvey", format: "reference", coverUrl: "https://covers/a.jpg" },
    { slug: "ol-b", title: "North Woods", authorName: "Daniel Mason", format: "reference" },
  ],
};

beforeEach(() => {
  profileMetaMock.mockReset().mockReturnValue({ npub: TARGET_NPUB, name: "Author" });
  shelvesMock.mockReset().mockResolvedValue({ shelves: [] });
  statsMock.mockReset().mockResolvedValue({ stats: {} });
  followStatusMock.mockReset().mockResolvedValue({ following: false });
  claimedBooksMock.mockReset().mockResolvedValue({ books: [] });
  meStatsMock.mockReset().mockResolvedValue({ stats: {} });
  shelvesMineMock.mockReset().mockResolvedValue({ shelves: [] });
  submissionsMineMock.mockReset().mockResolvedValue({ submissions: [] });
  sessionMock.mockReset().mockReturnValue({ status: "signed-out", refresh: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

function renderPublic(npub: string) {
  return render(
    <MemoryRouter initialEntries={[`/profile/${npub}`]}>
      <Routes>
        <Route path="/profile/:npub" element={<Profile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Profile /profile/:npub — Books by this author (AC-6)", () => {
  it("renders the claimed books for the PATH npub, linking to each detail page", async () => {
    claimedBooksMock.mockResolvedValue(claimedBooks);
    renderPublic(TARGET_NPUB);
    expect(await screen.findByRole("heading", { name: /books by this author/i })).toBeInTheDocument();
    const orbital = await screen.findByText("Orbital");
    expect(orbital.closest("a")).toHaveAttribute("href", "/book/ol-a");
    expect(screen.getByText("North Woods", { selector: ".book-title" })).toBeInTheDocument();
  });

  it("reads claimedBooks for the path npub, not the viewer session", async () => {
    claimedBooksMock.mockResolvedValue(claimedBooks);
    renderPublic(TARGET_NPUB);
    await waitFor(() => expect(claimedBooksMock).toHaveBeenCalledWith(TARGET_NPUB));
  });

  it("renders NO section (no placeholder) when the author has claimed nothing", async () => {
    claimedBooksMock.mockResolvedValue({ books: [] });
    renderPublic(TARGET_NPUB);
    await screen.findByRole("heading", { name: "Author" });
    expect(screen.queryByRole("heading", { name: /books by this author/i })).not.toBeInTheDocument();
  });
});

describe("ProfileMe /profile/me — Books by this author (AC-6)", () => {
  const ownUser = {
    id: "u1", email: null, displayName: "Author",
    npub: TARGET_NPUB,
  };

  it("renders the signed-in user's own claimed books", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: ownUser, refresh: vi.fn() });
    claimedBooksMock.mockResolvedValue(claimedBooks);
    render(
      <MemoryRouter>
        <ProfileMe />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: /books by this author/i })).toBeInTheDocument();
    expect(await screen.findByText("Orbital")).toBeInTheDocument();
  });

  it("reads the own npub for claimedBooks (not someone else's)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: ownUser, refresh: vi.fn() });
    claimedBooksMock.mockResolvedValue(claimedBooks);
    render(
      <MemoryRouter>
        <ProfileMe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(claimedBooksMock).toHaveBeenCalledWith(TARGET_NPUB));
  });

  it("renders no section when the user has claimed nothing", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: ownUser, refresh: vi.fn() });
    claimedBooksMock.mockResolvedValue({ books: [] });
    render(
      <MemoryRouter>
        <ProfileMe />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Author" });
    expect(screen.queryByRole("heading", { name: /books by this author/i })).not.toBeInTheDocument();
  });
});
