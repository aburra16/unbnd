import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "../../src/components/Nav";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

function renderNav() {
  return render(
    <MemoryRouter>
      <Nav />
    </MemoryRouter>,
  );
}

describe("Nav session-aware rendering", () => {
  it("shows the Sign in button when signed out", () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderNav();
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it("shows the user's initials avatar (not Sign in) when signed in", () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      refresh: vi.fn(),
      user: {
        id: "1",
        email: "mira@example.com",
        displayName: "Mira Calloway",
        npub: "npub1abc",
      },
    });
    renderNav();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    // Avatar shows the initials of the display name.
    expect(screen.getByText("MC")).toBeInTheDocument();
  });
});
