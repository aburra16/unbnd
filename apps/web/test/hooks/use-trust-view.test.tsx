import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTrustView } from "../../src/hooks/useTrustView";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const statusMock = vi.fn();
const challengeMock = vi.fn();
const personalizeMock = vi.fn();
const personalizeCustodialMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    trust: {
      status: (...a: unknown[]) => statusMock(...a),
      challenge: (...a: unknown[]) => challengeMock(...a),
      personalize: (...a: unknown[]) => personalizeMock(...a),
      // ADR 0026: custodial trigger — empty body, server signs, no NIP-07.
      personalizeCustodial: (...a: unknown[]) => personalizeCustodialMock(...a),
    },
  },
}));

const sovereign = { id: "u", email: null, displayName: "n", npub: "npub1me" };
const custodial = { id: "c", email: "reader@unbnd.ink", displayName: "Reader", npub: "npub1cust" };
const signEvent = vi.fn();

// CONTRACT MIGRATION (ADR 0026 Decision 1): /challenge now returns the unsigned
// kind-27235 TEMPLATE the sovereign user signs verbatim (it no longer builds
// the event itself). The template carries the ["challenge", …] tag the server
// built; brainstorm_login is no longer constructed in the web at all.
const SERVER_TEMPLATE = {
  kind: 27235,
  created_at: 111,
  tags: [["challenge", "chal"]],
  content: "",
};

beforeEach(() => {
  sessionMock.mockReset();
  statusMock.mockReset();
  challengeMock.mockReset();
  personalizeMock.mockReset();
  personalizeCustodialMock.mockReset();
  signEvent.mockReset();
  (window as unknown as { nostr: unknown }).nostr = { signEvent };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
  vi.clearAllMocks();
});

describe("useTrustView", () => {
  it("house-only for signed-out users (no status call)", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("house-only"));
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("ready when a sovereign user has scores", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereign, refresh: vi.fn() });
    statusMock.mockResolvedValue({ enabled: true, hasScores: true, canPersonalize: true });
    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("none when sovereign without scores; personalize SIGNS THE SERVER TEMPLATE + triggers → building (AC-6)", async () => {
    // CONTRACT MIGRATION: sovereign now signs the template fetched from
    // /challenge verbatim (no longer builds kind-27235 with brainstorm_login).
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereign, refresh: vi.fn() });
    statusMock.mockResolvedValue({ enabled: true, hasScores: false, canPersonalize: true });
    challengeMock.mockResolvedValue({ template: SERVER_TEMPLATE });
    signEvent.mockResolvedValue({ id: "e", pubkey: "x", kind: 27235, created_at: 111, tags: [["challenge", "chal"]], content: "", sig: "s" });
    personalizeMock.mockResolvedValue({ ok: true, building: true });

    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("none"));
    await act(async () => { await result.current.personalize(); });
    expect(challengeMock).toHaveBeenCalled();
    // Signs the SERVER-RETURNED template verbatim — not a web-built event.
    expect(signEvent).toHaveBeenCalledWith(SERVER_TEMPLATE);
    expect(personalizeMock).toHaveBeenCalled();
    expect(personalizeCustodialMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("building");
  });

  // ── AC-5 / AC-4 (web): custodial parity + gated prompt ──────────────────────
  it("custodial at/above the gate → none (offers Personalize)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
    statusMock.mockResolvedValue({ enabled: true, hasScores: false, canPersonalize: true });
    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("none"));
  });

  it("custodial below the gate → gated (no trigger offered) (AC-4)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
    statusMock.mockResolvedValue({ enabled: true, hasScores: false, canPersonalize: false });
    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("gated"));
  });

  it("custodial personalize triggers in-session with NO NIP-07 prompt → building (AC-5)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
    statusMock.mockResolvedValue({ enabled: true, hasScores: false, canPersonalize: true });
    personalizeCustodialMock.mockResolvedValue({ ok: true, building: true });

    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("none"));
    await act(async () => { await result.current.personalize(); });
    // The server signs — the custodial path must NOT touch window.nostr or the
    // sovereign challenge/sign methods.
    expect(personalizeCustodialMock).toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
    expect(challengeMock).not.toHaveBeenCalled();
    expect(personalizeMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("building");
  });

  it("custodial ready when scores already landed (Yours parity) (AC-5)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
    statusMock.mockResolvedValue({ enabled: true, hasScores: true, canPersonalize: true });
    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Same `?observer=<their npub>` weighting path as sovereign — npub exposed.
    expect(result.current.npub).toBe(custodial.npub);
  });
});
