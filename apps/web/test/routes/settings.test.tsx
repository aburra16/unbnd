// Failing tests (red) for Story 22 AC-1 / AC-5 / AC-6 / AC-9 — the gated
// /settings route with the Substack-only form. ADR 0022 Decision 4, new file
// `apps/web/src/routes/Settings.tsx`:
//   - gated like ProfileMe: loading → status, signed-out → <Navigate to="/auth">.
//   - one labeled input prefilled from useProfileMeta(npub)?.substack.
//   - Save: sovereign (email === null) → api.profile.substackTemplate → NIP-07
//     window.nostr.signEvent → api.profile.setSubstack; no extension → honest
//     message, nothing published. Custodial → api.profile.setSubstackCustodial.
//   - Clear sends an empty string.
//   - inline http(s) validation before submit (no API call on a malformed URL).
//   - honest idle | saving | saved | error states.
//   - on success: optimistic echo + invalidateProfileMeta(user.npub).
// Settings.tsx does not exist yet → import fails → red.
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
  displayNameOf: (meta: { displayName?: string } | null, fallback: string) =>
    meta?.displayName ?? fallback,
}));

const substackTemplateMock = vi.fn();
const setSubstackMock = vi.fn();
const setSubstackCustodialMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    profile: {
      substackTemplate: (...a: unknown[]) => substackTemplateMock(...a),
      setSubstack: (...a: unknown[]) => setSubstackMock(...a),
      setSubstackCustodial: (...a: unknown[]) => setSubstackCustodialMock(...a),
    },
  },
}));

const NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const sovereignUser = { id: "u1", email: null, displayName: "Reader", npub: NPUB };
const custodialUser = { ...sovereignUser, email: "reader@example.com" };
const signEvent = vi.fn();

beforeEach(() => {
  substackTemplateMock.mockReset();
  setSubstackMock.mockReset();
  setSubstackCustodialMock.mockReset();
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

describe("Settings — gating (AC-1)", () => {
  it("redirects a signed-out visitor to sign-in (no settings form)", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderSettings();
    expect(await screen.findByText(/sign in page/i)).toBeInTheDocument();
  });

  it("shows a loading state while the session resolves", () => {
    sessionMock.mockReturnValue({ status: "loading", refresh: vi.fn() });
    renderSettings();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Settings — form prefill + Substack-only (AC-1 / AC-9)", () => {
  it("prefills the field from the user's current substack value", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    profileMetaMock.mockReturnValue({ npub: NPUB, substack: "https://reader.substack.com" });
    renderSettings();
    const input = (await screen.findByLabelText(/substack/i)) as HTMLInputElement;
    expect(input.value).toBe("https://reader.substack.com");
  });

  it("shows an empty field when the user has no substack value", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    profileMetaMock.mockReturnValue({ npub: NPUB });
    renderSettings();
    const input = (await screen.findByLabelText(/substack/i)) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("exposes ONLY the Substack field — no name/bio/picture/nip05 inputs", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    renderSettings();
    await screen.findByLabelText(/substack/i);
    expect(screen.queryByLabelText(/display name|^name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/bio|about/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/picture|avatar/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nip-?05/i)).not.toBeInTheDocument();
  });
});

describe("Settings — sovereign save flow (AC-6)", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
  });

  it("runs substackTemplate → signEvent → setSubstack, then echoes + invalidates the cache (AC-9)", async () => {
    substackTemplateMock.mockResolvedValue({
      template: { kind: 0, created_at: 1, tags: [], content: '{"substack":"https://reader.substack.com"}' },
    });
    signEvent.mockResolvedValue({
      id: "e", pubkey: HEX, kind: 0, created_at: 1, tags: [], content: '{"substack":"https://reader.substack.com"}', sig: "s",
    });
    setSubstackMock.mockResolvedValue({ substack: "https://reader.substack.com" });

    renderSettings();
    const input = await screen.findByLabelText(/substack/i);
    fireEvent.change(input, { target: { value: "https://reader.substack.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(substackTemplateMock).toHaveBeenCalled());
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    expect((signEvent.mock.calls[0]![0] as { kind: number }).kind).toBe(0);
    await waitFor(() => expect(setSubstackMock).toHaveBeenCalled());
    // Honest saved state + cache-bust so the link appears on /profile/me.
    await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith(NPUB));
    expect(setSubstackCustodialMock).not.toHaveBeenCalled();
  });

  it("shows an honest 'no extension' message and publishes nothing when window.nostr is absent", async () => {
    delete (window as unknown as { nostr?: unknown }).nostr;
    renderSettings();
    const input = await screen.findByLabelText(/substack/i);
    fireEvent.change(input, { target: { value: "https://reader.substack.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/no nostr extension/i)).toBeInTheDocument();
    expect(substackTemplateMock).not.toHaveBeenCalled();
    expect(setSubstackMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed URL inline before any API call (AC-5)", async () => {
    renderSettings();
    const input = await screen.findByLabelText(/substack/i);
    fireEvent.change(input, { target: { value: "notaurl" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(substackTemplateMock).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
  });

  it("shows an error state when the API rejects the save (no fabricated success) (AC-9)", async () => {
    substackTemplateMock.mockRejectedValue(new Error("boom"));
    renderSettings();
    const input = await screen.findByLabelText(/substack/i);
    fireEvent.change(input, { target: { value: "https://reader.substack.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("Settings — Clear (AC-4) and custodial (AC-7)", () => {
  it("Clear submits an empty value (sovereign signs an empty-substack template)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    profileMetaMock.mockReturnValue({ npub: NPUB, substack: "https://old.substack.com" });
    substackTemplateMock.mockResolvedValue({
      template: { kind: 0, created_at: 1, tags: [], content: "{}" },
    });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 0, created_at: 1, tags: [], content: "{}", sig: "s" });
    setSubstackMock.mockResolvedValue({ substack: null });

    renderSettings();
    await screen.findByLabelText(/substack/i);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    await waitFor(() => expect(substackTemplateMock).toHaveBeenCalledWith(""));
  });

  it("custodial user saves via setSubstackCustodial (server signs), not the extension (AC-7)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodialUser, refresh: vi.fn() });
    setSubstackCustodialMock.mockResolvedValue({ substack: "https://reader.substack.com" });
    renderSettings();
    const input = await screen.findByLabelText(/substack/i);
    fireEvent.change(input, { target: { value: "https://reader.substack.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(setSubstackCustodialMock).toHaveBeenCalledWith("https://reader.substack.com"),
    );
    expect(signEvent).not.toHaveBeenCalled();
    await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith(NPUB));
  });
});
