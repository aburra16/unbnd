import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTrustView } from "../../src/hooks/useTrustView";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const statusMock = vi.fn();
const challengeMock = vi.fn();
const personalizeMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    trust: {
      status: (...a: unknown[]) => statusMock(...a),
      challenge: (...a: unknown[]) => challengeMock(...a),
      personalize: (...a: unknown[]) => personalizeMock(...a),
    },
  },
}));

const sovereign = { id: "u", email: null, displayName: "n", npub: "npub1me" };
const signEvent = vi.fn();

beforeEach(() => {
  sessionMock.mockReset();
  statusMock.mockReset();
  challengeMock.mockReset();
  personalizeMock.mockReset();
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

  it("none when sovereign without scores; personalize signs + triggers → building", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereign, refresh: vi.fn() });
    statusMock.mockResolvedValue({ enabled: true, hasScores: false, canPersonalize: true });
    challengeMock.mockResolvedValue({ challenge: "chal" });
    signEvent.mockResolvedValue({ id: "e", pubkey: "x", kind: 27235, created_at: 1, tags: [], content: "", sig: "s" });
    personalizeMock.mockResolvedValue({ ok: true, building: true });

    const { result } = renderHook(() => useTrustView());
    await waitFor(() => expect(result.current.status).toBe("none"));
    await act(async () => { await result.current.personalize(); });
    expect(challengeMock).toHaveBeenCalled();
    expect(signEvent).toHaveBeenCalled();
    expect(personalizeMock).toHaveBeenCalled();
    expect(result.current.status).toBe("building");
  });
});
