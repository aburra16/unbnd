// Failing tests (red) for Story 29 AC-2 / AC-4 / AC-6 / AC-7 — the canonical
// "Nostr identity" section on /settings. ADR 0030 Decision §2 + Amendment §1–§3:
//   - Both tiers see the section (Settings is the canonical home).
//   - Heading "Nostr identity" (on-page text).
//   - A PERSISTENT on-page explainer line, the exact pinned string, rendered as
//     VISIBLE DOM text — never a title/hover tooltip (Amendment §1).
//   - A "Your npub" field label so the bech32 string is never unlabeled.
//   - The npub renders as a MONOSPACE, MIDDLE-TRUNCATED code chip (shortNpub) —
//     the visible value is the truncated form, NOT the bare 63-char string.
//   - A <CopyButton> that copies the FULL npub while the chip shows the truncated
//     form (Amendment §2).
//   - No network call on copy (AC-7).
//   - The existing Substack field + custodial Display-name field still render
//     unchanged (AC-6).
// The Nostr-identity section / CopyButton do not exist yet → these fail → red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Settings } from "../../src/routes/Settings";
import type { UseSession } from "../../src/hooks/useSession";
import type { PublicUser } from "../../src/lib/api";

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
// The middle-truncated form shortNpub(NPUB) produces (slice(0,10)+"…"+slice(-4)).
const SHORT_NPUB = "npub1n0ewa…rk23";
const EXPLAINER =
  "This is your identity on nostr. It travels with you to any nostr app, and it is how other people follow and reference you.";

const sovereignUser = { id: "u1", email: null, displayName: "Reader", npub: NPUB };
const custodialUser = {
  id: "u2",
  email: "reader@example.com",
  displayName: "Mira",
  npub: NPUB,
};
const signEvent = vi.fn();
const writeText = vi.fn();

function stubClipboard() {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

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
  stubClipboard();
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

// The section is the canonical home for BOTH tiers. Run the structural
// assertions against each.
const tiers: Array<[string, PublicUser]> = [
  ["sovereign", sovereignUser],
  ["custodial", custodialUser],
];

describe.each(tiers)(
  "Settings — Nostr identity section, %s tier (AC-2 / AC-4 / AC-6)",
  (_label, user) => {
    beforeEach(() => {
      sessionMock.mockReturnValue({ status: "signed-in", user, refresh: vi.fn() });
      profileMetaMock.mockReturnValue({ npub: NPUB });
    });

    it("renders a 'Nostr identity' heading", async () => {
      renderSettings();
      expect(
        await screen.findByRole("heading", { name: /nostr identity/i }),
      ).toBeInTheDocument();
    });

    it("shows the persistent explainer as visible on-page text (not a tooltip)", async () => {
      renderSettings();
      const line = await screen.findByText(EXPLAINER);
      expect(line).toBeInTheDocument();
      // The meaning must be in the DOM as text, not hidden in a title attribute.
      expect(line).not.toHaveAttribute("title", EXPLAINER);
    });

    it("labels the npub with 'Your npub'", async () => {
      renderSettings();
      expect(await screen.findByText(/your npub/i)).toBeInTheDocument();
    });

    it("shows the MIDDLE-TRUNCATED npub chip, not the bare 63-char string", async () => {
      renderSettings();
      expect(await screen.findByText(SHORT_NPUB)).toBeInTheDocument();
      // The full bech32 string is never the visible value.
      expect(screen.queryByText(NPUB)).not.toBeInTheDocument();
    });

    it("renders a CopyButton in the section", async () => {
      renderSettings();
      expect(
        await screen.findByRole("button", { name: /copy your npub/i }),
      ).toBeInTheDocument();
    });
  },
);

describe("Settings — Nostr identity: truncated chip, full copy (Amendment §2, AC-3/AC-7)", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB });
  });

  it("copies the FULL npub while the visible chip stays truncated", async () => {
    renderSettings();
    // The visible chip is the truncated form.
    expect(await screen.findByText(SHORT_NPUB)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /copy your npub/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(NPUB));
  });

  it("hits the clipboard, not the server, on copy (AC-7)", async () => {
    renderSettings();
    await screen.findByText(SHORT_NPUB);
    fireEvent.click(screen.getByRole("button", { name: /copy your npub/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(substackTemplateMock).not.toHaveBeenCalled();
    expect(setSubstackMock).not.toHaveBeenCalled();
    expect(setSubstackCustodialMock).not.toHaveBeenCalled();
    expect(setDisplayNameMock).not.toHaveBeenCalled();
  });
});

describe("Settings — existing fields keep working alongside the new section (AC-6)", () => {
  it("still renders the Substack field for a sovereign user", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB });
    renderSettings();
    expect(
      await screen.findByRole("textbox", { name: /substack/i }),
    ).toBeInTheDocument();
  });

  it("still renders the custodial Display-name field", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB, name: "Mira" });
    renderSettings();
    expect(
      await screen.findByRole("textbox", { name: /display name/i }),
    ).toBeInTheDocument();
  });

  it("does not add a second editable npub textbox (the npub surface is read-only)", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB });
    renderSettings();
    await screen.findByText(SHORT_NPUB);
    expect(screen.queryByRole("textbox", { name: /npub/i })).not.toBeInTheDocument();
  });
});

describe("Settings — Nostr identity copy passes the no-slop rule (AC-4)", () => {
  it("the section's copy carries no em dash and no emoji", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
    profileMetaMock.mockReturnValue({ npub: NPUB });
    const { container } = renderSettings();
    await screen.findByRole("heading", { name: /nostr identity/i });
    const heading = screen.getByRole("heading", { name: /nostr identity/i });
    // Scope to the identity section so we test the new copy specifically.
    const section = heading.closest("section, div, form") ?? container;
    const text = within(section as HTMLElement).getByText(EXPLAINER).textContent ?? "";
    expect(text).not.toContain("—");
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });
});
