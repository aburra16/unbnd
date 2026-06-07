// FAILING TESTS — Story 28 / ADR 0029 (AC-1,2,3,4,5,6,7,8).
//
// RatingControl becomes the unified "Your rating" display + in-place editor. It is
// controlled: BookDetail passes `yourRating` (the trust-view-independent own read,
// §2/§6) and `applyWrite` (the optimistic+reconcile entry point, §4). These tests
// pin the surface (filled stars + label + date line), the prefill/"Update rating"
// framing, optimistic+reconcile+rollback, both tiers, the custodial reauth branch,
// and the signed-out path.
//
// Intentionally red until RatingControl accepts `yourRating`/`applyWrite`, renders
// the "Your rating" zone, prefills, switches the button label, and wires the
// optimistic/rollback flow. Boundary mocks only (api / useSession); no network, no
// real crypto, fixed dates/scores (no Date.now in asserted output). Role-scoped
// queries per the Settings lesson (no page-wide /save/i substring matches).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RatingControl } from "../../src/components/RatingControl";
import type { UseSession } from "../../src/hooks/useSession";
import { ApiError, type PublicRating, type PublicUser, type RatingsSummary } from "../../src/lib/api";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

// RatingControl may read useTrustView for the active view; the honesty rule (AC-3)
// is that the "Your rating" zone is sourced from the own read (the `yourRating`
// prop), never from the trust-weighted set, so flipping the view must not change it.
const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

const templateMock = vi.fn();
const submitMock = vi.fn();
const submitCustodialMock = vi.fn();
const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  // Defined inside the factory (hoisted): a 3-arg ApiError mirroring the real one,
  // so the control's `err instanceof ApiError` + code/message branch works.
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
      template: (...a: unknown[]) => templateMock(...a),
      submit: (...a: unknown[]) => submitMock(...a),
      submitCustodial: (...a: unknown[]) => submitCustodialMock(...a),
      list: (...a: unknown[]) => listMock(...a),
    },
  },
}));

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const MY_NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const signEvent = vi.fn();

const sovereignUser: PublicUser = { id: "u1", email: null, displayName: "me", npub: MY_NPUB };
const custodialUser: PublicUser = { ...sovereignUser, email: "reader@example.com" };

const MY_RATING: PublicRating = { npub: MY_NPUB, score: 4, reviewText: "A quiet marvel.", reviewDate: "2026-05-20" };
const SUMMARY: RatingsSummary = { count: 1, average: 4, ratings: [MY_RATING], weighted: null };

