// MIGRATED — Story 28 / ADR 0029 §3 (RatingsPanel is now CONTROLLED).
//
// Before: RatingsPanel fetched its own `house` summary on mount and a second
// `yours` summary on the toggle (the double-fetch race ADR 0029 removes). It
// mocked `api.ratings.list` and asserted the component fetched on mount.
//
// After: the shared `useBookRatings(slug)` hook (owned by BookDetail) does the
// fetching; RatingsPanel receives `house`/`yours`/`status` as PROPS and renders
// from them. `useTrustView` still owns the House⇄Yours toggle (view/setView/
// personalize/status), but the panel no longer calls `api.ratings.list`.
//
// The SAME behaviors the old file protected survive, re-expressed against the
// controlled props: house weighted render, raw fallback, Personalize trigger,
// the building note, the Yours vantage render + label, and the toggle calling
// setView. The single behavior that moved out — "fetches the user's vantage"
// (the `api.ratings.list(slug, npub)` call) — now lives in the hook and is
// covered by use-book-ratings.test.tsx ("fetches the 'yours' vantage only when
// view==='yours' and an npub is present"); here we assert the panel RENDERS the
// `yours` slice it is handed (the behavior the old assertion ultimately guarded).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RatingsPanel } from "../../src/components/RatingsPanel";
import type { RatingsSummary } from "../../src/lib/api";

// useTrustView still drives the toggle/personalize chrome; it no longer drives
// any fetch (the hook does).
const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

// `api.ratings.list` is kept in the boundary mock for parity with the committed
// files. The CONTROLLED panel no longer calls it (BookDetail's useBookRatings
// owns the read); keeping it stubbed means the not-yet-controlled component's
// stale self-fetch resolves locally instead of escaping to the network — so the
// red is the clean "renders from its own state, not the props" failure, not a
// connection error. Once the fetch effects are dropped, the mock is unused.
const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({ api: { ratings: { list: (...a: unknown[]) => listMock(...a) } } }));

const houseWeighted: RatingsSummary = {
  count: 3, average: 3, ratings: [],
  weighted: { observer: "npub1nos", average: 4.5, trustedCount: 2, ratings: [] },
};
const yoursWeighted: RatingsSummary = {
  count: 3, average: 3, ratings: [],
  weighted: { observer: "npub1me", average: 2, trustedCount: 1, ratings: [] },
};

function trust(over: Record<string, unknown> = {}) {
  return {
    status: "house-only", view: "house", setView: vi.fn(), personalize: vi.fn(),
    error: null, npub: undefined, ...over,
  };
}

// Controlled render: BookDetail-style slices (house/yours/status) are the seam.
function renderPanel(
  props: {
    house?: RatingsSummary | null;
    yours?: RatingsSummary | null;
    status?: "loading" | "ready" | "error";
  } = {},
) {
  return render(
    <RatingsPanel
      slug="b1"
      house={props.house ?? houseWeighted}
      yours={props.yours ?? null}
      status={props.status ?? "ready"}
    />,
  );
}

beforeEach(() => {
  trustMock.mockReset();
  listMock.mockReset().mockResolvedValue({ count: 0, average: null, ratings: [], weighted: null });
});
afterEach(() => vi.clearAllMocks());

describe("RatingsPanel — controlled by useBookRatings", () => {
  it("house-only: weighted house view, no controls", async () => {
    trustMock.mockReturnValue(trust());
    renderPanel({ house: houseWeighted });
    expect(await screen.findByText(/Unbnd house view/i)).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /yours/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /personalize/i })).not.toBeInTheDocument();
  });

  it("falls back to raw when there's no trusted signal", async () => {
    trustMock.mockReturnValue(trust());
    renderPanel({ house: { count: 2, average: 3, ratings: [], weighted: null } });
    expect(await screen.findByText("3.0")).toBeInTheDocument();
    expect(screen.getByText(/2 ratings/i)).toBeInTheDocument();
  });

  it("status=none: shows Personalize and triggers it", async () => {
    const personalize = vi.fn();
    trustMock.mockReturnValue(trust({ status: "none", personalize }));
    renderPanel({ house: houseWeighted });
    const btn = await screen.findByRole("button", { name: /personalize/i });
    fireEvent.click(btn);
    expect(personalize).toHaveBeenCalled();
  });

  it("status=building: shows the building note", async () => {
    trustMock.mockReturnValue(trust({ status: "building" }));
    renderPanel({ house: houseWeighted });
    expect(await screen.findByText(/Building your web of trust/i)).toBeInTheDocument();
  });

  it("loading status: shows the loading note (the hook is still fetching)", () => {
    trustMock.mockReturnValue(trust());
    renderPanel({ house: null, status: "loading" });
    expect(screen.getByText(/Loading ratings/i)).toBeInTheDocument();
  });

  it("ready + Yours: renders the user's vantage slice it is handed and labels it", async () => {
    trustMock.mockReturnValue(
      trust({ status: "ready", view: "yours", npub: "npub1me" }),
    );
    // The hook (not the panel) fetches `yours`; the panel renders the slice prop.
    renderPanel({ house: houseWeighted, yours: yoursWeighted });
    expect(await screen.findByText(/Your perspective/i)).toBeInTheDocument();
    expect(screen.getByText("2.0")).toBeInTheDocument();
  });

  it("ready: House/Yours toggle calls setView", async () => {
    const setView = vi.fn();
    trustMock.mockReturnValue(trust({ status: "ready", view: "house", npub: "npub1me", setView }));
    renderPanel({ house: houseWeighted });
    fireEvent.click(await screen.findByRole("tab", { name: /yours/i }));
    expect(setView).toHaveBeenCalledWith("yours");
  });
});
