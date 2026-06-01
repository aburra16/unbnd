// Failing tests (red) for Story 27b AC-5 — the custodial-only display-name field
// on /settings. ADR 0028 Decision §7. Mirrors the existing
// `settings.test.tsx` (the Substack-field model) and `profile-me-substack.test.tsx`
// web test setup:
//   - A display-name field, prefilled from the RESOLVED name
//     (useProfileMeta(npub)?.name, falling back to the session displayName).
//   - honest idle | saving | saved | error states.
//   - on success: calls api.profile.setDisplayName(name) and
//     invalidateProfileMeta(user.npub).
//   - HIDDEN/disabled for sovereign (email === null); custodial-only.
//   - Copy passes the no-slop rule (no em dashes, no emoji).
//   - injected/mocked api — no network.
// Settings.tsx has no display-name field yet → these assertions fail → red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Settings } from "../../src/routes/Settings";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const profileMetaMock = vi.fn();
const invalidateMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (...a: unknown[]) => profileMetaMock(...a),
  invalidateProfileMeta: (...a: unknown[]) => invalidateMock(...a),
  displayNameOf: (
    meta: { displayName?: string; name?: string } | null,
    fallback: string,
  ) => meta?.displayName ?? meta?.name ?? fallback,
}));

// Keep the Substack-write mocks present (Settings imports them) and add the new
// rename method. No real network anywhere.
const substackTemplateMock = vi.fn();
const setSubstackMock = vi.fn();
const setSubstackCustodialMock = vi.fn();
const setDisplayNameMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    profile: {
      substackTemplate: (...a: unknown[]) => substackTemplateMock(...a),
      setSubstack: (...a: unknown[]) => setSubstackMock(...a),
      setSubstackCustodial: (...a: unknown[]) => setSubstackCustodialMock(...a),
      setDisplayName: (...a: unknown[]) => setDisplayNameMock(...a),
    },
  },
}));

const NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const sovereignUser = { id: "u1", email: null, displayName: "Reader", npub: NPUB };
const custodialUser = {
  id: "u2",
  email: "reader@example.com",
  displayName: "Mira",
  npub: NPUB,
};
const signEvent = vi.fn();

beforeEach(() => {
  substackTemplateMock.mockReset();
  setSubstackMock.mockReset();
  setSubstackCustodialMock.mockReset();
  setDisplayNameMock.mockReset();
  invalidateMock.mockReset();
  signEvent.mockReset();
  sessionMock.mockReset();
  profileMetaMock.mockReset().mockReturnValue(null);
  (window as unknown as { nostr?: unknown }).nostr = { signEvent };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
  vi.clearAllMocks();
});

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/auth" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Settings — display-name field, custodial (AC-5)", () => {
  it("prefills the field from the resolved kind-0 name", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB, name: "Mira" });
    renderSettings();
    const input = (await screen.findByRole("textbox", { name: /display name/i })) as HTMLInputElement;
    expect(input.value).toBe("Mira");
  });

  it("falls back to the session displayName when the resolved kind-0 has no name", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB }); // no name resolved
    renderSettings();
    const input = (await screen.findByRole("textbox", { name: /display name/i })) as HTMLInputElement;
    expect(input.value).toBe("Mira"); // session displayName seed
  });

  it("on success calls api.profile.setDisplayName and invalidateProfileMeta(npub), with an honest saved state", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB, name: "Mira" });
    setDisplayNameMock.mockResolvedValue({ displayName: "Mira Reborn" });

    renderSettings();
    const input = await screen.findByRole("textbox", { name: /display name/i });
    fireEvent.change(input, { target: { value: "Mira Reborn" } });
    // The display-name field's own save control (not the Substack Save).
    fireEvent.click(screen.getByRole("button", { name: /save display name/i }));

    await waitFor(() =>
      expect(setDisplayNameMock).toHaveBeenCalledWith("Mira Reborn"),
    );
    await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith(NPUB));
    // No NIP-07 signing for a custodial rename (the server signs).
    expect(signEvent).not.toHaveBeenCalled();
  });

  it("shows an error state when the rename API rejects (no fabricated success)", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB, name: "Mira" });
    setDisplayNameMock.mockRejectedValue(new Error("boom"));

    renderSettings();
    const input = await screen.findByRole("textbox", { name: /display name/i });
    fireEvent.change(input, { target: { value: "Mira Reborn" } });
    fireEvent.click(screen.getByRole("button", { name: /save display name/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("Settings — display-name field hidden for sovereign (AC-6)", () => {
  it("does not render a display-name field for a sovereign (email === null) user", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB, name: "Reader" });
    renderSettings();
    // The page renders (Substack field is there), but no display-name input.
    await screen.findByRole("textbox", { name: /substack/i });
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });
});

describe("Settings — display-name copy passes the no-slop rule (AC-5)", () => {
  it("the field's labels/hints carry no em dash and no emoji", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB, name: "Mira" });
    const { container } = renderSettings();
    await screen.findByRole("textbox", { name: /display name/i });
    const text = container.textContent ?? "";
    // No em dash (the LLM tell banned by the copy rule).
    expect(text).not.toContain("—");
    // No emoji anywhere in the rendered settings copy.
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });
});