beforeEach(() => {
  templateMock.mockReset();
  submitMock.mockReset();
  submitCustodialMock.mockReset();
  listMock.mockReset().mockResolvedValue({ count: 0, average: null, ratings: [] });
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

// Controlled render: BookDetail-style props are the injectable seam.
function renderControl(
  props: { yourRating?: PublicRating | null; applyWrite?: (s: RatingsSummary, r: PublicRating) => void } = {},
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

describe("RatingControl — AC-1/AC-2: surfaces the user's own rating", () => {
  it("signed-in + has-rated: renders a 'Your rating' zone, stars filled to the score, the review, and the date line", async () => {
    signedIn();
    renderControl({ yourRating: MY_RATING });

    // A distinct, labelled own-rating zone.
    const zone = await screen.findByRole("group", { name: /your rating/i });
    expect(zone).toBeInTheDocument();
    // Stars filled to 4: the 4-star control reflects the current score.
    expect(screen.getByRole("button", { name: /rate 4 of 5/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /rate 3 of 5/i })).toHaveAttribute("aria-pressed", "false");
    // The existing review is surfaced (prefilled into the editable textarea).
    expect(screen.getByRole("textbox")).toHaveValue("A quiet marvel.");
    // A quiet date line, sourced from reviewDate (no Date.now in the assertion).
    expect(screen.getByText(/you rated this on/i)).toBeInTheDocument();
    expect(screen.getByText(/May 20, 2026/)).toBeInTheDocument();
  });

  it("signed-in + not-rated: empty interactive control, no date line, no filled own-stars", async () => {
    signedIn();
    renderControl({ yourRating: null });
    // No star is pre-pressed.
    for (const n of [1, 2, 3, 4, 5]) {
      expect(await screen.findByRole("button", { name: new RegExp(`rate ${n} of 5`, "i") }))
        .toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.queryByText(/you rated this on/i)).not.toBeInTheDocument();
  });
});

describe("RatingControl — AC-3: 'Your rating' zone is identical under House and Yours", () => {
  it("renders the same score, date, and review whether the active view is House or Yours", async () => {
    signedIn();
    // House view.
    trustMock.mockReturnValue({
      status: "ready", view: "house", setView: vi.fn(), personalize: vi.fn(),
      error: null, npub: MY_NPUB,
    });
    const houseRender = renderControl({ yourRating: MY_RATING });
    expect(await screen.findByRole("button", { name: /rate 4 of 5/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/May 20, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("A quiet marvel.");
    houseRender.unmount();

    // Yours view — the own-rating zone is sourced from the `yourRating` prop, not
    // the weighted set, so it is unchanged.
    trustMock.mockReturnValue({
      status: "ready", view: "yours", setView: vi.fn(), personalize: vi.fn(),
      error: null, npub: MY_NPUB,
    });
    renderControl({ yourRating: MY_RATING });
    expect(await screen.findByRole("button", { name: /rate 4 of 5/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/May 20, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("A quiet marvel.");
  });
});

describe("RatingControl — AC-4: prefill + calm 'Update rating' framing, no modal", () => {
  it("has-rated: prefilled, button reads 'Update rating', quiet already-rated line, no confirm dialog", async () => {
    signedIn();
    renderControl({ yourRating: MY_RATING });
    expect(await screen.findByRole("button", { name: /update rating/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^submit rating$/i })).not.toBeInTheDocument();
    // Exact calm copy: human-formatted date, no second sentence (the prefilled
    // stars + the "Update rating" button already signal this is an edit).
    expect(screen.getByText("You rated this on May 20, 2026.")).toBeInTheDocument();
    // Changing the score must NOT pop a confirm/overwrite modal (calm, in-place).
    fireEvent.click(screen.getByRole("button", { name: /rate 5 of 5/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/overwrite/i)).not.toBeInTheDocument();
  });

  it("not-rated: button reads 'Submit rating', no already-rated line", async () => {
    signedIn();
    renderControl({ yourRating: null });
    expect(await screen.findByRole("button", { name: /submit rating/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update rating/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/saving will update it/i)).not.toBeInTheDocument();
  });
});

describe("RatingControl — AC-5/AC-7: replace via the EXISTING per-tier write path", () => {
  it("sovereign edit: runs template → signEvent → submit (the shipped sovereign path)", async () => {
    signedIn(sovereignUser);
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [["d", "x"]], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [["d", "x"]], content: "", sig: "s" });
    submitMock.mockResolvedValue({ rating: { ...MY_RATING, score: 5 }, summary: SUMMARY });

    const applyWrite = vi.fn();
    renderControl({ yourRating: MY_RATING, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /rate 5 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /update rating/i }));

    await waitFor(() => expect(templateMock).toHaveBeenCalled());
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    await waitFor(() => expect(submitMock).toHaveBeenCalled());
    // Custodial path must not fire on a sovereign edit.
    expect(submitCustodialMock).not.toHaveBeenCalled();
  });

  it("custodial edit: runs submitCustodial with no extension (the shipped custodial path)", async () => {
    signedIn(custodialUser);
    submitCustodialMock.mockResolvedValue({ rating: { ...MY_RATING, score: 5 }, summary: SUMMARY });
    renderControl({ yourRating: MY_RATING });
    fireEvent.click(await screen.findByRole("button", { name: /rate 5 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /update rating/i }));

    await waitFor(() => expect(submitCustodialMock).toHaveBeenCalled());
    const arg = submitCustodialMock.mock.calls[0]![0] as { bookSlug: string; score: number };
    expect(arg.bookSlug).toBe("orbital");
    expect(arg.score).toBe(5);
    expect(signEvent).not.toHaveBeenCalled();
    expect(templateMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("after a successful edit, reconciles to exactly ONE current rating at the new score (no duplicate)", async () => {
    signedIn(sovereignUser);
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [["d", "x"]], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [["d", "x"]], content: "", sig: "s" });
    submitMock.mockResolvedValue({ rating: { ...MY_RATING, score: 5 }, summary: SUMMARY });

    const applyWrite = vi.fn();
    renderControl({ yourRating: MY_RATING, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /rate 5 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /update rating/i }));

    // The client reconciles by handing the saved summary + the single own rating
    // (the new score) to applyWrite. The d-tag replacement itself is the API/relay's job.
    await waitFor(() => expect(applyWrite).toHaveBeenCalled());
    const [summaryArg, ownArg] = applyWrite.mock.calls[0]! as [RatingsSummary, PublicRating];
    expect(summaryArg).toBe(SUMMARY);
    expect(ownArg.score).toBe(5);
    expect(ownArg.npub).toBe(MY_NPUB);
  });
});

describe("RatingControl — AC-6: optimistic update, reconcile, honest rollback", () => {
  it("fills the own-rating stars to the new score immediately, before the publish resolves", async () => {
    signedIn(sovereignUser);
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [["d", "x"]], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [["d", "x"]], content: "", sig: "s" });
    // A publish that never resolves during this assertion window.
    let resolveSubmit: (v: unknown) => void = () => {};
    submitMock.mockImplementation(() => new Promise((r) => { resolveSubmit = r; }));

    renderControl({ yourRating: MY_RATING });
    fireEvent.click(await screen.findByRole("button", { name: /rate 5 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /update rating/i }));

    // Optimistic: the 5-star is pressed before the promise resolves.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /rate 5 of 5/i })).toHaveAttribute("aria-pressed", "true"),
    );
    resolveSubmit({ rating: { ...MY_RATING, score: 5 }, summary: SUMMARY });
  });

  it("on publish failure, rolls back to the prior score and shows an honest in-place error (no false 'saved', no toast)", async () => {
    signedIn(sovereignUser);
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [["d", "x"]], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [["d", "x"]], content: "", sig: "s" });
    submitMock.mockRejectedValue(new ApiError(502, "publish_failed", "Could not save your rating. Try again."));

    const applyWrite = vi.fn();
    renderControl({ yourRating: MY_RATING, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /rate 5 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /update rating/i }));

    // Honest error surfaced in place…
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // …no false success confirmation…
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument();
    // …rollback: the prior score (4) is pressed again, the optimistic 5 is gone.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /rate 4 of 5/i })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: /rate 5 of 5/i })).toHaveAttribute("aria-pressed", "false");
    // A failed write must not reconcile the shared store as if it had succeeded.
    expect(applyWrite).not.toHaveBeenCalled();
  });

  it("on success, shows a quiet in-place confirmation (role=status), not an alarmist warning", async () => {
    signedIn(sovereignUser);
    templateMock.mockResolvedValue({ template: { kind: 39999, created_at: 1, tags: [["d", "x"]], content: "" } });
    signEvent.mockResolvedValue({ id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [["d", "x"]], content: "", sig: "s" });
    submitMock.mockResolvedValue({ rating: { ...MY_RATING, score: 5 }, summary: SUMMARY });

    renderControl({ yourRating: MY_RATING });
    fireEvent.click(await screen.findByRole("button", { name: /rate 5 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /update rating/i }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("RatingControl — AC-7: custodial reauth_required on edit", () => {
  it("custodial reauth_required (401): shows an honest 'sign in again' message and rolls back", async () => {
    signedIn(custodialUser);
    submitCustodialMock.mockRejectedValue(
      new ApiError(401, "reauth_required", "Please sign in again to rate."),
    );
    const applyWrite = vi.fn();
    renderControl({ yourRating: MY_RATING, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /rate 5 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /update rating/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/sign in again to update/i);
    // Rollback to the prior score; no false success.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /rate 4 of 5/i })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(applyWrite).not.toHaveBeenCalled();
  });
});

describe("RatingControl — AC-8: signed-out", () => {
  it("signed-out: no 'Your rating' zone, no prefilled control, the create-account prompt renders", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderControl({ yourRating: null });
    expect(
      await screen.findByText(/create a free account to rate this book\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute("href", "/auth");
    expect(screen.queryByRole("group", { name: /your rating/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rate 4 of 5/i })).not.toBeInTheDocument();
    expect(templateMock).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
  });
});
