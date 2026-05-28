import { BookCard, type Book } from "./BookCard";
import "./BookGrid.css";

type Props = {
  books: Book[];
};

export function BookGrid({ books }: Props) {
  return (
    <div className="bgrid">
      {books.map((b) => (
        <BookCard book={b} key={b.slug} size="grid" />
      ))}
    </div>
  );
}
