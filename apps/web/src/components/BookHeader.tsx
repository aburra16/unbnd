import { GenrePill } from "./Pill";
import type { PublicBook, TagConsensus } from "../lib/api";
import { coverGradient } from "../lib/view-model";
import "./BookHeader.css";

type Props = {
  book: PublicBook;
  genres: TagConsensus[];
  styles: TagConsensus[];
  /** Section state from the tags read (ADR 0025): trusted vs community consensus. */
  weighted?: boolean;
};

export function BookHeader({ book, genres, styles, weighted }: Props) {
  const g = coverGradient(book.slug);
  const chips = [...genres, ...styles];
  return (
    <header className="bh">
      {book.coverUrl ? (
        <div className="bh-cover bh-cover-img">
          <img src={book.coverUrl} alt="" loading="lazy" />
        </div>
      ) : (
        <div
          className="bh-cover"
          style={{ background: `linear-gradient(155deg, ${g.from}, ${g.to})` }}
        >
          <span className="bh-cover-title" style={{ color: g.ink }}>
            {book.title}
          </span>
        </div>
      )}
      <div className="bh-info">
        <h1 className="bh-title">{book.title}</h1>
        <p className="bh-author">by {book.authorName}</p>
        <div className="bh-meta">
          {book.publishYear !== undefined && <span>{book.publishYear}</span>}
          {book.pageCount !== undefined && <span>{book.pageCount} pages</span>}
          {book.language && <span>{displayLanguage(book.language)}</span>}
          {book.isbn13 && <span className="bh-meta-isbn">ISBN {book.isbn13}</span>}
        </div>
        {chips.length > 0 && (
          <div className="bh-tags">
            {chips.map((t) => (
              <GenrePill
                key={`${t.type}:${t.slug}`}
                label={t.name}
                count={t.applies}
                community={weighted === true && !t.trusted}
              />
            ))}
          </div>
        )}
        {book.blurb && <p className="bh-blurb">{book.blurb}</p>}
      </div>
    </header>
  );
}

const languageNames: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
};

function displayLanguage(code: string): string {
  return languageNames[code] ?? code;
}
