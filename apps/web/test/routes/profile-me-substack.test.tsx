// Tests for Story 20 AC-7 (own-profile side) — the "Writes on Substack" link on
// /profile/me. Mirrors profile-me-polish.test.tsx. ADR 0020 Decision 2: ProfileMe
// renders the Substack link when the signed-in user's kind-0 carries a substack
// URL; absent → nothing renders.
//
// MIGRATED for Story 29 / ADR 0030: the Substack link is tier-agnostic and
// unchanged. Added: a custodial render that confirms the Substack link still
// shows while the bare npub is gone and the "Advanced settings" link is
// offered; plus a sovereign header-npub guard.
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
const custodialUser = { ...sovereignUser, id: "u2", email: "reader@example.com" };
const FULL_NPUB = sovereignUser.npub;
const SHORT_NPUB = "npub1n0ewa…rk23"; // shortNpub(FULL_NPUB)

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

  // MIGRATED (Story 29 / ADR 0030): sovereign header npub guard.
  it("shows the truncated npub chip, not the bare full npub (sovereign)", async () => {
    profileMetaMock.mockReturnValue({ npub: sovereignUser.npub, name: "Reader" });
    renderMe();
    expect(await screen.findByText(SHORT_NPUB)).toBeInTheDocument();
    expect(screen.queryByText(FULL_NPUB)).not.toBeInTheDocument();
  });
});

// MIGRATED (Story 29 / ADR 0030): a custodial user keeps the Substack link but
// the header drops the npub entirely and offers the discovery link to Settings.
describe("ProfileMe — Substack link for a custodial user (Story 29 AC-1/AC-5)", () => {
  it("renders the Substack link with no npub and an 'Advanced settings' link", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({
      npub: custodialUser.npub,
      name: "Reader",
      substack: "https://reader.substack.com",
    });
    renderMe();
    const link = await screen.findByRole("link", { name: /writes on substack/i });
    expect(link).toHaveAttribute("href", "https://reader.substack.com");
    expect(screen.queryByText(FULL_NPUB)).not.toBeInTheDocument();
    expect(screen.queryByText(SHORT_NPUB)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /advanced settings/i }),
    ).toHaveAttribute("href", "/settings");
  });
});
