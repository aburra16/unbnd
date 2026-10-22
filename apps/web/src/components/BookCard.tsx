import { Link } from "react-router-dom";
import { useImageFallback } from "../hooks/useImageFallback";
import "./BookCard.css";

export type BookSignal = {
  label: string;
  tone: "positive" | "negative" | "sovereign" | "amber";
};

export type Book = {
  slug: string;
  title: string;
  author: string;
  rating?: number;
  coverUrl?: string;
  /** The cover through Unbnd's image proxy (ADR 0099), tried before coverUrl. */
  coverImage?: string;
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
  const ratingText =
    typeof book.rating === "number" ? book.rating.toFixed(1) : null;
  const showSignals = size === "grid" && book.signals && book.signals.length > 0;
  const cover = useImageFallback(book.coverImage, book.coverUrl);
  return (
    <Link className={`book book-${size}`} to={`/book/${book.slug}`}>
      {cover.src ? (
        <div className="book-cover">
          <img key={cover.src} className="book-cover-img" src={cover.src} alt="" loading="lazy" onError={cover.onError} />
        </div>
      ) : (
        <div
          className="book-cover"
          style={{
            background: `linear-gradient(155deg, ${book.coverFrom}, ${book.coverTo})`,
          }}
        >
          {/* Decorative spine echo of the title. Rendered via CSS
              `content: attr(data-title)` (not a DOM text node) so the card
              exposes exactly ONE queryable/announced title — the semantic
              caption below — while keeping the cover's visual unchanged. */}
          <span
            className="book-cover-title"
            style={{ color: book.coverInk }}
            data-title={book.title}
            aria-hidden="true"
          />
        </div>
      )}
      <div className="book-meta">
        <div className="book-title">{book.title}</div>
        <div className="book-author">{book.author}</div>
        {ratingText !== null && (
          <div className="book-rating" aria-label={`Rated ${ratingText}`}>
            <span aria-hidden="true">★</span> {ratingText}
          </div>
        )}
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
