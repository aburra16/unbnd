// Story 111 / ADR 0099 §5: covers prefer the proxied image and fall back.
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookCard } from "../../src/components/BookCard";
import { toCardBook } from "../../src/lib/view-model";

const book = {
  slug: "ol-ol1w",
  title: "A Book",
  authorName: "An Author",
  coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
  coverImage: "/img/sig/cover/abc.webp",
} as never;

describe("covers through the proxy", () => {
  it("the card shape carries the proxied cover", () => {
    expect(toCardBook(book).coverImage).toBe("/img/sig/cover/abc.webp");
  });

  it("a card shows the proxied cover, then the original, then the gradient", () => {
    render(
      <MemoryRouter>
        <BookCard book={toCardBook(book)} />
      </MemoryRouter>,
    );
    let img = document.querySelector("img.book-cover-img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/img/sig/cover/abc.webp");
    fireEvent.error(img);
    img = document.querySelector("img.book-cover-img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://covers.openlibrary.org/b/id/1-L.jpg");
    fireEvent.error(img);
    expect(document.querySelector("img.book-cover-img")).toBeNull();
  });
});
