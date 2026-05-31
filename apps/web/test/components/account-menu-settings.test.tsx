// Failing tests (red) for Story 22 AC-1 — the account dropdown gains a
// "Settings" item. ADR 0022 Decision 4 / Implementation notes: a
// `<Link className="acct-item" to="/settings">Settings</Link>` is added to the
// AccountMenu, between "Your shelves" and "Sign out". No such item exists yet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

function openMenu() {
  render(
    <MemoryRouter>
      <AccountMenu user={user} onSignedOut={vi.fn()} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
  return screen.findByRole("menu");
}

describe("AccountMenu — Settings item (AC-1)", () => {
  it("renders a 'Settings' menuitem linking to /settings", async () => {
    await openMenu();
    const item = screen.getByRole("menuitem", { name: /^settings$/i });
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("href", "/settings");
  });

  it("orders Settings between 'Your shelves' and 'Sign out'", async () => {
    await openMenu();
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent ?? "");
    const shelvesIdx = items.findIndex((t) => /your shelves/i.test(t));
    const settingsIdx = items.findIndex((t) => /^settings$/i.test(t.trim()));
    const signoutIdx = items.findIndex((t) => /sign out/i.test(t));
    expect(settingsIdx).toBeGreaterThan(shelvesIdx);
    expect(signoutIdx).toBeGreaterThan(settingsIdx);
  });
});
