import type { RatingsSummary } from "../lib/api";
import "./RatingsBlock.css";

type Props = {
  summary: RatingsSummary;
};

function stars(n: number) {
  const full = Math.round(n);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

export function RatingsBlock({ summary }: Props) {
  if (summary.count === 0 || summary.average === null) {
    return (
      <section className="ratings ratings-empty">
        <p className="ratings-none">No ratings yet. Be the first to rate it.</p>
      </section>
    );
  }
  const label = summary.count === 1 ? "rating" : "ratings";
  return (
    <section className="ratings">
      <div className="ratings-aggregate">
        <div className="ratings-num">{summary.average.toFixed(1)}</div>
        <div className="ratings-stars" aria-hidden="true">
          {stars(summary.average)}
        </div>
        <div className="ratings-count">
          {summary.count.toLocaleString("en-US")} {label}
        </div>
      </div>
    </section>
  );
}
