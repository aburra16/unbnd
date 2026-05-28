import "./BookCard.css";

export type Book = {
  slug: string;
  title: string;
  author: string;
  rating: number;
  coverFrom: string;
  coverTo: string;
  coverInk: string;
};

type Props = {
  book: Book;
  size?: "shelf" | "grid";
};

export function BookCard({ book, size = "shelf" }: Props) {
  const ratingText = book.rating.toFixed(1);
  return (
    <a className={`book book-${size}`} href={`/book/${book.slug}`}>
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
      </div>
    </a>
  );
}
