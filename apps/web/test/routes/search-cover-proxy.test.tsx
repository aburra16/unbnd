// Story 111 review round 1 (B3): search results use the proxied cover.
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Search } from "../../src/routes/Search";

const searchMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: { search: (...a: unknown[]) => searchMock(...a) },
}));
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => ({ status: "anonymous", user: null }) }));

describe("Search: covers", () => {
  it("a result shows the proxied cover", async () => {
    searchMock.mockResolvedValue({
      hits: [{ slug: "b1", title: "Book", authorName: "A", format: "reference", coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg", coverImage: "/img/s/cover/x.webp" }],
      total: 1, offset: 0, limit: 24, capped: false,
    });
    render(
      <MemoryRouter initialEntries={["/search?q=book"]}>
        <Search />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("img.book-cover-img")?.getAttribute("src")).toBe("/img/s/cover/x.webp"));
  });
});
