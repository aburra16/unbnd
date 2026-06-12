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

describe("the How it works door (Story 93 / ADR 0084)", () => {
  it("links to /guide signed out, after Browse", () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() } as never);
    renderNav();
    const link = screen.getByRole("link", { name: "How it works" });
    expect(link).toHaveAttribute("href", "/guide");
    const labels = screen
      .getAllByRole("link")
      .map((a) => a.textContent)
      .filter((t) => t === "Browse" || t === "How it works");
    expect(labels).toEqual(["Browse", "How it works"]);
  });

  it("stays visible signed in", () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: { npub: "npub1me", displayName: "Maria Curator" },
      refresh: vi.fn(),
    } as never);
    renderNav();
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/guide");
  });
});
