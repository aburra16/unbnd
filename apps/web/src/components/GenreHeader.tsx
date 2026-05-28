import type { GenreRecord } from "../data/genre-fixtures";
import "./GenreHeader.css";

type Props = {
  genre: GenreRecord;
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export function GenreHeader({ genre }: Props) {
  return (
    <header className="ghead">
      <span
        className="ghead-accent"
        style={{ background: genre.color }}
        aria-hidden="true"
      />
      <div className="ghead-titlerow">
        <h1 className="ghead-title" style={{ color: genre.color }}>
          {genre.name}
        </h1>
        <span className="ghead-count">{fmt(genre.bookCount)} books</span>
      </div>
      <p className="ghead-desc">{genre.description}</p>
    </header>
  );
}
