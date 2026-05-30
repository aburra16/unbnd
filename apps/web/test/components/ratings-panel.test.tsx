import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RatingsPanel } from "../../src/components/RatingsPanel";
import type { RatingsSummary } from "../../src/lib/api";

const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({ api: { ratings: { list: (...a: unknown[]) => listMock(...a) } } }));

const houseWeighted: RatingsSummary = {
  count: 3, average: 3, ratings: [],
  weighted: { observer: "npub1nos", average: 4.5, trustedCount: 2, ratings: [] },
};

function trust(over: Record<string, unknown> = {}) {
  return {
    status: "house-only", view: "house", setView: vi.fn(), personalize: vi.fn(),
    error: null, npub: undefined, ...over,
  };
}

beforeEach(() => {
  trustMock.mockReset();
  listMock.mockReset().mockResolvedValue(houseWeighted);
});
afterEach(() => vi.clearAllMocks());

describe("RatingsPanel", () => {
  it("house-only: weighted house view, no controls", async () => {
    trustMock.mockReturnValue(trust());
    render(<RatingsPanel slug="b1" />);
    expect(await screen.findByText(/Unbnd house view/i)).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /yours/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /personalize/i })).not.toBeInTheDocument();
  });

  it("falls back to raw when there's no trusted signal", async () => {
    trustMock.mockReturnValue(trust());
    listMock.mockResolvedValue({ count: 2, average: 3, ratings: [], weighted: null });
    render(<RatingsPanel slug="b1" />);
    expect(await screen.findByText("3.0")).toBeInTheDocument();
    expect(screen.getByText(/2 ratings/i)).toBeInTheDocument();
  });

  it("status=none: shows Personalize and triggers it", async () => {
    const personalize = vi.fn();
    trustMock.mockReturnValue(trust({ status: "none", personalize }));
    render(<RatingsPanel slug="b1" />);
    const btn = await screen.findByRole("button", { name: /personalize/i });
    fireEvent.click(btn);
    expect(personalize).toHaveBeenCalled();
  });

  it("status=building: shows the building note", async () => {
    trustMock.mockReturnValue(trust({ status: "building" }));
    render(<RatingsPanel slug="b1" />);
    expect(await screen.findByText(/Building your web of trust/i)).toBeInTheDocument();
  });

  it("ready + Yours: fetches the user's vantage and labels it", async () => {
    trustMock.mockReturnValue(
      trust({ status: "ready", view: "yours", npub: "npub1me" }),
    );
    listMock.mockImplementation(async (_s: string, observer?: string) =>
      observer
        ? { count: 3, average: 3, ratings: [], weighted: { observer: "npub1me", average: 2, trustedCount: 1, ratings: [] } }
        : houseWeighted,
    );
    render(<RatingsPanel slug="b1" />);
    await waitFor(() => expect(listMock).toHaveBeenCalledWith("b1", "npub1me"));
    expect(await screen.findByText(/Your perspective/i)).toBeInTheDocument();
    expect(screen.getByText("2.0")).toBeInTheDocument();
  });

  it("ready: House/Yours toggle calls setView", async () => {
    const setView = vi.fn();
    trustMock.mockReturnValue(trust({ status: "ready", view: "house", npub: "npub1me", setView }));
    render(<RatingsPanel slug="b1" />);
    fireEvent.click(await screen.findByRole("tab", { name: /yours/i }));
    expect(setView).toHaveBeenCalledWith("yours");
  });
});
