// Failing tests (red) for Story 29 AC-1 / AC-5 — the ProfileMe tier branch.
// ADR 0030 Decision §3 + Amendment §2/§4:
//   - Custodial (email !== null): the raw full npub is REMOVED from the header
//     (AC-1); a quiet "Advanced settings" link → /settings is present.
//   - Sovereign (email === null): a quiet on-page "npub" label + a MONOSPACE,
//     MIDDLE-TRUNCATED shortNpub chip + a <CopyButton> in the header; the FULL
//     npub is copied while the visible chip stays truncated; NO explainer line in
//     the header (the teaching lives only in Settings — Amendment §4).
//   - Neither tier shows an unlabeled, bare 63-char npub under the name.
// The tier branch / CopyButton do not exist yet → these fail → red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    profile: { meStats: (...a: unknown[]) => meStatsMock(...a), claimedBooks: vi.fn().mockResolvedValue({ books: [] }) },
  },
}));

const NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const SHORT_NPUB = "npub1n0ewa…rk23"; // shortNpub(NPUB) middle-truncated form
const EXPLAINER =
  "This is your identity on nostr. It travels with you to any nostr app, and it is how other people follow and reference you.";

const sovereignUser = { id: "u1", email: null, displayName: "Reader", npub: NPUB };
const custodialUser = {
  id: "u2",
  email: "reader@example.com",
  displayName: "Mira",
  npub: NPUB,
};
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
  submissionsMineMock.mockReset().mockResolvedValue({ submissions: [] });
  shelvesMineMock.mockReset().mockResolvedValue({ shelves: [] });
  meStatsMock.mockReset().mockResolvedValue({ stats: {} });
  sessionMock.mockReset();
  stubClipboard();
});
afterEach(() => vi.clearAllMocks());

function renderMe() {
  return render(
    <MemoryRouter>
      <ProfileMe />
    </MemoryRouter>,
  );
}

describe("ProfileMe — custodial header is clean (AC-1 / AC-5)", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
  });

  it("does not render the raw full npub anywhere in the header", async () => {
    renderMe();
    await screen.findByRole("heading", { name: "Mira" });
    expect(screen.queryByText(NPUB)).not.toBeInTheDocument();
    // The truncated chip is also absent for custodial (it lives in Settings).
    expect(screen.queryByText(SHORT_NPUB)).not.toBeInTheDocument();
  });

  it("offers an 'Advanced settings' link to /settings", async () => {
    renderMe();
    const link = await screen.findByRole("link", {
      name: /advanced settings/i,
    });
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("does not render a copy control in the custodial header", async () => {
    renderMe();
    await screen.findByRole("heading", { name: "Mira" });
    expect(
      screen.queryByRole("button", { name: /copy your npub/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ProfileMe — sovereign header keeps a labeled, copyable npub (AC-5)", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
  });

  it("shows a quiet 'npub' label beside the value", async () => {
    renderMe();
    await screen.findByRole("heading", { name: "Reader" });
    expect(screen.getByText(/^npub$/i)).toBeInTheDocument();
  });

  it("shows the MIDDLE-TRUNCATED chip, never the bare 63-char string", async () => {
    renderMe();
    expect(await screen.findByText(SHORT_NPUB)).toBeInTheDocument();
    expect(screen.queryByText(NPUB)).not.toBeInTheDocument();
  });

  it("renders a CopyButton that copies the FULL npub", async () => {
    renderMe();
    await screen.findByText(SHORT_NPUB);
    const btn = screen.getByRole("button", { name: /copy your npub/i });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(NPUB));
  });

  it("does NOT render the Settings explainer line in the header (Amendment §4)", async () => {
    renderMe();
    await screen.findByText(SHORT_NPUB);
    expect(screen.queryByText(EXPLAINER)).not.toBeInTheDocument();
  });

  it("does not offer the custodial 'Advanced settings' link", async () => {
    renderMe();
    await screen.findByRole("heading", { name: "Reader" });
    expect(
      screen.queryByRole("link", { name: /advanced settings/i }),
    ).not.toBeInTheDocument();
  });
});
