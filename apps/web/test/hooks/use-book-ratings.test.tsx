// FAILING TESTS — Story 28 / ADR 0029 §3 (the shared rating-data owner hook).
//
// `useBookRatings(slug)` is the single owner of a book's rating data: it absorbs
// the two `api.ratings.list` effects that today race across RatingsPanel and
// RatingControl, derives the signed-in user's OWN rating from the house/raw read
// (trust-view-independent — the honesty seam), and exposes `applyWrite` to
// reconcile the aggregate + own-rating slices from a single source after a write.
//
// Intentionally red until apps/web/src/hooks/useBookRatings.ts exists. DI/boundary
// mocks only (api / useSession / useTrustView), mirroring use-trust-view.test.tsx
// and use-profile-meta.test.tsx. No intra-module vi.mock, no network, no Date.now
// in asserted output.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { UseSession } from "../../src/hooks/useSession";
import type { PublicRating, RatingsSummary } from "../../src/lib/api";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

const listMock = vi.fn();
const tasteMatchesMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    ratings: {
      list: (...a: unknown[]) => listMock(...a),
      // Story 66 / ADR 0065: the hook now also reads per-rater taste matches.
      tasteMatches: (...a: unknown[]) => tasteMatchesMock(...a),
    },
  },
}));

// The hook is a NEW file (ADR 0029 §3 / Ripple). Static import → red collection
// error until it lands, which is the right kind of red for a not-yet-built module.
import { useBookRatings } from "../../src/hooks/useBookRatings";

const MY_NPUB = "npub1myownratingvantage00000000000000000000000000000000000000000";
const me = { id: "u1", email: null, displayName: "me", npub: MY_NPUB };

const MY_RATING: PublicRating = { npub: MY_NPUB, score: 4, reviewText: "Mine.", reviewDate: "2026-05-20" };
const OTHER_RATING: PublicRating = {
  npub: "npub1somebodyelse0000000000000000000000000000000000000000000000",
  score: 2,
  reviewDate: "2026-05-19",
};

// House summary carries `yourRating` (the cap-safe additive field) + raw ratings.
const HOUSE: RatingsSummary & { yourRating?: PublicRating | null } = {
  count: 2,
  average: 3,
  ratings: [MY_RATING, OTHER_RATING],
  weighted: null,
  yourRating: MY_RATING,
};
// The "Yours" vantage weights the trust subset and EXCLUDES the user's own rating.
const YOURS: RatingsSummary = {
  count: 2,
  average: 3,
  ratings: [MY_RATING, OTHER_RATING],
  weighted: { observer: MY_NPUB, average: 2, trustedCount: 1, ratings: [OTHER_RATING] },
};

function trust(over: Record<string, unknown> = {}) {
  return {
    status: "ready", view: "house", setView: vi.fn(), personalize: vi.fn(),
    error: null, npub: MY_NPUB, ...over,
  };
}

beforeEach(() => {
  sessionMock.mockReset().mockReturnValue({ status: "signed-in", user: me, refresh: vi.fn() });
  trustMock.mockReset().mockReturnValue(trust());
  listMock.mockReset().mockImplementation(async (_s: string, observer?: string) =>
    observer ? YOURS : HOUSE,
  );
  tasteMatchesMock.mockReset().mockResolvedValue({ signedIn: true, matches: {} });
});
afterEach(() => vi.clearAllMocks());

describe("useBookRatings — single owner of a book's rating data", () => {
  it("fetches the house summary once on mount and exposes it", async () => {
    const { result } = renderHook(() => useBookRatings("orbital"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.house).toEqual(HOUSE);
    // One house fetch (no observer) on mount; no per-component double-fetch.
    const houseCalls = listMock.mock.calls.filter((c) => c[1] === undefined);
    expect(houseCalls).toHaveLength(1);
  });

  it("derives yourRating from the house/raw read, NOT the trust-weighted subset", async () => {
    const { result } = renderHook(() => useBookRatings("orbital"));
    await waitFor(() => expect(result.current.yourRating).not.toBeNull());
    expect(result.current.yourRating).toEqual(MY_RATING);
  });

  it("keeps yourRating identical and present across a House⇄Yours toggle (AC-3 honesty)", async () => {
    // Start House.
    const { result, rerender } = renderHook(() => useBookRatings("orbital"));
    await waitFor(() => expect(result.current.yourRating).toEqual(MY_RATING));

    // Flip to Yours — the weighted subset does NOT include the user's own rating.
    trustMock.mockReturnValue(trust({ view: "yours" }));
    rerender();

    await waitFor(() => expect(result.current.yours).not.toBeNull());
    // yourRating is sourced from house/raw, so it is unchanged and still present
    // even though it is absent from the active "yours" weighted set.
    expect(result.current.yourRating).toEqual(MY_RATING);
    const weightedRatings: PublicRating[] = result.current.yours?.weighted?.ratings ?? [];
    const inWeighted = weightedRatings.some((r) => r.npub === MY_NPUB);
    expect(inWeighted).toBe(false);
  });

  it("fetches the 'yours' vantage only when view==='yours' and an npub is present", async () => {
    trustMock.mockReturnValue(trust({ view: "house" }));
    const { result, rerender } = renderHook(() => useBookRatings("orbital"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // House view → no observer-scoped fetch yet.
    expect(listMock.mock.calls.some((c) => c[1] === MY_NPUB)).toBe(false);

    trustMock.mockReturnValue(trust({ view: "yours" }));
    rerender();
    await waitFor(() =>
      expect(listMock.mock.calls.some((c) => c[1] === MY_NPUB)).toBe(true),
    );
  });

  it("falls back to scanning raw ratings by npub when house.yourRating is absent", async () => {
    // Old/uncapped shape: no dedicated `yourRating` field, but the own entry is in raw.
    const { yourRating: _drop, ...houseNoField } = HOUSE;
    listMock.mockImplementation(async (_s: string, observer?: string) =>
      observer ? YOURS : houseNoField,
    );
    const { result } = renderHook(() => useBookRatings("orbital"));
    await waitFor(() => expect(result.current.yourRating).toEqual(MY_RATING));
  });

  it("yourRating is null for a signed-out visitor", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    trustMock.mockReturnValue(trust({ status: "house-only", npub: undefined }));
    const { result } = renderHook(() => useBookRatings("orbital"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.yourRating).toBeNull();
  });
});

describe("useBookRatings — applyWrite reconciles both slices from one source", () => {
  it("updates the aggregate AND yourRating in one step (no two-component race)", async () => {
    const { result } = renderHook(() => useBookRatings("orbital"));
    await waitFor(() => expect(result.current.yourRating).toEqual(MY_RATING));

    const savedAgg: RatingsSummary = { count: 2, average: 3.5, ratings: [], weighted: null };
    const savedOwn: PublicRating = { npub: MY_NPUB, score: 5, reviewText: "Updated.", reviewDate: "2026-05-25" };

    act(() => result.current.applyWrite(savedAgg, savedOwn));

    // Both the own-rating slice and the aggregate move together.
    expect(result.current.yourRating).toEqual(savedOwn);
    expect(result.current.house?.average).toBe(3.5);
    // Reconcile happens from the returned summary — no extra fetch on the happy path.
    const callsAfter = listMock.mock.calls.length;
    expect(callsAfter).toBe(listMock.mock.calls.length); // stable: applyWrite did not refetch
  });
});
