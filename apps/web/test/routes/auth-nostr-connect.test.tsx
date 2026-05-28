import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthNostrConnect } from "../../src/routes/AuthNostrConnect";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const challengeMock = vi.fn();
const verifyMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: { auth: { nostr: { challenge: (...a: unknown[]) => challengeMock(...a), verify: (...a: unknown[]) => verifyMock(...a) } } },
}));

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const signEvent = vi.fn();

beforeEach(() => {
  navigateMock.mockReset();
  challengeMock.mockReset();
  verifyMock.mockReset();
  signEvent.mockReset();
  (window as unknown as { nostr: unknown }).nostr = {
    getPublicKey: vi.fn(async () => HEX),
    signEvent: signEvent,
  };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
});

function renderConnect() {
  return render(
    <MemoryRouter>
      <AuthNostrConnect />
    </MemoryRouter>,
  );
}

describe("AuthNostrConnect — NIP-07 flow", () => {
  it("runs challenge → signEvent → verify → navigate on confirm", async () => {
    challengeMock.mockResolvedValue({ challenge: "nonce-123" });
    signEvent.mockResolvedValue({
      id: "evt",
      pubkey: HEX,
      kind: 22242,
      created_at: 1,
      tags: [["challenge", "nonce-123"]],
      content: "",
      sig: "sig",
    });
    verifyMock.mockResolvedValue({ user: { npub: "npub1abc", email: null } });

    renderConnect();
    const confirm = await screen.findByRole("button", {
      name: /continue with this key/i,
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(challengeMock).toHaveBeenCalledWith(HEX));
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    // The signed event built from the challenge must be a kind-22242 carrying the nonce.
    const signedArg = signEvent.mock.calls[0]![0] as {
      kind: number;
      tags: string[][];
    };
    expect(signedArg.kind).toBe(22242);
    expect(signedArg.tags).toContainEqual(["challenge", "nonce-123"]);
    await waitFor(() => expect(verifyMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/auth/welcome"),
    );
  });

  it("shows the no-extension state when window.nostr is absent", async () => {
    delete (window as unknown as { nostr?: unknown }).nostr;
    renderConnect();
    expect(
      await screen.findByText(/no extension detected/i),
    ).toBeInTheDocument();
    expect(challengeMock).not.toHaveBeenCalled();
  });
});
