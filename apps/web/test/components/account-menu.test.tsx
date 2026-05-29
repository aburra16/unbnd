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
