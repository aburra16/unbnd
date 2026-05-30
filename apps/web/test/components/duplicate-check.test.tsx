import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DuplicateCheck } from "../../src/components/DuplicateCheck";

const searchMock = vi.fn();
vi.mock("../../src/lib/api", () => ({ api: { search: (...a: unknown[]) => searchMock(...a) } }));

function render_(onProceed = vi.fn()) {
  render(
    <MemoryRouter>
      <DuplicateCheck onProceed={onProceed} />
    </MemoryRouter>,
  );
  return onProceed;
}
const input = () => screen.getByLabelText(/search the catalog for an existing book/i);

beforeEach(() => searchMock.mockReset());
afterEach(() => vi.clearAllMocks());

describe("DuplicateCheck", () => {
  it("shows matches for a query and 'add anyway' proceeds", async () => {
    searchMock.mockResolvedValue({ hits: [{ slug: "ol-a", title: "Alpha", authorName: "Ada", format: "reference" }], total: 1, offset: 0, limit: 8 });
    const onProceed = render_();
    fireEvent.change(input(), { target: { value: "alpha" } });
    expect(await screen.findByText(/Possible matches/i)).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add it anyway/i }));
    expect(onProceed).toHaveBeenCalledWith({ title: "alpha" });
  });

  it("no match → all-clear CTA proceeds with the title", async () => {
    searchMock.mockResolvedValue({ hits: [], total: 0, offset: 0, limit: 8 });
    const onProceed = render_();
    fireEvent.change(input(), { target: { value: "brand new book" } });
    const add = await screen.findByRole("button", { name: /add this book/i });
    fireEvent.click(add);
    expect(onProceed).toHaveBeenCalledWith({ title: "brand new book" });
  });

  it("does not search for a single character", async () => {
    render_();
    fireEvent.change(input(), { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 260));
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("ISBN exact match shows the firm 'already on Unbnd' banner", async () => {
    searchMock.mockResolvedValue({
      hits: [{ slug: "ol-a", title: "Alpha", authorName: "Ada", format: "reference", isbn13: "9780802161543" }],
      total: 1, offset: 0, limit: 8,
    });
    render_();
    fireEvent.change(input(), { target: { value: "978-0-8021-6154-3" } });
    const link = await screen.findByRole("link", { name: /Open Alpha/i });
    expect(link).toHaveAttribute("href", "/book/ol-a");
    expect(screen.getByRole("alert")).toHaveTextContent(/already on Unbnd/i);
  });
});
