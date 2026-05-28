import { Link } from "react-router-dom";
import "./BookCard.css";

export type BookSignal = {
  label: string;
  tone: "positive" | "negative" | "sovereign" | "amber";
};

export type Book = {
  slug: string;
  title: string;
  author: string;
  rating: number;
  coverFrom: string;
  coverTo: string;
  coverInk: string;
  signals?: BookSignal[];
};

type Props = {
  book: Book;
  size?: "shelf" | "grid";
};

export function BookCard({ book, size = "shelf" }: Props) {
  const ratingText = book.rating.toFixed(1);
  const showSignals = size === "grid" && book.signals && book.signals.length > 0;
  return (
    <Link className={`book book-${size}`} to={`/book/${book.slug}`}>
      <div
        className="book-cover"
        style={{
          background: `linear-gradient(155deg, ${book.coverFrom}, ${book.coverTo})`,
        }}
      >
        <span className="book-cover-title" style={{ color: book.coverInk }}>
          {book.title}
        </span>
      </div>
      <div className="book-meta">
        <div className="book-title">{book.title}</div>
        <div className="book-author">{book.author}</div>
        <div className="book-rating" aria-label={`Rated ${ratingText}`}>
          <span aria-hidden="true">★</span> {ratingText}
        </div>
        {showSignals && (
          <div className="book-signals">
            {book.signals!.map((s, i) => (
              <span key={i} className={`book-signal book-signal-${s.tone}`}>
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
