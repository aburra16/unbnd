// FAILING TESTS — Story 79 / ADR 0077 (web: the Remove rating affordance).
//
// RatingControl, when the caller has rated, offers a DELIBERATE "Remove
// rating" action: a separated quiet control, gated by a small two-step
// confirm (AC-6: not reachable by fat-fingering the stars). Sovereign runs
// removeTemplate -> NIP-07 signEvent -> removeSubmit; custodial runs
// removeCustodial({ bookSlug }). On success the control reconciles through
// applyWrite with the own rating CLEARED (null) so it returns to the
// un-rated state. Not-rated and signed-out users never see the action.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RatingControl } from "../../src/components/RatingControl";
import type { UseSession } from "../../src/hooks/useSession";
import type { PublicRating, PublicUser, RatingsSummary } from "../../src/lib/api";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

const removeTemplateMock = vi.fn();
const removeSubmitMock = vi.fn();
const removeCustodialMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string | undefined,
      message: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
  api: {
    ratings: {
      template: vi.fn(),
      submit: vi.fn(),
      submitCustodial: vi.fn(),
      list: vi.fn(async () => ({ count: 0, average: null, ratings: [] })),
      removeTemplate: (...a: unknown[]) => removeTemplateMock(...a),
      removeSubmit: (...a: unknown[]) => removeSubmitMock(...a),
      removeCustodial: (...a: unknown[]) => removeCustodialMock(...a),
    },
  },
}));

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const MY_NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const signEvent = vi.fn();

const sovereignUser: PublicUser = { id: "u1", email: null, displayName: "me", npub: MY_NPUB };
const custodialUser: PublicUser = { ...sovereignUser, email: "reader@example.com" };

const MY_RATING: PublicRating = {
  npub: MY_NPUB,
  score: 4,
  reviewText: "A quiet marvel.",
  reviewDate: "2026-05-20",
};
const EMPTY_SUMMARY: RatingsSummary = { count: 0, average: null, ratings: [], weighted: null };

beforeEach(() => {
  removeTemplateMock.mockReset();
  removeSubmitMock.mockReset();
  removeCustodialMock.mockReset();
  signEvent.mockReset();
  sessionMock.mockReset();
  trustMock.mockReset().mockReturnValue({
    status: "ready", view: "house", setView: vi.fn(), personalize: vi.fn(),
    error: null, npub: MY_NPUB,
  });
  (window as unknown as { nostr: unknown }).nostr = {
    getPublicKey: vi.fn(async () => HEX),
    signEvent,
  };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
  vi.clearAllMocks();
});

function renderControl(
  props: { yourRating?: PublicRating | null; applyWrite?: (s: RatingsSummary, r: PublicRating | null) => void } = {},
) {
  const applyWrite = props.applyWrite ?? vi.fn();
  const utils = render(
    <MemoryRouter>
      <RatingControl bookSlug="orbital" yourRating={props.yourRating ?? null} applyWrite={applyWrite} />
    </MemoryRouter>,
  );
  return { ...utils, applyWrite };
}

function signedIn(user: PublicUser = sovereignUser) {
  sessionMock.mockReturnValue({ status: "signed-in", user, refresh: vi.fn() });
}

describe("RatingControl — the Remove rating action (Story 79)", () => {
  it("has-rated: offers a deliberate 'Remove rating' action gated by a confirm step (no api call before confirm)", async () => {
    signedIn(sovereignUser);
    renderControl({ yourRating: MY_RATING });

    const remove = await screen.findByRole("button", { name: /remove rating/i });
    fireEvent.click(remove);

    // The confirm step: calm copy, nothing sent yet.
    expect(await screen.findByText(/remove your rating\?/i)).toBeInTheDocument();
    expect(screen.getByText(/you can rate again anytime/i)).toBeInTheDocument();
    expect(removeTemplateMock).not.toHaveBeenCalled();
    expect(removeSubmitMock).not.toHaveBeenCalled();
    expect(removeCustodialMock).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
  });

  it("confirm can be dismissed: 'Keep it' returns to the editor with nothing sent", async () => {
    signedIn(sovereignUser);
    renderControl({ yourRating: MY_RATING });

    fireEvent.click(await screen.findByRole("button", { name: /remove rating/i }));
    fireEvent.click(await screen.findByRole("button", { name: /keep it/i }));

    await waitFor(() =>
      expect(screen.queryByText(/remove your rating\?/i)).not.toBeInTheDocument(),
    );
    expect(removeTemplateMock).not.toHaveBeenCalled();
    expect(removeCustodialMock).not.toHaveBeenCalled();
  });

  it("sovereign confirm: runs removeTemplate -> signEvent -> removeSubmit and reconciles with the own rating CLEARED", async () => {
    signedIn(sovereignUser);
    const template = { kind: 39999, created_at: 1, tags: [["d", "x"], ["retracted", "true"]], content: "" };
    const signed = { id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: template.tags, content: "", sig: "s" };
    removeTemplateMock.mockResolvedValue({ template });
    signEvent.mockResolvedValue(signed);
    removeSubmitMock.mockResolvedValue({ removed: true, summary: EMPTY_SUMMARY, yourRating: null });

    const applyWrite = vi.fn();
    renderControl({ yourRating: MY_RATING, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /remove rating/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(removeTemplateMock).toHaveBeenCalledWith("orbital"));
    await waitFor(() => expect(signEvent).toHaveBeenCalledWith(template));
    await waitFor(() => expect(removeSubmitMock).toHaveBeenCalled());
    // Reconcile: the shared store gets the post-removal summary and a CLEARED own rating.
    await waitFor(() => expect(applyWrite).toHaveBeenCalled());
    const [summaryArg, ownArg] = applyWrite.mock.calls[0]! as [RatingsSummary, PublicRating | null];
    expect(summaryArg).toBe(EMPTY_SUMMARY);
    expect(ownArg).toBeNull();
    expect(removeCustodialMock).not.toHaveBeenCalled();
  });

  it("custodial confirm: runs removeCustodial with the book slug; no template, no extension signing", async () => {
    signedIn(custodialUser);
    removeCustodialMock.mockResolvedValue({ removed: true, summary: EMPTY_SUMMARY, yourRating: null });

    const applyWrite = vi.fn();
    renderControl({ yourRating: MY_RATING, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /remove rating/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(removeCustodialMock).toHaveBeenCalledWith("orbital"));
    await waitFor(() => expect(applyWrite).toHaveBeenCalled());
    expect((applyWrite.mock.calls[0]! as [RatingsSummary, PublicRating | null])[1]).toBeNull();
    expect(removeTemplateMock).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
  });

  it("not-rated: no Remove action; signed-out: no Remove action", async () => {
    signedIn(sovereignUser);
    const notRated = renderControl({ yourRating: null });
    // The un-rated editor is present, but no remove affordance.
    await screen.findByRole("button", { name: /submit rating/i });
    expect(screen.queryByRole("button", { name: /remove rating/i })).not.toBeInTheDocument();
    notRated.unmount();

    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderControl({ yourRating: null });
    expect(screen.queryByRole("button", { name: /remove rating/i })).not.toBeInTheDocument();
  });
});
