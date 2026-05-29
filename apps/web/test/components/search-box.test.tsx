import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SearchBox } from "../../src/components/SearchBox";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const searchMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  api: { search: (...a: unknown[]) => searchMock(...a) },
}));

beforeEach(() => {
  navigateMock.mockReset();
  searchMock.mockReset().mockResolvedValue({
    hits: [
      { slug: "ol-a", title: "Alpha", authorName: "Ada", format: "reference" },
    ],
    total: 1,
    offset: 0,
    limit: 6,
  });
});
afterEach(() => vi.clearAllMocks());

function renderBox() {
  render(
    <MemoryRouter>
      <SearchBox />
    </MemoryRouter>,
  );
}

describe("SearchBox", () => {
  it("debounce-queries and shows a dropdown of hits for 2+ chars", async () => {
    renderBox();
    fireEvent.change(screen.getByLabelText(/search the catalog/i), { target: { value: "al" } });
    await waitFor(() => expect(searchMock).toHaveBeenCalledWith("al", { limit: 6 }));
    expect(await screen.findByRole("option", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("does not query for a single character", async () => {
    renderBox();
    fireEvent.change(screen.getByLabelText(/search the catalog/i), { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 250));
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("navigates to a hit's book page on selection", async () => {
    renderBox();
    fireEvent.change(screen.getByLabelText(/search the catalog/i), { target: { value: "alpha" } });
    const opt = await screen.findByRole("option", { name: /Alpha/ });
    fireEvent.mouseDown(opt);
    expect(navigateMock).toHaveBeenCalledWith("/book/ol-a");
  });

  it("navigates to the results page on submit (Enter)", async () => {
    renderBox();
    const input = screen.getByLabelText(/search the catalog/i);
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.submit(input.closest("form")!);
    expect(navigateMock).toHaveBeenCalledWith("/search?q=alpha");
  });
});
