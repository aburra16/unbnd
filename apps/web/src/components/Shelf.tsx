import { BookCard, type Book } from "./BookCard";
import "./Shelf.css";

type Props = {
  title: string;
  books: Book[];
  seeAllHref?: string;
};

export function Shelf({ title, books, seeAllHref }: Props) {
  return (
    <section className="shelf-section">
      <header className="shelf-header">
        <h2 className="shelf-title">{title}</h2>
        {seeAllHref && (
          <a className="shelf-seeall" href={seeAllHref}>
            See all →
          </a>
        )}
      </header>
      <div className="shelf-rail" role="list">
        {books.map((book) => (
          <div role="listitem" key={book.slug}>
            <BookCard book={book} />
          </div>
        ))}
      </div>
    </section>
  );
}
