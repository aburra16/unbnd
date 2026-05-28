import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RatingControl } from "../../src/components/RatingControl";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const templateMock = vi.fn();
const submitMock = vi.fn();
const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    ratings: {
      template: (...a: unknown[]) => templateMock(...a),
      submit: (...a: unknown[]) => submitMock(...a),
      list: (...a: unknown[]) => listMock(...a),
    },
  },
}));

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const signEvent = vi.fn();

const sovereignUser = {
  id: "u1",
  email: null,
  displayName: "npub1n0ewa…rk23",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
};
const custodialUser = { ...sovereignUser, email: "reader@example.com" };

beforeEach(() => {
  templateMock.mockReset();
  submitMock.mockReset();
  listMock.mockReset().mockResolvedValue({ count: 0, average: null, ratings: [] });
  signEvent.mockReset();
  sessionMock.mockReset();
  (window as unknown as { nostr: unknown }).nostr = {
    getPublicKey: vi.fn(async () => HEX),
    signEvent,
  };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
});

function renderControl() {
  return render(
    <MemoryRouter>
      <RatingControl bookSlug="orbital" />
    </MemoryRouter>,
  );
}

describe("RatingControl — sovereign session", () => {
  it("runs template → signEvent → submit when a star is chosen and submitted", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
    templateMock.mockResolvedValue({
      template: { kind: 39999, created_at: 1, tags: [["d", "x"]], content: "" },
    });
    signEvent.mockResolvedValue({
      id: "e",
      pubkey: HEX,
      kind: 39999,
      created_at: 1,
      tags: [["d", "x"]],
      content: "",
      sig: "s",
    });
    submitMock.mockResolvedValue({
      rating: { npub: sovereignUser.npub, score: 4, reviewDate: "2026-05-27" },
      summary: { count: 1, average: 4, ratings: [] },
    });

    renderControl();
    fireEvent.click(await screen.findByRole("button", { name: /rate 4 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit rating/i }));

    await waitFor(() => expect(templateMock).toHaveBeenCalled());
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    const signedArg = signEvent.mock.calls[0]![0] as { kind: number };
    expect(signedArg.kind).toBe(39999);
    await waitFor(() => expect(submitMock).toHaveBeenCalled());
  });
});

describe("RatingControl — gating", () => {
  it("shows a sign-in prompt and does not call the API when signed out", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderControl();
    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
    expect(templateMock).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
  });

  it("shows the email-account placeholder for a custodial user (5b), no signing", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    renderControl();
    expect(await screen.findByText(/email accounts/i)).toBeInTheDocument();
    expect(signEvent).not.toHaveBeenCalled();
  });
});
