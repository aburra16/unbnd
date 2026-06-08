// Story 76 / ADR 0074 (web) — the "Take ownership" sovereignty card in Settings →
// Nostr identity. Three states by tier + export status, plus the deliberate flow
// (explain → confirm → password re-auth → reveal-once with copy + required ack).
// FAILING until Settings renders the SovereigntyCard / TakeOwnershipFlow.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Settings } from "../../src/routes/Settings";
import type { UseSession } from "../../src/hooks/useSession";
import type { PublicUser } from "../../src/lib/api";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const profileMetaMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (...a: unknown[]) => profileMetaMock(...a),
  invalidateProfileMeta: vi.fn(),
  displayNameOf: (m: { displayName?: string; name?: string } | null, f: string) =>
    m?.displayName ?? m?.name ?? f,
}));

const exportKeyMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    profile: {
      substackTemplate: vi.fn(),
      setSubstack: vi.fn(),
      setSubstackCustodial: vi.fn(),
      setDisplayName: vi.fn(),
    },
    auth: { exportKey: (...a: unknown[]) => exportKeyMock(...a) },
  },
}));

const NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const custodial: PublicUser = { id: "u2", email: "reader@example.com", displayName: "Mira", npub: NPUB };
const sovereign: PublicUser = { id: "u1", email: null, displayName: "Reader", npub: NPUB };
const custodialExported: PublicUser = { ...custodial, keyExportedAt: "2026-06-01T00:00:00Z" };

beforeEach(() => {
  sessionMock.mockReset();
  profileMetaMock.mockReset().mockReturnValue({ npub: NPUB });
  exportKeyMock.mockReset().mockResolvedValue({ nsec: "nsec1revealedkey" });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  });
});
afterEach(() => vi.clearAllMocks());

function renderSettings(user: PublicUser) {
  sessionMock.mockReturnValue({ status: "signed-in", user, refresh: vi.fn() });
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Settings — sovereignty card states (AC-1/AC-5/AC-7)", () => {
  it("a custodial, not-yet-exported user sees the 'Take ownership' offer", async () => {
    renderSettings(custodial);
    expect(await screen.findByRole("button", { name: /take ownership/i })).toBeInTheDocument();
  });

  it("a sovereign user sees 'you own your key', never the export offer", async () => {
    renderSettings(sovereign);
    expect(await screen.findByText(/you own your key/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take ownership/i })).not.toBeInTheDocument();
  });

  it("a custodial user who already exported sees the taken state, not the offer", async () => {
    renderSettings(custodialExported);
    expect(await screen.findByText(/taken ownership|you own your key/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take ownership/i })).not.toBeInTheDocument();
  });
});

describe("Settings — take-ownership flow (AC-2/AC-3/AC-4)", () => {
  it("reveals the nsec only after explicit confirm + password, and gates dismissal on an acknowledgement", async () => {
    renderSettings(custodial);

    fireEvent.click(await screen.findByRole("button", { name: /take ownership/i }));
    // One explicit confirmation before anything is revealed.
    fireEvent.click(await screen.findByRole("button", { name: /continue|i understand/i }));
    // Re-auth: the password gates the reveal.
    fireEvent.change(await screen.findByLabelText(/password/i), { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: /reveal|show my key/i }));

    await waitFor(() => expect(exportKeyMock).toHaveBeenCalledWith("correct horse"));
    // The key is shown once.
    expect(await screen.findByText(/nsec1revealedkey/)).toBeInTheDocument();
    // Done is gated on the acknowledgement.
    const done = screen.getByRole("button", { name: /done/i });
    expect(done).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /saved my key/i }));
    expect(done).toBeEnabled();
  });
});
