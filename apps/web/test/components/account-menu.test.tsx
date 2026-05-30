import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccountMenu } from "../../src/components/AccountMenu";
import type { PublicUser } from "../../src/lib/api";

const logoutMock = vi.fn();
const profileGetMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  api: {
    auth: { logout: (...a: unknown[]) => logoutMock(...a) },
    profile: { get: (...a: unknown[]) => profileGetMock(...a) },
  },
}));

const user: PublicUser = {
  id: "u1",
  email: null,
  displayName: "Mira Calloway",
  npub: "npub1abcdefghijklmnop",
};

beforeEach(() => {
  logoutMock.mockReset().mockResolvedValue(undefined);
  profileGetMock.mockReset().mockResolvedValue({ profile: { npub: user.npub } });
});
afterEach(() => vi.clearAllMocks());

function renderMenu(onSignedOut = vi.fn()) {
  render(
    <MemoryRouter>
      <AccountMenu user={user} onSignedOut={onSignedOut} />
    </MemoryRouter>,
  );
  return onSignedOut;
}

describe("AccountMenu", () => {
  it("shows the avatar trigger and opens the dropdown on click", async () => {
    renderMenu();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("signs out: calls logout then onSignedOut", async () => {
    const onSignedOut = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /sign out/i }));
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it("closes on outside click", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});

// Failing tests (red) for Story 19 AC-3 / AC-4 — the account dropdown gains
// "Your profile" and "Your shelves" nav, both above "Sign out". ADR 0019
// Decision 3: "Your profile" → /profile/me, "Your shelves" → /profile/me#shelves,
// each a menuitem that closes the menu on activation. No top-nav link is added.
describe("AccountMenu — profile + shelves nav (AC-3, AC-4)", () => {
  function openMenu() {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    return screen.findByRole("menu");
  }

  it("renders a 'Your profile' menuitem linking to /profile/me", async () => {
    await openMenu();
    const item = screen.getByRole("menuitem", { name: /your profile/i });
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("href", "/profile/me");
  });

  it("renders a 'Your shelves' menuitem deep-linking to the shelves section", async () => {
    await openMenu();
    const item = screen.getByRole("menuitem", { name: /your shelves/i });
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("href", "/profile/me#shelves");
  });

  it("orders the items: Your profile, then Your shelves, then Sign out", async () => {
    await openMenu();
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent ?? "");
    const profileIdx = items.findIndex((t) => /your profile/i.test(t));
    const shelvesIdx = items.findIndex((t) => /your shelves/i.test(t));
    const signoutIdx = items.findIndex((t) => /sign out/i.test(t));
    expect(profileIdx).toBeGreaterThanOrEqual(0);
    expect(shelvesIdx).toBeGreaterThan(profileIdx);
    expect(signoutIdx).toBeGreaterThan(shelvesIdx);
  });

  it("closes the menu when 'Your shelves' is activated", async () => {
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /your shelves/i }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});
