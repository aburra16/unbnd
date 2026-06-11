// MIGRATED — Story 28 / ADR 0029 §3/§4 (RatingControl is now CONTROLLED).
//
// Before: RatingControl fetched its own summary on mount via `api.ratings.list`
// and reconciled a successful write with `setSummary`. It mocked
// `api.ratings.list` and rendered `<RatingControl bookSlug>` with no rating
// props.
//
// After: BookDetail owns the read through `useBookRatings` and passes
// `yourRating` (the trust-view-independent own read) + `applyWrite` (the
// optimistic + reconcile entry point) as PROPS. The control no longer calls
// `api.ratings.list`; on a successful write it calls `applyWrite` instead of
// `setSummary`.
//
// This file keeps the NEVER-RATED / signed-out / custodial-renders contracts the
// original protected (so they stay green after the refactor); the prefill /
// "Update rating" / optimistic-rollback / reauth cases live in the sibling
// rating-control-your-rating.test.tsx. Boundary mocks only (api / useSession /
// useTrustView); role-scoped queries; no Date.now in assertions.
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

// The control may read useTrustView for the active view; it must not drive the
// own-rating zone (the honesty rule), so a stable mock is enough here.
const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

const templateMock = vi.fn();
const submitMock = vi.fn();
const submitCustodialMock = vi.fn();
// `list` is kept in the boundary mock for parity with the committed new files
// (rating-control-your-rating.test.tsx). The CONTROLLED control no longer calls
// it (BookDetail's useBookRatings owns the read); keeping it avoids a TypeError
// masking the real red (missing props / not-controlled), and it stays unused
// once the self-fetch effect is dropped.
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

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const MY_NPUB = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const signEvent = vi.fn();

const sovereignUser = {
  id: "u1",
  email: null,
  displayName: "npub1n0ewa…rk23",
  npub: MY_NPUB,
};
const custodialUser = { ...sovereignUser, email: "reader@example.com" };

beforeEach(() => {
  templateMock.mockReset();
  submitMock.mockReset();
  submitCustodialMock.mockReset();
  listMock.mockReset().mockResolvedValue({ count: 0, average: null, ratings: [], weighted: null });
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

// Controlled render: BookDetail passes `yourRating` + `applyWrite`. The
// never-rated default (yourRating=null) exercises the "Submit rating" path.
function renderControl(
  props: {
    yourRating?: PublicRating | null;
    applyWrite?: (s: RatingsSummary, r: PublicRating | null) => void;
  } = {},
) {
  const applyWrite = props.applyWrite ?? vi.fn();
  const utils = render(
    <MemoryRouter>
      <RatingControl bookSlug="orbital" yourRating={props.yourRating ?? null} applyWrite={applyWrite} />
    </MemoryRouter>,
  );
  return { ...utils, applyWrite };
}

describe("RatingControl — sovereign session (first rating, never-rated)", () => {
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
      summary: { count: 1, average: 4, ratings: [], weighted: null },
    });

    renderControl({ yourRating: null });
    fireEvent.click(await screen.findByRole("button", { name: /rate 4 of 5/i }));
    // Never-rated ⇒ the first-rating label.
    fireEvent.click(screen.getByRole("button", { name: /submit rating/i }));

    await waitFor(() => expect(templateMock).toHaveBeenCalled());
    await waitFor(() => expect(signEvent).toHaveBeenCalled());
    const signedArg = signEvent.mock.calls[0]![0] as { kind: number };
    expect(signedArg.kind).toBe(39999);
    await waitFor(() => expect(submitMock).toHaveBeenCalled());
  });

  it("reconciles a successful first rating through applyWrite (no self-fetch / setSummary)", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: sovereignUser,
      refresh: vi.fn(),
    });
    templateMock.mockResolvedValue({
      template: { kind: 39999, created_at: 1, tags: [["d", "x"]], content: "" },
    });
    signEvent.mockResolvedValue({
      id: "e", pubkey: HEX, kind: 39999, created_at: 1, tags: [["d", "x"]], content: "", sig: "s",
    });
    const SUMMARY: RatingsSummary = { count: 1, average: 4, ratings: [], weighted: null };
    submitMock.mockResolvedValue({
      rating: { npub: sovereignUser.npub, score: 4, reviewDate: "2026-05-27" },
      summary: SUMMARY,
    });

    const applyWrite = vi.fn();
    renderControl({ yourRating: null, applyWrite });
    fireEvent.click(await screen.findByRole("button", { name: /rate 4 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit rating/i }));

    // The owner reconciles via applyWrite — the panel/control can never disagree.
    await waitFor(() => expect(applyWrite).toHaveBeenCalled());
    const [summaryArg, ownArg] = applyWrite.mock.calls[0]! as [RatingsSummary, PublicRating];
    expect(summaryArg).toBe(SUMMARY);
    expect(ownArg.score).toBe(4);
  });
});

describe("RatingControl — gating", () => {
  it("shows the create-account prompt and does not call the API when signed out (Story 73)", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderControl({ yourRating: null });
    expect(
      await screen.findByText(/create a free account to rate this book\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute("href", "/auth");
    expect(templateMock).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
  });

  it("gives a custodial user the rating control (no placeholder, no extension signing)", async () => {
    // 5b: custodial users rate via server-side signing. The full custodial
    // submit flow is covered in rating-control-custodial.test.tsx; here we just
    // assert the control renders for them and the extension isn't touched.
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    renderControl({ yourRating: null });
    expect(
      await screen.findByRole("button", { name: /rate 5 of 5/i }),
    ).toBeInTheDocument();
    expect(signEvent).not.toHaveBeenCalled();
  });
});
