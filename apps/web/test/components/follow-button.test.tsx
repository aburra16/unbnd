// Failing tests (red) for Story 23 AC-1 / AC-2 / AC-6 / AC-7 / AC-10 — the
// crafted FollowButton on the public profile. ADR 0023 Decision 5, new file
// `apps/web/src/components/FollowButton.tsx`:
//   - Render rules (AC-1): signed-out → a labeled sign-in affordance (link to
//     /auth, no follow action); viewing OWN profile (target resolves to the
//     session pubkey) → NO control; otherwise the follow control.
//   - States (AC-2/AC-10): not-following → "Follow" (aria-pressed=false);
//     following → "Following" (aria-pressed=true), revealing "Unfollow" on
//     hover/focus; optimistic pending on click; REVERT on failure.
//   - Tier branch (AC-6/AC-7): sovereign (email === null) → followTemplate →
//     window.nostr.signEvent → follow(signed, hint); custodial → followCustodial.
//   - Accessibility (AC-10): real <button>, aria-pressed reflecting status.
//
// FollowButton does not exist yet → import fails → red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { FollowButton } from "../../src/components/FollowButton";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const followTemplateMock = vi.fn();
const followMock = vi.fn();
const followCustodialMock = vi.fn();
const followStatusMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    profile: {
      followTemplate: (...a: unknown[]) => followTemplateMock(...a),
      follow: (...a: unknown[]) => followMock(...a),
      followCustodial: (...a: unknown[]) => followCustodialMock(...a),
      followStatus: (...a: unknown[]) => followStatusMock(...a),
    },
  },
}));

// The target the control points at (a different identity than the viewer).
const TARGET_NPUB = "npub1target00000000000000000000000000000000000000000000000000";
const TARGET_HEX = "a".repeat(64);
// The signed-in viewer.
const VIEWER_NPUB = "npub1viewer00000000000000000000000000000000000000000000000000";
const VIEWER_HEX = "9".repeat(64);

const sovereignUser = { id: "u1", email: null, displayName: "Reader", npub: VIEWER_NPUB };
const custodialUser = { ...sovereignUser, email: "reader@example.com" };
const signEvent = vi.fn();

beforeEach(() => {
  followTemplateMock.mockReset();
  followMock.mockReset();
  followCustodialMock.mockReset();
  followStatusMock.mockReset().mockResolvedValue({ following: false });
  signEvent.mockReset();
  sessionMock.mockReset();
  (window as unknown as { nostr?: unknown }).nostr = { signEvent };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
  vi.clearAllMocks();
});

function renderButton(props: { target?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={["/profile/x"]}>
      <Routes>
        <Route path="/profile/x" element={<FollowButton target={props.target ?? TARGET_NPUB} />} />
        <Route path="/auth" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FollowButton — render rules (AC-1)", () => {
  it("signed-out → renders the create-account prompt (link to /auth), no follow control (Story 73)", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderButton();
    expect(
      await screen.findByText(/create a free account to follow this curator\./i),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /create account/i });
    expect(link).toHaveAttribute("href", "/auth");
    expect(screen.queryByRole("button", { name: /follow/i })).not.toBeInTheDocument();
    expect(followStatusMock).not.toHaveBeenCalled();
  });

  it("viewing your OWN profile → renders no control (self-follow prevention)", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: { ...sovereignUser, npub: TARGET_NPUB },
      refresh: vi.fn(),
    });
    renderButton({ target: TARGET_NPUB });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /follow/i })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /sign in to follow/i })).not.toBeInTheDocument();
  });
});

describe("FollowButton — follow status drives the label (AC-2 / AC-10)", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
  });

  it("shows 'Follow' with aria-pressed=false when the viewer does not follow the target", async () => {
    followStatusMock.mockResolvedValue({ following: false });
    renderButton();
    const btn = await screen.findByRole("button", { name: /follow/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("shows 'Following' with aria-pressed=true when the viewer already follows the target", async () => {
    followStatusMock.mockResolvedValue({ following: true });
    renderButton();
    const btn = await screen.findByRole("button", { name: /following/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("reveals an 'Unfollow' affordance on hover/focus of the Following control", async () => {
    followStatusMock.mockResolvedValue({ following: true });
    renderButton();
    const btn = await screen.findByRole("button", { name: /following/i });
    fireEvent.focus(btn);
    expect(await screen.findByText(/unfollow/i)).toBeInTheDocument();
  });
});

describe("FollowButton — sovereign follow flow (AC-6)", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
  });

  it("runs followTemplate → signEvent → follow (NIP-07), settling to Following", async () => {
    followStatusMock.mockResolvedValue({ following: false });
    followTemplateMock.mockResolvedValue({
      template: { kind: 3, created_at: 1, tags: [["p", TARGET_HEX]], content: "" },
    });
    signEvent.mockResolvedValue({
      id: "e", pubkey: VIEWER_HEX, kind: 3, created_at: 1, tags: [["p", TARGET_HEX]], content: "", sig: "s",
    });
    followMock.mockResolvedValue({ following: true });

    renderButton();
    const btn = await screen.findByRole("button", { name: /follow/i });
    fireEvent.click(btn);

    await waitFor(() => expect(followTemplateMock).toHaveBeenCalled());
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    expect((signEvent.mock.calls[0]![0] as { kind: number }).kind).toBe(3);
    await waitFor(() => expect(followMock).toHaveBeenCalled());
    expect(followCustodialMock).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: /following/i });
  });

  it("shows an honest 'no extension' message and publishes nothing when window.nostr is absent", async () => {
    delete (window as unknown as { nostr?: unknown }).nostr;
    followStatusMock.mockResolvedValue({ following: false });
    renderButton();
    const btn = await screen.findByRole("button", { name: /follow/i });
    fireEvent.click(btn);
    expect(await screen.findByText(/no nostr extension/i)).toBeInTheDocument();
    expect(followTemplateMock).not.toHaveBeenCalled();
    expect(followMock).not.toHaveBeenCalled();
  });

  it("reverts to the prior state and shows an honest error when the write fails (no fabricated success)", async () => {
    followStatusMock.mockResolvedValue({ following: false });
    followTemplateMock.mockRejectedValue(new Error("boom"));
    renderButton();
    const btn = await screen.findByRole("button", { name: /follow/i });
    fireEvent.click(btn);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Reverted: still in the not-following ("Follow") state, not "Following".
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^follow$/i })).toBeInTheDocument(),
    );
  });
});

describe("FollowButton — custodial follow flow (AC-7)", () => {
  it("custodial user follows via followCustodial (server signs), not the extension", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodialUser, refresh: vi.fn() });
    followStatusMock.mockResolvedValue({ following: false });
    followCustodialMock.mockResolvedValue({ following: true });
    renderButton();
    const btn = await screen.findByRole("button", { name: /follow/i });
    fireEvent.click(btn);
    await waitFor(() => expect(followCustodialMock).toHaveBeenCalled());
    expect(signEvent).not.toHaveBeenCalled();
    expect(followTemplateMock).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: /following/i });
  });
});
