import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RatingsPanel } from "../../src/components/RatingsPanel";
import type { UseSession } from "../../src/hooks/useSession";
import type { RatingsSummary } from "../../src/lib/api";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({ api: { ratings: { list: (...a: unknown[]) => listMock(...a) } } }));

const sovereign = { id: "u", email: null, displayName: "n", npub: "npub1me" };

beforeEach(() => {
  sessionMock.mockReset();
  listMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

const houseWeighted: RatingsSummary = {
  count: 3, average: 3, ratings: [],
  weighted: { observer: "npub1nos", average: 4.5, trustedCount: 2, ratings: [] },
};

describe("RatingsPanel", () => {
  it("signed-out: shows the house view, no toggle", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue(houseWeighted);
    render(<RatingsPanel slug="b1" />);
    expect(await screen.findByText(/Unbnd house view/i)).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument(); // weighted avg
    expect(screen.queryByRole("tab", { name: /yours/i })).not.toBeInTheDocument();
  });

  it("falls back to raw for the house view when there's no trusted signal", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    listMock.mockResolvedValue({ count: 2, average: 3, ratings: [], weighted: null });
    render(<RatingsPanel slug="b1" />);
    expect(await screen.findByText("3.0")).toBeInTheDocument();
    expect(screen.getByText(/2 ratings/i)).toBeInTheDocument();
  });

  it("sovereign: toggling to Yours fetches their vantage and shows it", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereign, refresh: vi.fn() });
    listMock.mockImplementation(async (_slug: string, observer?: string) =>
      observer
        ? { count: 3, average: 3, ratings: [], weighted: { observer: "npub1me", average: 2, trustedCount: 1, ratings: [] } }
        : houseWeighted,
    );
    render(<RatingsPanel slug="b1" />);
    expect(await screen.findByText("4.5")).toBeInTheDocument(); // house first
    fireEvent.click(screen.getByRole("tab", { name: /yours/i }));
    await waitFor(() => expect(listMock).toHaveBeenCalledWith("b1", "npub1me"));
    expect(await screen.findByText(/Your perspective/i)).toBeInTheDocument();
    expect(screen.getByText("2.0")).toBeInTheDocument();
  });

  it("sovereign Yours with no trusted raters reads honestly", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereign, refresh: vi.fn() });
    listMock.mockImplementation(async (_slug: string, observer?: string) =>
      observer ? { count: 3, average: 3, ratings: [], weighted: null } : houseWeighted,
    );
    render(<RatingsPanel slug="b1" />);
    await screen.findByText("4.5");
    fireEvent.click(screen.getByRole("tab", { name: /yours/i }));
    expect(await screen.findByText(/No ratings from your trust network yet/i)).toBeInTheDocument();
  });
});
