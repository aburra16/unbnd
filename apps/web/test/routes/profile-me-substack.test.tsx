// Failing tests (red) for Story 20 AC-7 (own-profile side) — the "Writes on
// Substack" link on /profile/me. Mirrors profile-me-polish.test.tsx. ADR 0020
// Decision 2: ProfileMe renders the same Substack link as the public Profile when
// the signed-in user's kind-0 carries a substack URL; absent → nothing renders.
// ProfileMe does not render this link yet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileMe } from "../../src/routes/ProfileMe";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const profileMetaMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => profileMetaMock(),
  displayNameOf: (
    meta: { displayName?: string; name?: string } | null,
    fallback: string,
  ) => meta?.displayName ?? meta?.name ?? fallback,
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
  profileMetaMock.mockReset().mockReturnValue(null);
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

describe("ProfileMe — Substack link (AC-7)", () => {
  it("renders a 'Writes on Substack' link to the user's substack URL", async () => {
    profileMetaMock.mockReturnValue({
      npub: sovereignUser.npub,
      name: "Reader",
      substack: "https://reader.substack.com",
    });
    renderMe();
    const link = await screen.findByRole("link", { name: /writes on substack/i });
    expect(link).toHaveAttribute("href", "https://reader.substack.com");
  });

  it("renders no Substack link when the user's kind-0 has no substack field", async () => {
    profileMetaMock.mockReturnValue({ npub: sovereignUser.npub, name: "Reader" });
    renderMe();
    await screen.findByRole("heading", { name: "Reader" });
    expect(
      screen.queryByRole("link", { name: /writes on substack/i }),
    ).not.toBeInTheDocument();
  });
});
