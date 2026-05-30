// Failing tests (red) for Story 18 AC-8 — the "Your shelves" section on
// /profile/me. Mirrors the ProfileMe render pattern. Targets the shelves read
// wired into apps/web/src/routes/ProfileMe.tsx via api.shelves.mine(), which
// does not exist yet.
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
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: { mine: (...a: unknown[]) => submissionsMineMock(...a) },
    shelves: { mine: (...a: unknown[]) => shelvesMineMock(...a) },
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
  shelvesMineMock.mockReset();
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
            { bookSlug: "orbital", bookAtag: "x" },
            { bookSlug: "north-woods", bookAtag: "y" },
          ],
        },
        {
          slug: "read",
          name: "Read",
          count: 1,
          books: [{ bookSlug: "the-bee-sting", bookAtag: "z" }],
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
