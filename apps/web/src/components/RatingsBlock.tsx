import type { BookRecord } from "../data/book-fixtures";
import "./RatingsBlock.css";

type Props = {
  book: BookRecord;
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function stars(n: number) {
  const full = Math.round(n);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

export function RatingsBlock({ book }: Props) {
  const total = book.distribution.reduce((acc, d) => acc + d.count, 0);
  return (
    <section className="ratings">
      <div className="ratings-aggregate">
        <div className="ratings-num">{book.aggregateRating.toFixed(1)}</div>
        <div className="ratings-stars" aria-hidden="true">
          {stars(book.aggregateRating)}
        </div>
        <div className="ratings-count">{fmt(book.ratingCount)} ratings</div>
      </div>
      <div className="ratings-dist">
        {book.distribution.map((d) => {
          const pct = total === 0 ? 0 : (d.count / total) * 100;
          return (
            <div className="dist-row" key={d.stars}>
              <span className="dist-label">{d.stars}</span>
              <span
                className="dist-track"
                role="img"
                aria-label={`${d.stars} stars: ${d.count} ratings`}
              >
                <span className="dist-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="dist-pct">{Math.round(pct)}%</span>
            </div>
          );
        })}
      </div>
      <div className="ratings-trust" aria-label="Personalized rating">
        <div className="ratings-trust-num">
          {book.trustWeightedRating.toFixed(1)}
        </div>
        <div className="ratings-trust-label">from curators you trust</div>
      </div>
    </section>
  );
}
