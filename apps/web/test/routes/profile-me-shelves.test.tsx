// Tests for Story 18 AC-8 — the "Your shelves" section on /profile/me. Mirrors
// the ProfileMe render pattern; reads via api.shelves.mine().
//
// MIGRATED for Story 29 / ADR 0030: this file mocks a SOVEREIGN user, so the
// header now shows the middle-truncated shortNpub chip + CopyButton instead of
// the bare full npub. The Story 18 shelf behaviors below are unchanged; a
// header-npub guard is added at the end.
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
const FULL_NPUB = sovereignUser.npub;
const SHORT_NPUB = "npub1n0ewa…rk23"; // shortNpub(FULL_NPUB)

beforeEach(() => {
  submissionsMineMock.mockReset().mockResolvedValue({ submissions: [] });
  shelvesMineMock.mockReset();
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

describe("ProfileMe — Your shelves (AC-8)", () => {
  it("renders each grouped shelf from the live read with a real per-shelf count", async () => {
    shelvesMineMock.mockResolvedValue({
      shelves: [
        {
          slug: "want-to-read",
          name: "Want to Read",
          count: 2,
          books: [
            { slug: "orbital", title: "Orbital", authorName: "Samantha Harvey", format: "reference" },
            { slug: "north-woods", title: "North Woods", authorName: "Daniel Mason", format: "reference" },
          ],
        },
        {
          slug: "read",
          name: "Read",
          count: 1,
          books: [{ slug: "the-bee-sting", title: "The Bee Sting", authorName: "Paul Murray", format: "reference" }],
        },
      ],
    });

    renderMe();
    expect(await screen.findByText("Want to Read")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    // Real counts, not placeholders.
    expect(screen.getByText("2")).toBeInTheDocument();
    await waitFor(() => expect(shelvesMineMock).toHaveBeenCalled());
  });

  it("shows an honest empty state when the user has no shelves", async () => {
    shelvesMineMock.mockResolvedValue({ shelves: [] });
    renderMe();
    expect(
      await screen.findByText(/have not added any books to a shelf/i),
    ).toBeInTheDocument();
    // No fabricated default shelves.
    expect(screen.queryByText("Want to Read")).not.toBeInTheDocument();
  });
});

// MIGRATED (Story 29 / ADR 0030): sovereign header npub treatment.
describe("ProfileMe — sovereign nostr-identity header (Story 29 AC-1/AC-5)", () => {
  it("shows the truncated npub chip, not the bare full npub", async () => {
    shelvesMineMock.mockResolvedValue({ shelves: [] });
    renderMe();
    expect(await screen.findByText(SHORT_NPUB)).toBeInTheDocument();
    expect(screen.queryByText(FULL_NPUB)).not.toBeInTheDocument();
  });
});
