// FAILING TESTS — Story 106 / ADR 0095 §2: a search shows its top 100, and
// the count says so when there are more.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Search } from "../../src/routes/Search";

const searchMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: { search: (...a: unknown[]) => searchMock(...a) },
}));
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => ({ status: "anonymous", user: null }) }));

const hit = (i: number) => ({ slug: `b${i}`, title: `Book ${i}`, authorName: "A", format: "reference" });

function renderAt(q: string) {
  return render(
    <MemoryRouter initialEntries={[`/search?q=${q}`]}>
      <Search />
    </MemoryRouter>,
  );
}

beforeEach(() => searchMock.mockReset());

describe("Search: the count", () => {
  it("reads 100+ when the list is full", async () => {
    searchMock.mockResolvedValue({ hits: Array.from({ length: 20 }, (_, i) => hit(i)), total: 100, offset: 0, limit: 20, capped: true });
    renderAt("island");
    expect(await screen.findByText("100+ results for “island”")).toBeInTheDocument();
  });

  it("reads the exact count otherwise", async () => {
    searchMock.mockResolvedValue({ hits: [hit(1), hit(2), hit(3)], total: 3, offset: 0, limit: 20, capped: false });
    renderAt("island");
    expect(await screen.findByText("3 results for “island”")).toBeInTheDocument();
  });
});
