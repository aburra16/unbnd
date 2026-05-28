import { Link } from "react-router-dom";
import { GenrePill, SignalPill } from "./Pill";
import type { BookRecord } from "../data/book-fixtures";
import "./BookHeader.css";

type Props = {
  book: BookRecord;
};

export function BookHeader({ book }: Props) {
  return (
    <header className="bh">
      <div
        className="bh-cover"
        style={{
          background: `linear-gradient(155deg, ${book.coverFrom}, ${book.coverTo})`,
        }}
      >
        <span className="bh-cover-title" style={{ color: book.coverInk }}>
          {book.title}
        </span>
      </div>
      <div className="bh-info">
        <h1 className="bh-title">{book.title}</h1>
        <p className="bh-author">
          by{" "}
          <Link to={`/author/${slugify(book.author)}`}>{book.author}</Link>
        </p>
        <div className="bh-meta">
          <span>{book.publishYear}</span>
          <span>{book.pageCount} pages</span>
          <span>{book.language}</span>
          <span className="bh-meta-isbn">ISBN {book.isbn13}</span>
        </div>
        <div className="bh-tags">
          {book.genreTags.map((tag) => (
            <GenrePill
              key={tag.slug}
              label={tag.label}
              color={tag.color}
              confidence={tag.confidence}
            />
          ))}
        </div>
        <div className="bh-tags">
          {book.qualitySignals.map((s) => (
            <SignalPill key={s.slug} label={s.label} tone={s.tone} />
          ))}
        </div>
        <p className="bh-blurb">{book.blurb}</p>
      </div>
    </header>
  );
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
