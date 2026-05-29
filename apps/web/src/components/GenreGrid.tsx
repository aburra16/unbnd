import "./GenreGrid.css";

export type Genre = {
  slug: string;
  name: string;
  bookCount?: number;
  color: string;
  countColor?: string;
};

type Props = {
  title?: string;
  genres: Genre[];
  seeAllHref?: string;
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export function GenreGrid({ title, genres, seeAllHref }: Props) {
  return (
    <section className="genres-section">
      {title && (
        <header className="genres-header">
          <h2 className="genres-title">{title}</h2>
          {seeAllHref && (
            <a className="genres-seeall" href={seeAllHref}>
              All genres →
            </a>
          )}
        </header>
      )}
      <div className="genres-grid">
        {genres.map((g) => (
          <a
            key={g.slug}
            href={`/genre/${g.slug}`}
            className="genre"
            style={{ background: `${g.color}0F` }}
          >
            <span
              className="genre-accent"
              style={{ background: g.color }}
              aria-hidden="true"
            />
            <h3 className="genre-name" style={{ color: g.color }}>
              {g.name}
            </h3>
            {typeof g.bookCount === "number" && (
              <p
                className="genre-count"
                style={{ color: g.countColor ?? g.color }}
              >
                {fmt(g.bookCount)} books
              </p>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
