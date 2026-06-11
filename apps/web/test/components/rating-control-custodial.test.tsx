// MIGRATED — Story 28 / ADR 0029 §3/§4 (RatingControl is now CONTROLLED).
//
// Before: the control fetched its own summary via `api.ratings.list` on mount
// and rendered `<RatingControl bookSlug>` with no rating props.
//
// After: BookDetail passes `yourRating` + `applyWrite`; the control no longer
// self-fetches. This file keeps the custodial server-side-submit contract the
// original protected (custodial first-rating path: submitCustodial, no
// extension, no sovereign endpoints), re-expressed against the controlled
// props. The custodial reauth_required edit case lives in
// rating-control-your-rating.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RatingControl } from "../../src/components/RatingControl";
import type { UseSession } from "../../src/hooks/useSession";
import type { PublicRating, RatingsSummary } from "../../src/lib/api";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

const templateMock = vi.fn();
const submitMock = vi.fn();
const submitCustodialMock = vi.fn();
// `list` kept in the boundary mock for parity with the committed new files; the
// controlled control no longer calls it (useBookRatings owns the read).
const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    ratings: {
      template: (...a: unknown[]) => templateMock(...a),
      submit: (...a: unknown[]) => submitMock(...a),
      submitCustodial: (...a: unknown[]) => submitCustodialMock(...a),
      list: (...a: unknown[]) => listMock(...a),
    },
  },
}));

const CUSTODIAL_NPUB = "npub1readerxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxq9";
const signEvent = vi.fn();
const custodialUser = {
  id: "u1",
  email: "reader@example.com",
  displayName: "reader",
  npub: CUSTODIAL_NPUB,
};

beforeEach(() => {
  templateMock.mockReset();
  submitMock.mockReset();
  submitCustodialMock.mockReset();
  listMock.mockReset().mockResolvedValue({ count: 0, average: null, ratings: [], weighted: null });
  signEvent.mockReset();
  sessionMock.mockReset();
  trustMock.mockReset().mockReturnValue({
    status: "ready", view: "house", setView: vi.fn(), personalize: vi.fn(),
    error: null, npub: CUSTODIAL_NPUB,
  });
  (window as unknown as { nostr: unknown }).nostr = { signEvent };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
  vi.clearAllMocks();
});

function renderControl(
  props: {
    yourRating?: PublicRating | null;
    applyWrite?: (s: RatingsSummary, r: PublicRating | null) => void;
  } = {},
) {
  const applyWrite = props.applyWrite ?? vi.fn();
  return render(
    <MemoryRouter>
      <RatingControl bookSlug="orbital" yourRating={props.yourRating ?? null} applyWrite={applyWrite} />
    </MemoryRouter>,
  );
}

describe("RatingControl — custodial (email) session, first rating", () => {
  it("rates via server-side submit, with no extension signing", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    submitCustodialMock.mockResolvedValue({
      rating: { npub: CUSTODIAL_NPUB, score: 4, reviewDate: "2026-05-29" },
      summary: { count: 1, average: 4, ratings: [], weighted: null },
    });

    renderControl({ yourRating: null });
    fireEvent.click(await screen.findByRole("button", { name: /rate 4 of 5/i }));
    // Never-rated ⇒ the first-rating label.
    fireEvent.click(screen.getByRole("button", { name: /submit rating/i }));

    await waitFor(() => expect(submitCustodialMock).toHaveBeenCalled());
    const arg = submitCustodialMock.mock.calls[0]![0] as {
      bookSlug: string;
      score: number;
    };
    expect(arg.bookSlug).toBe("orbital");
    expect(arg.score).toBe(4);
    // Custodial path must NOT touch the extension or the sovereign endpoints.
    expect(signEvent).not.toHaveBeenCalled();
    expect(templateMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("reconciles a successful custodial rating through applyWrite (no self-fetch / setSummary)", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    const SUMMARY: RatingsSummary = { count: 1, average: 4, ratings: [], weighted: null };
    submitCustodialMock.mockResolvedValue({
      rating: { npub: CUSTODIAL_NPUB, score: 4, reviewDate: "2026-05-29" },
      summary: SUMMARY,
    });

    const applyWrite = vi.fn();
    renderControl({ yourRating: null, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /rate 4 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit rating/i }));

    await waitFor(() => expect(applyWrite).toHaveBeenCalled());
    const [summaryArg, ownArg] = applyWrite.mock.calls[0]! as [RatingsSummary, PublicRating];
    expect(summaryArg).toBe(SUMMARY);
    expect(ownArg.score).toBe(4);
  });
});
